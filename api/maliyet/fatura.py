"""Gelen gerçek 3PL faturaları ve maliyet kalemi dağılımları."""

import base64
import datetime
import io
import logging
import re

import pdfplumber
from flask import jsonify, request, g

from api.db import get_conn
from api.audit import log_action
from api.kur import get_tcmb_kurlar
from api.maliyet.meta import gecerli_ulke_kodlari
from api.maliyet.hesap import to_eur

GECERLI_PARA_BIRIMLERI = ('EUR', 'USD', 'TRY', 'GEL')


def _parse_date(value):
    try:
        return datetime.date.fromisoformat(str(value or '').strip())
    except ValueError:
        return None


def _parse_pdf_date(value):
    value = str(value or '').strip()
    for fmt in ('%d-%m-%Y', '%d.%m.%Y', '%d/%m/%Y', '%Y-%m-%d'):
        try:
            return datetime.datetime.strptime(value, fmt).date()
        except ValueError:
            pass
    return None


def _parse_amount(value):
    s = re.sub(r'[^\d,.-]', '', str(value or '').strip())
    if not s:
        return None
    if ',' in s and '.' in s:
        s = s.replace('.', '').replace(',', '.') if s.rfind(',') > s.rfind('.') else s.replace(',', '')
    elif ',' in s:
        s = s.replace('.', '').replace(',', '.')
    try:
        return round(float(s), 2)
    except ValueError:
        return None


def _kalemler(cur):
    cur.execute('SELECT id, kod, ad FROM maliyet_kalemleri WHERE aktif ORDER BY sira, id')
    return [{'id': r[0], 'kod': r[1], 'ad': r[2]} for r in cur.fetchall()]


def _tahmin_kalem(aciklama, kalemler):
    """PDF açıklamasını bilinen maliyet kalemine eşler; kullanıcı son kararı verir."""
    text = str(aciklama or '').lower()
    kurallar = (
        (('fuel', 'diesel', 'brandstof', 'yakıt'), 'fuel_surcharge'),
        (('transport', 'delivery', 'nedline', 'freight', 'navlun', 'shipment'), 'transport'),
        (('zatezne', 'kamate', 'carinsko', 'customs', 'tax'), 'taxes'),
        (('storage', 'opslag', 'warehouse', 'skladistenje'), 'storage'),
        (('istovar', 'inbound', 'pallet in'), 'pallet_in'),
        (('utovar', 'outbound', 'pallet out'), 'pallet_out'),
        (('picking', 'pick '), 'picking_line'),
        (('label', 'etiket'), 'labeling'),
        (('pallet exchange', 'europallet'), 'pallet_exchange'),
        (('admin', 'document'), 'admin_fee'),
        (('handling',), 'handling'),
    )
    by_code = {k['kod']: k['id'] for k in kalemler}
    for kelimeler, kod in kurallar:
        if any(k in text for k in kelimeler) and kod in by_code:
            return by_code[kod]
    return None


def _dogrula(body, cur):
    ulke = str(body.get('ulke') or '').strip().lower()
    if ulke not in gecerli_ulke_kodlari():
        return None, f'Geçersiz ülke: {ulke}'
    fatura_no = str(body.get('fatura_no') or '').strip()
    if not fatura_no:
        return None, 'Fatura no zorunlu'
    d_bas = _parse_date(body.get('donem_baslangic'))
    d_bit = _parse_date(body.get('donem_bitis'))
    if not d_bas or not d_bit or d_bas > d_bit:
        return None, 'Geçerli bir dönem aralığı girin (başlangıç ≤ bitiş)'
    para = str(body.get('para_birimi') or '').strip().upper()
    if para not in GECERLI_PARA_BIRIMLERI:
        return None, f'Geçersiz para birimi: {para}'

    cur.execute('SELECT id FROM maliyet_kalemleri')
    gecerli_kalemler = {r[0] for r in cur.fetchall()}
    kalemler = []
    for i, row in enumerate(body.get('kalemler') or []):
        try:
            kalem_id = int(row.get('kalem_id'))
            miktar = float(row.get('miktar') or 1)
            birim_fiyat = float(row.get('birim_fiyat') or 0)
            tutar = float(row.get('tutar'))
        except (TypeError, ValueError):
            return None, f'{i + 1}. fatura kaleminde sayısal alanlar geçersiz'
        if kalem_id not in gecerli_kalemler:
            return None, f'{i + 1}. fatura kaleminde maliyet türü seçilmedi'
        if miktar < 0 or birim_fiyat < 0 or tutar < 0:
            return None, f'{i + 1}. fatura kaleminde negatif değer kullanılamaz'
        aciklama = str(row.get('aciklama') or '').strip()
        if not aciklama:
            return None, f'{i + 1}. fatura kaleminde açıklama zorunlu'
        tarih = _parse_date(row.get('tarih')) if row.get('tarih') else None
        tutar_bam = row.get('tutar_bam')
        try:
            tutar_bam = float(tutar_bam) if tutar_bam not in (None, '') else None
        except (TypeError, ValueError):
            return None, f'{i + 1}. fatura kaleminde BAM tutarı geçersiz'
        if tutar_bam is not None and tutar_bam < 0:
            return None, f'{i + 1}. fatura kaleminde negatif BAM tutarı kullanılamaz'
        kalemler.append({
            'kalem_id': kalem_id, 'tarih': tarih, 'aciklama': aciklama,
            'referans': str(row.get('referans') or '').strip() or None,
            'miktar': miktar, 'birim_fiyat': birim_fiyat, 'tutar': tutar, 'sira': i,
            'tutar_bam': tutar_bam,
        })
    if not kalemler:
        return None, 'Faturayı en az bir maliyet kalemine dağıtın'

    return {
        'ulke': ulke, 'fatura_no': fatura_no, 'donem_baslangic': d_bas,
        'donem_bitis': d_bit, 'tutar': round(sum(k['tutar'] for k in kalemler), 2),
        'para_birimi': para,
        'fatura_tarihi': _parse_date(body.get('fatura_tarihi')) if body.get('fatura_tarihi') else None,
        'notlar': str(body.get('notlar') or '').strip() or None,
        'kalemler': kalemler,
    }, None


def _satirlari_yaz(cur, fatura_id, satirlar):
    from api.maliyet.bosna_excel import ensure_tutar_bam_kolon
    ensure_tutar_bam_kolon(cur)
    cur.execute('DELETE FROM maliyet_fatura_kalemleri WHERE fatura_id = %s', (fatura_id,))
    for s in satirlar:
        cur.execute('''
            INSERT INTO maliyet_fatura_kalemleri
                (fatura_id, kalem_id, tarih, aciklama, referans, miktar, birim_fiyat, tutar, sira, tutar_bam)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ''', (fatura_id, s['kalem_id'], s['tarih'], s['aciklama'], s['referans'],
              s['miktar'], s['birim_fiyat'], s['tutar'], s['sira'], s.get('tutar_bam')))


def maliyet_fatura_get():
    ulke = str(request.args.get('ulke') or '').strip().lower()
    where, params = [], []
    if ulke:
        if ulke not in gecerli_ulke_kodlari():
            return jsonify({'success': False, 'error': f'Geçersiz ülke: {ulke}'}), 400
        where.append('f.ulke = %s'); params.append(ulke)
    start, end = _parse_date(request.args.get('start')), _parse_date(request.args.get('end'))
    # Tümü / özet ile aynı etkin tarih: fatura_tarihi yoksa dönem bitişi
    if start and end:
        where.append('COALESCE(f.fatura_tarihi, f.donem_bitis) BETWEEN %s AND %s')
        params.extend([start, end])
    elif start:
        where.append('COALESCE(f.fatura_tarihi, f.donem_bitis) >= %s'); params.append(start)
    elif end:
        where.append('COALESCE(f.fatura_tarihi, f.donem_bitis) <= %s'); params.append(end)

    conn = get_conn(); cur = conn.cursor()
    try:
        cur.execute(f'''
            SELECT f.id, f.ulke, f.fatura_no, f.donem_baslangic, f.donem_bitis,
                   f.tutar, f.para_birimi, f.fatura_tarihi, f.notlar
            FROM maliyet_faturalari f {('WHERE ' + ' AND '.join(where)) if where else ''}
            ORDER BY COALESCE(f.fatura_tarihi, f.donem_bitis) DESC, f.id DESC LIMIT 300
        ''', params)
        faturalar = []
        for r in cur.fetchall():
            cur.execute('''
                SELECT fk.id, fk.kalem_id, k.ad, k.kod, fk.tarih, fk.aciklama, fk.referans,
                       fk.miktar, fk.birim_fiyat, fk.tutar
                FROM maliyet_fatura_kalemleri fk JOIN maliyet_kalemleri k ON k.id=fk.kalem_id
                WHERE fk.fatura_id=%s ORDER BY fk.sira, fk.id
            ''', (r[0],))
            satirlar = [{'id': x[0], 'kalem_id': x[1], 'kalem_ad': x[2], 'kalem_kod': x[3] or '',
                         'tarih': x[4].isoformat() if x[4] else None, 'aciklama': x[5],
                         'referans': x[6], 'miktar': float(x[7]), 'birim_fiyat': float(x[8]),
                         'tutar': float(x[9])} for x in cur.fetchall()]
            faturalar.append({'id': r[0], 'ulke': r[1], 'fatura_no': r[2],
                'donem_baslangic': r[3].isoformat(), 'donem_bitis': r[4].isoformat(),
                'tutar': float(r[5]), 'para_birimi': r[6],
                'fatura_tarihi': r[7].isoformat() if r[7] else None, 'notlar': r[8],
                'kalemler': satirlar})
    finally:
        cur.close(); conn.close()
    return jsonify({'success': True, 'faturalar': faturalar})


def maliyet_fatura_post():
    conn = get_conn(); cur = conn.cursor()
    try:
        alanlar, hata = _dogrula(request.get_json(silent=True) or {}, cur)
        if hata: return jsonify({'success': False, 'error': hata}), 400
        cur.execute(
            'SELECT id FROM maliyet_faturalari WHERE ulke = %s AND fatura_no = %s LIMIT 1',
            (alanlar['ulke'], alanlar['fatura_no']),
        )
        if cur.fetchone():
            return jsonify({
                'success': True, 'kod': 'mevcut', 'atlandi': True,
                'error': 'Bu fatura zaten kayıtlı. Mevcut kayıt korundu, üzerine yazılmadı.',
            })
        cur.execute('''INSERT INTO maliyet_faturalari
            (ulke,fatura_no,donem_baslangic,donem_bitis,tutar,para_birimi,fatura_tarihi,notlar)
            VALUES (%(ulke)s,%(fatura_no)s,%(donem_baslangic)s,%(donem_bitis)s,%(tutar)s,
                    %(para_birimi)s,%(fatura_tarihi)s,%(notlar)s) RETURNING id''', alanlar)
        fatura_id = cur.fetchone()[0]
        _satirlari_yaz(cur, fatura_id, alanlar['kalemler']); conn.commit()
        log_action(getattr(g, 'user', None), 'maliyet_fatura',
                   f"Fatura girdi: {alanlar['ulke']} / {alanlar['fatura_no']} / {len(alanlar['kalemler'])} kalem")
        return jsonify({'success': True, 'id': fatura_id, 'tutar': alanlar['tutar']})
    except Exception:
        conn.rollback()
        logging.exception('maliyet fatura kaydı')
        return jsonify({'success': False, 'error': 'Fatura kaydedilemedi. Tekrar deneyin.'}), 500
    finally:
        cur.close(); conn.close()


def maliyet_fatura_put(fatura_id):
    conn = get_conn(); cur = conn.cursor()
    try:
        alanlar, hata = _dogrula(request.get_json(silent=True) or {}, cur)
        if hata: return jsonify({'success': False, 'error': hata}), 400
        cur.execute('''UPDATE maliyet_faturalari SET ulke=%(ulke)s,fatura_no=%(fatura_no)s,
            donem_baslangic=%(donem_baslangic)s,donem_bitis=%(donem_bitis)s,tutar=%(tutar)s,
            para_birimi=%(para_birimi)s,fatura_tarihi=%(fatura_tarihi)s,notlar=%(notlar)s
            WHERE id=%(id)s''', {**alanlar, 'id': fatura_id})
        if not cur.rowcount: return jsonify({'success': False, 'error': 'Fatura bulunamadı'}), 404
        _satirlari_yaz(cur, fatura_id, alanlar['kalemler']); conn.commit()
        return jsonify({'success': True, 'tutar': alanlar['tutar']})
    except Exception:
        conn.rollback()
        logging.exception('maliyet fatura güncelleme')
        return jsonify({'success': False, 'error': 'Fatura güncellenemedi. Tekrar deneyin.'}), 500
    finally:
        cur.close(); conn.close()


def maliyet_fatura_delete(fatura_id):
    conn = get_conn(); cur = conn.cursor()
    try:
        cur.execute('DELETE FROM maliyet_faturalari WHERE id=%s RETURNING ulke,fatura_no', (fatura_id,))
        row = cur.fetchone()
        if not row: return jsonify({'success': False, 'error': 'Fatura bulunamadı'}), 404
        conn.commit(); log_action(getattr(g, 'user', None), 'maliyet_fatura', f'Fatura sildi: {row[0]} / {row[1]}')
        return jsonify({'success': True})
    finally:
        cur.close(); conn.close()


def _ocr_pdf_text(pdf_bytes, max_pages=3):
    import os
    import subprocess
    import tempfile
    try:
        with tempfile.TemporaryDirectory() as td:
            src = os.path.join(td, 'in.pdf')
            with open(src, 'wb') as f:
                f.write(pdf_bytes)
            subprocess.run(
                ['pdftoppm', '-png', '-r', '180', '-f', '1', '-l', str(max_pages),
                 src, os.path.join(td, 'p')],
                check=False, capture_output=True, timeout=90,
            )
            parts = []
            for name in sorted(os.listdir(td)):
                if not name.endswith('.png'):
                    continue
                r = subprocess.run(
                    ['tesseract', os.path.join(td, name), 'stdout', '-l', 'eng', '--psm', '6'],
                    capture_output=True, text=True, timeout=90,
                )
                parts.append(r.stdout or '')
            return '\n'.join(parts)
    except Exception:
        logging.exception('pdf ocr')
        return ''


def _extract_pdf_text(pdf_bytes):
    text = ''
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            text = '\n'.join((p.extract_text(x_tolerance=2, y_tolerance=3) or '') for p in pdf.pages)
    except Exception:
        text = ''
    if len((text or '').strip()) >= 40:
        return text, False
    ocr = _ocr_pdf_text(pdf_bytes)
    if len((ocr or '').strip()) > len((text or '').strip()):
        return ocr, True
    return text or '', False


def _tahmin_ulke_pdf(low, ulke_hint=None):
    hint = str(ulke_hint or '').strip().lower()
    if any(k in low for k in ('nedline', 'nieuw-vennep', 'nieuw vennep')):
        return 'nl', None
    if any(k in low for k in ('dardania logistics', 'fature shitje', 'prishtin')):
        return 'xk', None
    if any(k in low for k in ('militzer', 'm&m', 'madame coco nmk', 'skopje', 'tetovo')):
        return 'mk', None
    if any(k in low for k in ('idms', 'europese unie', 'aangever', 'soort aangifte')):
        return 'be', 'Bu belge gümrük bildirimi (IDMS) gibi duruyor; 3PL/nakliye faturası değil.'
    if any(k in low for k in ('tvp-logistics', 'van praet', 'belgi', 'antwerp', 'antwerpen', 'brussel', 'vilvoorde')):
        return 'be', None
    if any(k in low for k in ('deutschland', 'germany', 'hamburg', 'duisburg')):
        return 'de', None
    if any(k in low for k in ('georgia', 'tbilisi')) or ('gel' in low and 'deha' in low):
        return 'ge', None
    if 'ინვოისი' in low or 'ნეტო' in low:
        return 'ge', None
    if any(k in low for k in ('serbia', 'beograd', 'belgrade', 'srbija')):
        return 'rs', None
    if any(k in low for k in ('kazakhstan', 'almaty', 'astana')):
        return 'kz', None
    if any(k in low for k in ('bosna', 'sarajevo')):
        return 'ba', None
    if hint in gecerli_ulke_kodlari():
        return hint, None
    return None, None


def parse_maliyet_pdf(pdf_bytes, ulke_hint=None, filename=None):
    """PDF → fatura taslağı (kalem_kod ile). (draft, ulke_tahmini, error)."""
    if not pdf_bytes:
        return None, None, 'PDF boş'
    text, ocr_used = _extract_pdf_text(pdf_bytes)
    low = (text or '').lower()
    ulke_tahmini, uyari = _tahmin_ulke_pdf(low, ulke_hint)
    draft = None

    try:
        if ulke_tahmini == 'ge' or 'ინვოისი' in (text or '') or re.search(r'18,0\s*%\s*GE', text or ''):
            from api.maliyet.gurcistan import parse_ge_invoice_pdf
            ge = parse_ge_invoice_pdf(pdf_bytes)
            if ge.get('kalemler') or ge.get('fatura_no'):
                draft = ge
                ulke_tahmini = 'ge'
        if draft is None and (ulke_tahmini == 'be' or 'tvp-logistics' in low or 'van praet' in low):
            from api.maliyet.belcika import parse_tvp_invoice_pdf
            be = parse_tvp_invoice_pdf(pdf_bytes)
            if be.get('kalemler') or be.get('fatura_no'):
                draft = be
                ulke_tahmini = 'be'
        if draft is None and (ulke_tahmini == 'nl' or 'nedline' in low):
            from api.maliyet.hollanda import parse_nedline_invoice_pdf
            nl = parse_nedline_invoice_pdf(pdf_bytes)
            if nl.get('kalemler') or nl.get('fatura_no'):
                draft = nl
                ulke_tahmini = 'nl'
        if draft is None and (ulke_tahmini == 'xk' or 'fature shitje' in low or 'dardania' in low):
            from api.maliyet.kosova import parse_dardania_fature_pdf
            xk = parse_dardania_fature_pdf(pdf_bytes)
            if xk.get('kalemler') or xk.get('fatura_no'):
                draft = xk
                ulke_tahmini = 'xk'
        if draft is None and (ulke_tahmini == 'mk' or 'militzer' in low or 'bglg' in (filename or '').lower()):
            from api.maliyet.makedonya import parse_bglg_upload
            mk = parse_bglg_upload(pdf_bytes, filename, text)
            if mk and (mk.get('kalemler') or mk.get('fatura_no')):
                draft = mk
                ulke_tahmini = 'mk'
    except Exception:
        logging.exception('parse_maliyet_pdf country')

    if draft and draft.get('kalemler'):
        extra = {}
        if uyari:
            extra['_uyari'] = uyari
        if ocr_used:
            extra['_ocr'] = True
        if extra:
            draft = {**draft, **extra}
        return draft, ulke_tahmini, None

    if not (text or '').strip():
        return None, ulke_tahmini, 'PDF metin içermiyor; taranmış görsel okunamadı'

    invoice_no = None
    for pat in (r'Invoice\s*(?:nr|no|number)\s*[:.]?\s*([A-Z0-9-]+)', r'Fatura\s*(?:No|Numarası)\s*[:.]?\s*([A-Z0-9-]+)'):
        m = re.search(pat, text, re.I)
        if m:
            invoice_no = m.group(1)
            break
    header_date = None
    m = re.search(r'(?:Invoice\s+)?Date\s*[:.]?\s*(\d{2}[-./]\d{2}[-./]\d{4})', text, re.I)
    if m:
        header_date = _parse_pdf_date(m.group(1))
    satirlar = []
    lines = [re.sub(r'\s+', ' ', x).strip() for x in text.splitlines() if x.strip()]
    for line in lines:
        m = re.match(r'^(\d{2}[-./]\d{2}[-./]\d{4})\s+(.+?)\s+([\d.]+,\d{2})$', line)
        if not m:
            continue
        tarih, orta, amount_text = _parse_pdf_date(m.group(1)), m.group(2), m.group(3)
        amount = _parse_amount(amount_text)
        if amount is None:
            continue
        ref = None
        rm = re.search(r'\b([A-Z]{2,}(?:-[A-Z0-9]+)+)\b', orta)
        if rm:
            ref = rm.group(1)
        aciklama = re.sub(r'\s+\d+(?:[.,]\d+)?\s+pallets?\s*$', '', orta, flags=re.I).strip()
        satirlar.append({
            'tarih': tarih.isoformat() if tarih else None, 'aciklama': aciklama,
            'referans': ref, 'miktar': 1, 'birim_fiyat': amount, 'tutar': amount,
            'kalem_kod': None,
        })
    dates = [_parse_date(s['tarih']) for s in satirlar if s['tarih']]
    dates = [d for d in dates if d]
    if not satirlar and not invoice_no:
        return None, ulke_tahmini, 'Fatura satırları otomatik ayrıştırılamadı'
    d_bas = min(dates).isoformat() if dates else None
    d_bit = max(dates).isoformat() if dates else None
    return {
        'ulke': ulke_tahmini or ulke_hint,
        'fatura_no': invoice_no or '',
        'fatura_tarihi': header_date.isoformat() if header_date else None,
        'donem_baslangic': d_bas, 'donem_bitis': d_bit,
        'para_birimi': 'EUR',
        'tutar': round(sum(s['tutar'] for s in satirlar), 2),
        'kalemler': satirlar,
        'kaynak': 'pdf-generic',
        '_uyari': uyari or (None if satirlar else 'Fatura satırları otomatik ayrıştırılamadı; manuel kalem ekleyin.'),
        '_ocr': ocr_used,
    }, ulke_tahmini, None


def maliyet_fatura_pdf_post():
    """PDF'yi kaydetmeden okur ve kullanıcıya düzenlenebilir fatura taslağı döner."""
    body = request.get_json(silent=True) or {}
    try:
        pdf_bytes = base64.b64decode(body.get('pdf') or '', validate=True)
    except Exception:
        return jsonify({'success': False, 'error': 'PDF verisi geçersiz'}), 400
    if not pdf_bytes or len(pdf_bytes) > 15 * 1024 * 1024:
        return jsonify({'success': False, 'error': 'PDF boş veya 15 MB sınırını aşıyor'}), 400
    filename = str(body.get('dosya') or body.get('filename') or '')
    draft, ulke_tahmini, err = parse_maliyet_pdf(
        pdf_bytes, ulke_hint=body.get('ulke'), filename=filename)
    if err:
        return jsonify({'success': False, 'error': err}), 400
    draft = draft or {}
    uyari = draft.get('_uyari')
    conn = get_conn(); cur = conn.cursor()
    try:
        kalemler = _kalemler(cur)
    finally:
        cur.close(); conn.close()
    by_kod = {k['kod']: k['id'] for k in kalemler}
    satirlar = []
    for row in draft.get('kalemler') or []:
        kid = row.get('kalem_id') or by_kod.get(row.get('kalem_kod')) or _tahmin_kalem(row.get('aciklama'), kalemler)
        satirlar.append({
            'tarih': row.get('tarih') or draft.get('donem_bitis'),
            'aciklama': row.get('aciklama') or '',
            'referans': row.get('referans'),
            'miktar': row.get('miktar') or 1,
            'birim_fiyat': row.get('birim_fiyat') or row.get('tutar'),
            'tutar': row.get('tutar'),
            'kalem_id': kid,
            'kalem_kod': row.get('kalem_kod'),
        })
    return jsonify({
        'success': True,
        'taslak': {
            'ulke': draft.get('ulke') or ulke_tahmini or str(body.get('ulke') or '').strip().lower() or None,
            'fatura_no': draft.get('fatura_no') or '',
            'fatura_tarihi': draft.get('fatura_tarihi'),
            'donem_baslangic': draft.get('donem_baslangic'),
            'donem_bitis': draft.get('donem_bitis'),
            'para_birimi': draft.get('para_birimi') or 'EUR',
            'tutar': draft.get('tutar') or 0,
            'kalemler': satirlar,
        },
        'uyari': uyari,
        'ulke_tahmini': ulke_tahmini,
    })


def maliyet_gercek_get():
    """Ülke ve maliyet kalemi bazında yalnızca gerçekleşen tutarları döner."""
    start, end = _parse_date(request.args.get('start')), _parse_date(request.args.get('end'))
    if not start or not end or start > end:
        return jsonify({'success': False, 'error': 'Geçerli bir tarih aralığı girin'}), 400
    kurlar = get_tcmb_kurlar(); conn = get_conn(); cur = conn.cursor()
    try:
        cur.execute('''SELECT f.ulke,f.id,f.fatura_no,f.para_birimi,f.tutar,
                              fk.kalem_id,k.ad,k.kod,fk.tutar,
                              COALESCE(f.fatura_tarihi,f.donem_bitis)
                       FROM maliyet_faturalari f
                       LEFT JOIN maliyet_fatura_kalemleri fk ON fk.fatura_id=f.id
                       LEFT JOIN maliyet_kalemleri k ON k.id=fk.kalem_id
                       WHERE COALESCE(f.fatura_tarihi,f.donem_bitis) BETWEEN %s AND %s
                       ORDER BY f.ulke,f.id,fk.sira''', (start, end))
        ulkeler, tum_kalemler, aylik = {}, {}, {}
        gorulen = set()
        dagitilmis_eur = 0.0
        for ulke, fid, fno, para, ftop, kid, kad, kkod, ktutar, etkin_tarih in cur.fetchall():
            u = ulkeler.setdefault(ulke, {'ulke': ulke, 'fatura_sayisi': 0, 'gercek_eur': 0.0,
                                         'eur_eksik': False, 'dagitilmamis': 0, 'kalemler': {}})
            if fid not in gorulen:
                gorulen.add(fid); u['fatura_sayisi'] += 1
                e = to_eur(float(ftop), para, kurlar)
                if e is None: u['eur_eksik'] = True
                else:
                    u['gercek_eur'] += e
                    ay = etkin_tarih.strftime('%Y-%m')
                    a = aylik.setdefault(ay, {'ay': ay, 'toplam_eur': 0.0, 'ulkeler': {}})
                    a['toplam_eur'] += e
                    a['ulkeler'][ulke] = a['ulkeler'].get(ulke, 0.0) + e
            if kid is None:
                u['dagitilmamis'] += 1
                e = to_eur(float(ftop), para, kurlar)
                if e is not None:
                    item = u['kalemler'].setdefault(0, {'kalem_id': 0, 'kalem_ad': 'Dağıtılmamış', 'kalem_kod': '', 'tutar_eur': 0.0})
                    item['tutar_eur'] += e
                    genel = tum_kalemler.setdefault(0, {'kalem_id': 0, 'kalem_ad': 'Dağıtılmamış', 'kalem_kod': '', 'tutar_eur': 0.0, 'ulkeler': {}})
                    genel['tutar_eur'] += e
                    genel['ulkeler'][ulke] = genel['ulkeler'].get(ulke, 0.0) + e
            else:
                e = to_eur(float(ktutar), para, kurlar)
                item = u['kalemler'].setdefault(kid, {'kalem_id': kid, 'kalem_ad': kad, 'kalem_kod': kkod or '', 'tutar_eur': 0.0})
                if e is not None:
                    item['tutar_eur'] += e
                    dagitilmis_eur += e
                    genel = tum_kalemler.setdefault(kid, {'kalem_id': kid, 'kalem_ad': kad, 'kalem_kod': kkod or '', 'tutar_eur': 0.0, 'ulkeler': {}})
                    genel['tutar_eur'] += e
                    genel['ulkeler'][ulke] = genel['ulkeler'].get(ulke, 0.0) + e
        labels = {}
        from api.maliyet.meta import kurumsal_ulkeler
        labels = {u['kod']: u['label'] for u in kurumsal_ulkeler()}
        out = []
        for kod, u in ulkeler.items():
            u['label'] = labels.get(kod, kod); u['gercek_eur'] = None if u.pop('eur_eksik') else round(u['gercek_eur'], 2)
            u['kalemler'] = sorted(({**x, 'tutar_eur': round(x['tutar_eur'], 2)} for x in u['kalemler'].values()), key=lambda x: -x['tutar_eur'])
            out.append(u)
        out.sort(key=lambda u: u['label'])
        genel_toplam = round(sum((u['gercek_eur'] or 0) for u in out), 2)
        kalem_out = sorted(({
            **x, 'tutar_eur': round(x['tutar_eur'], 2),
            'ulkeler': {k: round(v, 2) for k, v in x['ulkeler'].items()},
            'oran': round(x['tutar_eur'] / genel_toplam * 100, 1) if genel_toplam else 0,
        } for x in tum_kalemler.values()), key=lambda x: -x['tutar_eur'])
        aylik_out = [{**a, 'toplam_eur': round(a['toplam_eur'], 2),
                      'ulkeler': {k: round(v, 2) for k, v in a['ulkeler'].items()}}
                     for _, a in sorted(aylik.items())]
        en_yuksek_ulke = max(out, key=lambda x: x['gercek_eur'] or 0, default=None)
        en_yuksek_kalem = kalem_out[0] if kalem_out else None
        ozet = {
            'gercek_toplam_eur': genel_toplam,
            'fatura_sayisi': sum(u['fatura_sayisi'] for u in out),
            'ulke_sayisi': len(out),
            'ortalama_fatura_eur': round(genel_toplam / len(gorulen), 2) if gorulen else 0,
            'dagitim_orani': round(dagitilmis_eur / genel_toplam * 100, 1) if genel_toplam else 0,
            'en_yuksek_ulke': en_yuksek_ulke['label'] if en_yuksek_ulke else None,
            'en_yuksek_kalem': en_yuksek_kalem['kalem_ad'] if en_yuksek_kalem else None,
        }
    finally:
        cur.close(); conn.close()
    return jsonify({'success': True, 'start': start.isoformat(), 'end': end.isoformat(),
                    'ulkeler': out, 'kalemler': kalem_out, 'aylik': aylik_out,
                    'ozet': ozet, 'kurlar': kurlar})

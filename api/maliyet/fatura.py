"""Gelen gerçek 3PL faturaları ve maliyet kalemi dağılımları."""

import base64
import datetime
import io
import re

import pdfplumber
from flask import jsonify, request, g

from api.db import get_conn
from api.audit import log_action
from api.kur import get_tcmb_kurlar
from api.maliyet.meta import gecerli_ulke_kodlari
from api.maliyet.hesap import to_eur

GECERLI_PARA_BIRIMLERI = ('EUR', 'USD', 'TRY')


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
        (('storage', 'opslag', 'warehouse'), 'storage'),
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
        kalemler.append({
            'kalem_id': kalem_id, 'tarih': tarih, 'aciklama': aciklama,
            'referans': str(row.get('referans') or '').strip() or None,
            'miktar': miktar, 'birim_fiyat': birim_fiyat, 'tutar': tutar, 'sira': i,
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
    cur.execute('DELETE FROM maliyet_fatura_kalemleri WHERE fatura_id = %s', (fatura_id,))
    for s in satirlar:
        cur.execute('''
            INSERT INTO maliyet_fatura_kalemleri
                (fatura_id, kalem_id, tarih, aciklama, referans, miktar, birim_fiyat, tutar, sira)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ''', (fatura_id, s['kalem_id'], s['tarih'], s['aciklama'], s['referans'],
              s['miktar'], s['birim_fiyat'], s['tutar'], s['sira']))


def maliyet_fatura_get():
    ulke = str(request.args.get('ulke') or '').strip().lower()
    where, params = [], []
    if ulke:
        if ulke not in gecerli_ulke_kodlari():
            return jsonify({'success': False, 'error': f'Geçersiz ülke: {ulke}'}), 400
        where.append('f.ulke = %s'); params.append(ulke)
    start, end = _parse_date(request.args.get('start')), _parse_date(request.args.get('end'))
    if start: where.append('f.donem_bitis >= %s'); params.append(start)
    if end: where.append('f.donem_baslangic <= %s'); params.append(end)

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
                SELECT fk.id, fk.kalem_id, k.ad, fk.tarih, fk.aciklama, fk.referans,
                       fk.miktar, fk.birim_fiyat, fk.tutar
                FROM maliyet_fatura_kalemleri fk JOIN maliyet_kalemleri k ON k.id=fk.kalem_id
                WHERE fk.fatura_id=%s ORDER BY fk.sira, fk.id
            ''', (r[0],))
            satirlar = [{'id': x[0], 'kalem_id': x[1], 'kalem_ad': x[2],
                         'tarih': x[3].isoformat() if x[3] else None, 'aciklama': x[4],
                         'referans': x[5], 'miktar': float(x[6]), 'birim_fiyat': float(x[7]),
                         'tutar': float(x[8])} for x in cur.fetchall()]
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
        conn.rollback(); raise
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
        conn.rollback(); raise
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


def maliyet_fatura_pdf_post():
    """PDF'yi kaydetmeden okur ve kullanıcıya düzenlenebilir fatura taslağı döner."""
    body = request.get_json(silent=True) or {}
    try:
        pdf_bytes = base64.b64decode(body.get('pdf') or '', validate=True)
    except Exception:
        return jsonify({'success': False, 'error': 'PDF verisi geçersiz'}), 400
    if not pdf_bytes or len(pdf_bytes) > 15 * 1024 * 1024:
        return jsonify({'success': False, 'error': 'PDF boş veya 15 MB sınırını aşıyor'}), 400
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            text = '\n'.join((p.extract_text(x_tolerance=2, y_tolerance=3) or '') for p in pdf.pages)
    except Exception as e:
        return jsonify({'success': False, 'error': f'PDF okunamadı: {e}'}), 400
    if not text.strip():
        return jsonify({'success': False, 'error': 'PDF metin içermiyor; taranmış görsel PDF henüz desteklenmiyor'}), 400

    invoice_no = None
    for pat in (r'Invoice\s*(?:nr|no|number)\s*[:.]?\s*([A-Z0-9-]+)', r'Fatura\s*(?:No|Numarası)\s*[:.]?\s*([A-Z0-9-]+)'):
        m = re.search(pat, text, re.I)
        if m: invoice_no = m.group(1); break
    header_date = None
    m = re.search(r'(?:Invoice\s+)?Date\s*[:.]?\s*(\d{2}[-./]\d{2}[-./]\d{4})', text, re.I)
    if m: header_date = _parse_pdf_date(m.group(1))

    satirlar = []
    lines = [re.sub(r'\s+', ' ', x).strip() for x in text.splitlines() if x.strip()]
    for line in lines:
        m = re.match(r'^(\d{2}[-./]\d{2}[-./]\d{4})\s+(.+?)\s+([\d.]+,\d{2})$', line)
        if not m: continue
        tarih, orta, amount_text = _parse_pdf_date(m.group(1)), m.group(2), m.group(3)
        amount = _parse_amount(amount_text)
        if amount is None: continue
        ref = None
        rm = re.search(r'\b([A-Z]{2,}(?:-[A-Z0-9]+)+)\b', orta)
        if rm: ref = rm.group(1)
        aciklama = re.sub(r'\s+\d+(?:[.,]\d+)?\s+pallets?\s*$', '', orta, flags=re.I).strip()
        satirlar.append({'tarih': tarih.isoformat() if tarih else None, 'aciklama': aciklama,
                         'referans': ref, 'miktar': 1, 'birim_fiyat': amount, 'tutar': amount})

    conn = get_conn(); cur = conn.cursor()
    try:
        kalemler = _kalemler(cur)
    finally:
        cur.close(); conn.close()
    for s in satirlar: s['kalem_id'] = _tahmin_kalem(s['aciklama'], kalemler)
    dates = [_parse_date(s['tarih']) for s in satirlar if s['tarih']]
    return jsonify({'success': True, 'taslak': {
        'fatura_no': invoice_no or '', 'fatura_tarihi': header_date.isoformat() if header_date else None,
        'donem_baslangic': min(dates).isoformat() if dates else None,
        'donem_bitis': max(dates).isoformat() if dates else None,
        'para_birimi': 'EUR', 'tutar': round(sum(s['tutar'] for s in satirlar), 2),
        'kalemler': satirlar,
    }, 'uyari': None if satirlar else 'Fatura satırları otomatik ayrıştırılamadı; manuel kalem ekleyin.'})


def maliyet_gercek_get():
    """Ülke ve maliyet kalemi bazında yalnızca gerçekleşen tutarları döner."""
    start, end = _parse_date(request.args.get('start')), _parse_date(request.args.get('end'))
    if not start or not end or start > end:
        return jsonify({'success': False, 'error': 'Geçerli bir tarih aralığı girin'}), 400
    kurlar = get_tcmb_kurlar(); conn = get_conn(); cur = conn.cursor()
    try:
        cur.execute('''SELECT f.ulke,f.id,f.fatura_no,f.para_birimi,f.tutar,
                              fk.kalem_id,k.ad,fk.tutar,
                              COALESCE(f.fatura_tarihi,f.donem_bitis)
                       FROM maliyet_faturalari f
                       LEFT JOIN maliyet_fatura_kalemleri fk ON fk.fatura_id=f.id
                       LEFT JOIN maliyet_kalemleri k ON k.id=fk.kalem_id
                       WHERE COALESCE(f.fatura_tarihi,f.donem_bitis) BETWEEN %s AND %s
                       ORDER BY f.ulke,f.id,fk.sira''', (start, end))
        ulkeler, tum_kalemler, aylik = {}, {}, {}
        gorulen = set()
        dagitilmis_eur = 0.0
        for ulke, fid, fno, para, ftop, kid, kad, ktutar, etkin_tarih in cur.fetchall():
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
                    item = u['kalemler'].setdefault(0, {'kalem_id': 0, 'kalem_ad': 'Dağıtılmamış', 'tutar_eur': 0.0})
                    item['tutar_eur'] += e
                    genel = tum_kalemler.setdefault(0, {'kalem_id': 0, 'kalem_ad': 'Dağıtılmamış', 'tutar_eur': 0.0, 'ulkeler': {}})
                    genel['tutar_eur'] += e
                    genel['ulkeler'][ulke] = genel['ulkeler'].get(ulke, 0.0) + e
            else:
                e = to_eur(float(ktutar), para, kurlar)
                item = u['kalemler'].setdefault(kid, {'kalem_id': kid, 'kalem_ad': kad, 'tutar_eur': 0.0})
                if e is not None:
                    item['tutar_eur'] += e
                    dagitilmis_eur += e
                    genel = tum_kalemler.setdefault(kid, {'kalem_id': kid, 'kalem_ad': kad, 'tutar_eur': 0.0, 'ulkeler': {}})
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

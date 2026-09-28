# api/maliyet/tablo_drop.py
# Ülke tablosuna Excel/PDF bırakma: yalnızca boş hücreleri doldurur.
# Kayıtlı fatura asla revize edilmez.

import calendar
import logging
import re
from copy import deepcopy

from flask import jsonify, request, g

from api.audit import log_action
from api.db import get_conn
from api.maliyet.hesap import to_eur
from api.maliyet.ulke_tablo import (
    ULKE_TABLO_SCHEMA, _ay_bos, _ay_hesap, _schema, tablo_kaydet, tablo_yukle,
)

MAX_BYTES = 15 * 1024 * 1024


def _hucre_dolu(cell):
    cell = cell or {}
    try:
        miktar = float(cell.get('miktar') or 0)
        tutar = float(cell.get('tutar') or 0)
    except (TypeError, ValueError):
        return False
    return abs(miktar) > 0.0001 or abs(tutar) > 0.005


def _map_kalem(ulke, kod):
    """(tablo_kod, miktar_ekle) veya None — taxes L/T dışı."""
    kod = str(kod or '').strip().lower()
    if not kod or kod in ('taxes',):
        return None
    if ulke == 'mk' and kod == 'storage':
        return 'inbound', True
    if kod in ('pallet_in', 'box_in', 'inbound'):
        return 'inbound', True
    if kod in ('pallet_out', 'box_out', 'outbound'):
        return 'outbound', True
    if kod in ('storage', 'depolama'):
        return 'storage', True
    if ulke == 'be' and kod in ('handling', 'labeling'):
        return 'storage', False
    if kod == 'transport':
        return 'transport', True
    if kod in ('handling', 'fuel_surcharge'):
        return 'transport', False
    return kod, True


def _tutar_eur(tutar, para):
    para = str(para or 'EUR').upper()
    n = float(tutar or 0)
    if para == 'EUR':
        return n
    e = to_eur(n, para)
    return float(e) if e is not None else n


def draft_to_ay(ulke, draft, schema_kodlar):
    ay = (
        (draft.get('donem_baslangic') or draft.get('donem_bitis')
         or draft.get('fatura_tarihi') or draft.get('ay') or '')
    )[:7]
    if not re.fullmatch(r'20\d{2}-\d{2}', ay):
        return None
    bag = {k: {'miktar': 0.0, 'tutar': 0.0} for k in schema_kodlar}
    para = draft.get('para_birimi') or 'EUR'
    for k in draft.get('kalemler') or []:
        mapped = _map_kalem(ulke, k.get('kalem_kod'))
        if not mapped:
            continue
        tablo_kod, qty_ekle = mapped
        if tablo_kod not in bag:
            continue
        tutar = _tutar_eur(k.get('tutar') or 0, para)
        miktar = float(k.get('miktar') or 0)
        bag[tablo_kod]['tutar'] += tutar
        if qty_ekle:
            bag[tablo_kod]['miktar'] += miktar
    row = {'ay': ay, 'ciro_eur': float(draft.get('ciro_eur') or 0)}
    for kod in schema_kodlar:
        row[kod] = {
            'miktar': round(bag[kod]['miktar'], 4),
            'tutar': round(bag[kod]['tutar'], 2),
        }
    return row


def tablo_bos_doldur(ulke, gelen_aylar):
    """Mevcut dolu hücrelere dokunmadan boş qty/cost çiftlerini yazar."""
    schema = _schema(ulke)
    items = schema['items']
    kodlar = [it['kod'] for it in items]
    mevcut = tablo_yukle(ulke)
    by = {a['ay']: deepcopy(a) for a in (mevcut.get('aylar') or []) if a.get('ay')}
    doldurulan = []
    atlanan = []
    for raw in gelen_aylar or []:
        ay = str((raw or {}).get('ay') or '')
        if not re.fullmatch(r'20\d{2}-\d{2}', ay):
            continue
        if ay not in by:
            by[ay] = _ay_bos(ay, items)
        dest = by[ay]
        for kod in kodlar:
            src = raw.get(kod) or {}
            try:
                src_m = float(src.get('miktar') or 0)
                src_t = float(src.get('tutar') or 0)
            except (TypeError, ValueError):
                continue
            if src_m <= 0.0001 and src_t <= 0.005:
                continue
            if _hucre_dolu(dest.get(kod)):
                atlanan.append({'ay': ay, 'kod': kod, 'neden': 'dolu'})
                continue
            dest[kod] = {'miktar': round(src_m, 4), 'tutar': round(src_t, 2)}
            doldurulan.append({'ay': ay, 'kod': kod, 'miktar': src_m, 'tutar': src_t})
        src_c = float(raw.get('ciro_eur') or 0)
        if src_c > 0.005:
            if float(dest.get('ciro_eur') or 0) > 0.005:
                atlanan.append({'ay': ay, 'kod': 'ciro', 'neden': 'dolu'})
            else:
                dest['ciro_eur'] = round(src_c, 2)
                doldurulan.append({'ay': ay, 'kod': 'ciro', 'tutar': src_c})
        _ay_hesap(dest, items)
    if doldurulan:
        tablo_kaydet(ulke, list(by.values()))
    return {
        'doldurulan': doldurulan,
        'atlanan': atlanan,
        'rapor': tablo_yukle(ulke),
    }


def _insert_fatura_if_new(cur, draft, kalem_ids):
    fno = str(draft.get('fatura_no') or '').strip()
    ulke = str(draft.get('ulke') or '').strip().lower()
    if not fno or not ulke:
        return None, 'fatura_no yok'
    cur.execute(
        'SELECT id FROM maliyet_faturalari WHERE ulke=%s AND fatura_no=%s LIMIT 1',
        (ulke, fno),
    )
    if cur.fetchone():
        return None, 'mevcut'
    kalemler = []
    for i, row in enumerate(draft.get('kalemler') or []):
        kod = row.get('kalem_kod')
        kid = kalem_ids.get(kod) or (kalem_ids.get('handling') if kod else None)
        if not kid:
            continue
        tutar = float(row.get('tutar') or 0)
        kalemler.append({
            'kalem_id': kid, 'tarih': draft.get('donem_bitis'),
            'aciklama': (row.get('aciklama') or kod or 'Kalem')[:200],
            'miktar': float(row.get('miktar') or 0) or 1,
            'birim_fiyat': float(row.get('birim_fiyat') or tutar),
            'tutar': tutar, 'sira': i,
        })
    if not kalemler:
        return None, 'kalem yok'
    para = str(draft.get('para_birimi') or 'EUR').upper()
    if para not in ('EUR', 'USD', 'TRY', 'GEL'):
        para = 'EUR'
    alanlar = {
        'ulke': ulke, 'fatura_no': fno,
        'donem_baslangic': draft.get('donem_baslangic'),
        'donem_bitis': draft.get('donem_bitis'),
        'tutar': round(sum(k['tutar'] for k in kalemler), 2),
        'para_birimi': para,
        'fatura_tarihi': draft.get('fatura_tarihi') or draft.get('donem_bitis'),
        'notlar': f"drop {draft.get('kaynak') or 'upload'}",
    }
    if not alanlar['donem_baslangic'] or not alanlar['donem_bitis']:
        return None, 'dönem yok'
    cur.execute('''INSERT INTO maliyet_faturalari
        (ulke,fatura_no,donem_baslangic,donem_bitis,tutar,para_birimi,fatura_tarihi,notlar)
        VALUES (%(ulke)s,%(fatura_no)s,%(donem_baslangic)s,%(donem_bitis)s,%(tutar)s,
                %(para_birimi)s,%(fatura_tarihi)s,%(notlar)s) RETURNING id''', alanlar)
    fid = cur.fetchone()[0]
    for k in kalemler:
        cur.execute('''INSERT INTO maliyet_fatura_kalemleri
            (fatura_id,kalem_id,tarih,aciklama,referans,miktar,birim_fiyat,tutar,sira)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)''',
            (fid, k['kalem_id'], k['tarih'], k['aciklama'], None,
             k['miktar'], k['birim_fiyat'], k['tutar'], k['sira']))
    return fid, None


def _excel_drafts(data, ulke):
    from api.maliyet.excel_aktar import _excel_coz
    if ulke == 'mk':
        from api.maliyet.makedonya import parse_nalog_upload
        nalogs = parse_nalog_upload(data)
        if nalogs:
            return nalogs, None
    try:
        sonuc, err = _excel_coz(data)
    except Exception:
        logging.exception('tablo drop excel')
        return [], 'Excel okunamadı'
    if err:
        return [], err
    if (sonuc or {}).get('tip') != 'fatura':
        return [], 'Bu Excel fatura/ay kırılımı değil'
    groups = {}
    for r in sonuc.get('satirlar') or []:
        u = (r.get('ulke') or ulke or '').strip().lower()
        if u and u != ulke:
            continue
        donem = r.get('donem') or str(r.get('tarih') or '')[:7]
        if not re.fullmatch(r'20\d{2}-\d{2}', str(donem or '')):
            continue
        key = f"{r.get('fatura_no') or donem}"
        bag = groups.setdefault(key, {
            'ulke': ulke, 'fatura_no': r.get('fatura_no') or f'LC-{ulke}-{donem}',
            'donem_baslangic': f'{donem}-01',
            'donem_bitis': f'{donem}-28',
            'para_birimi': r.get('para_birimi') or 'EUR',
            'kaynak': 'excel-drop', 'kalemler': [],
        })
        y, m = map(int, donem.split('-'))
        last_d = calendar.monthrange(y, m)[1]
        bag['donem_bitis'] = f'{donem}-{last_d:02d}'
        bag['fatura_tarihi'] = r.get('fatura_tarihi') or bag['donem_bitis']
        bag['kalemler'].append({
            'aciklama': r.get('aciklama') or r.get('kalem_ad') or '',
            'kalem_kod': r.get('kalem_kod'),
            'miktar': r.get('miktar') or 1,
            'birim_fiyat': r.get('birim_fiyat') or r.get('tutar'),
            'tutar': r.get('tutar') or 0,
        })
    drafts = list(groups.values())
    for d in drafts:
        d['tutar'] = round(sum(float(k.get('tutar') or 0) for k in d['kalemler']), 2)
    return drafts, None


def _pdf_drafts(data, ulke, filename):
    from api.maliyet.fatura import parse_maliyet_pdf
    draft, _tahmin, err = parse_maliyet_pdf(data, ulke_hint=ulke, filename=filename)
    if err:
        return [], err
    if not draft:
        return [], 'PDF içinde maliyet satırı bulunamadı'
    if draft.get('ulke') and draft.get('ulke') != ulke:
        draft = dict(draft)
        draft['ulke'] = ulke
    return [draft], None


def maliyet_tablo_drop_post():
    """POST /api/maliyet/tablo/drop — multipart dosya + ulke. Boş hücre doldurur, fatura revize etmez."""
    ulke = str(request.form.get('ulke') or (request.get_json(silent=True) or {}).get('ulke') or '').strip().lower()
    if ulke not in ULKE_TABLO_SCHEMA:
        return jsonify({'success': False, 'error': 'Bu ülke tablosuna drop yok'}), 400
    f = request.files.get('dosya') or request.files.get('file')
    if not f:
        return jsonify({'success': False, 'error': 'Dosya gerekli'}), 400
    data = f.read()
    ad = f.filename or 'dosya'
    if not data or len(data) > MAX_BYTES:
        return jsonify({'success': False, 'error': 'Dosya boş veya 15 MB sınırını aşıyor'}), 400
    low = ad.lower()
    if low.endswith('.pdf'):
        drafts, err = _pdf_drafts(data, ulke, ad)
    elif re.search(r'\.xlsx?$', low):
        drafts, err = _excel_drafts(data, ulke)
    else:
        return jsonify({'success': False, 'error': 'Excel veya PDF bırakın'}), 400
    if err:
        return jsonify({'success': False, 'error': err}), 400
    if not drafts:
        return jsonify({'success': False, 'error': 'Belgede aktarılacak satır yok'}), 400

    schema_kodlar = [it['kod'] for it in _schema(ulke)['items']]
    gelen = []
    for d in drafts:
        d['ulke'] = ulke
        ay = draft_to_ay(ulke, d, schema_kodlar)
        if ay:
            gelen.append(ay)

    merge = tablo_bos_doldur(ulke, gelen)

    fatura_yeni = []
    fatura_mevcut = []
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute('SELECT id, kod FROM maliyet_kalemleri WHERE aktif')
        kalem_ids = {r[1]: r[0] for r in cur.fetchall()}
        for d in drafts:
            fid, st = _insert_fatura_if_new(cur, d, kalem_ids)
            if st == 'mevcut':
                fatura_mevcut.append(d.get('fatura_no'))
            elif fid:
                fatura_yeni.append(d.get('fatura_no'))
        conn.commit()
    except Exception:
        conn.rollback()
        logging.exception('tablo drop fatura')
        return jsonify({'success': False, 'error': 'Tablo dolduruldu ama fatura yazılamadı'}), 500
    finally:
        cur.close()
        conn.close()

    log_action(getattr(g, 'user', None), 'maliyet_tablo_drop',
               f"{ulke} {ad}: {len(merge['doldurulan'])} hücre, {len(fatura_yeni)} yeni fatura")
    return jsonify({
        'success': True,
        'ulke': ulke,
        'dosya': ad,
        'doldurulan': merge['doldurulan'],
        'atlanan': merge['atlanan'],
        'fatura_yeni': fatura_yeni,
        'fatura_mevcut': fatura_mevcut,
        'rapor': merge['rapor'],
        'not': 'Yalnız boş hücreler dolduruldu. Kayıtlı faturalara dokunulmadı.',
    })

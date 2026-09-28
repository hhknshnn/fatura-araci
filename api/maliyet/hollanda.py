# api/maliyet/hollanda.py
# Hollanda: NedLine DEPO + İÇ NAKLİYE PDF klasörü + LOGISTICS COSTS Netherland 2026.

import calendar
import datetime
import io
import logging
import os
import re
from collections import defaultdict
import unicodedata

import pdfplumber
from flask import jsonify, request
from openpyxl import load_workbook

from api.db import get_conn
from api.maliyet.ulke_tablo import tablo_kaydet, ulke_ciro_kaydet

_BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_NL_DIR = os.path.join(_BASE, 'Hollanda-Maliyet', 'HOLLANDA')
_LOGISTICS_XLSX = os.path.join(_BASE, 'Logistic Cost', 'LOGISTICS COSTS.xlsx')

_MONTH_TR = {
    'ocak': 1, 'subat': 2, 'şubat': 2, 'mart': 3, 'nisan': 4,
    'mayis': 5, 'mayıs': 5, 'haziran': 6, 'temmuz': 7,
    'agustos': 8, 'ağustos': 8, 'eylul': 9, 'eylül': 9,
    'ekim': 10, 'kasim': 11, 'kasım': 11, 'aralik': 12, 'aralık': 12,
}


def _fold(s):
    s = unicodedata.normalize('NFKD', str(s or ''))
    return ''.join(c for c in s if not unicodedata.combining(c)).lower()


def _parse_eur(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip().replace('\xa0', '').replace(' ', '').replace('€', '').replace('EUR', '')
    if not s:
        return None
    if ',' in s and '.' in s:
        if s.rfind(',') > s.rfind('.'):
            s = s.replace('.', '').replace(',', '.')
        else:
            s = s.replace(',', '')
    elif ',' in s:
        if re.search(r',\d{2}$', s):
            s = s.replace('.', '').replace(',', '.')
        else:
            s = s.replace(',', '')
    try:
        return float(s)
    except ValueError:
        return None


def _parse_date(value):
    if isinstance(value, datetime.datetime):
        return value.date()
    if isinstance(value, datetime.date):
        return value
    s = str(value or '').strip()
    for fmt in ('%d-%m-%Y', '%d/%m/%Y', '%d.%m.%Y', '%Y-%m-%d'):
        try:
            return datetime.datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    return None


def _pdf_text(path_or_bytes):
    if isinstance(path_or_bytes, (bytes, bytearray)):
        opener = lambda: pdfplumber.open(io.BytesIO(path_or_bytes))
    else:
        opener = lambda: pdfplumber.open(path_or_bytes)
    with opener() as pdf:
        return '\n'.join((p.extract_text(x_tolerance=2, y_tolerance=3) or '') for p in pdf.pages)


def _folder_ay_no(name):
    n = _fold(name)
    m = re.match(r'^(\d{1,2})\b', n)
    if m:
        v = int(m.group(1))
        if 1 <= v <= 12:
            return v
    for key, mon in _MONTH_TR.items():
        if key in n:
            return mon
    return None


def parse_nedline_invoice_pdf(path_or_bytes):
    """NedLine depo veya iç nakliye faturası → EUR (KDV hariç)."""
    text = _pdf_text(path_or_bytes)
    m = re.search(r'Invoice\s*nr\s*:\s*(\d+)', text, re.I)
    fno = m.group(1) if m else None
    m = re.search(r'Date\s*:\s*(\d{2}-\d{2}-\d{4})', text, re.I)
    tarih = _parse_date(m.group(1) if m else None)

    lines = []
    pending_transport = None
    for raw in text.splitlines():
        line = re.sub(r'\s+', ' ', raw).strip()
        # Depo: … Inbound INBOUND 96,00
        m = re.match(
            r'^(\d{2}-\d{2}-\d{4})\s+Services rendered for you\s*[–-]\s*(?:Weekly\s+)?'
            r'(Inbound|Storage|Outbound)\b.*?\s+([\d.]+,\d{2})$',
            line, re.I,
        )
        if m:
            if pending_transport:
                lines.append(pending_transport)
                pending_transport = None
            kod = {'inbound': 'pallet_in', 'storage': 'storage', 'outbound': 'pallet_out'}[m.group(2).lower()]
            tutar = _parse_eur(m.group(3))
            lines.append({
                'aciklama': m.group(2).title(), 'kalem_kod': kod,
                'miktar': 1.0, 'birim_fiyat': tutar, 'tutar': tutar,
                'tarih': _parse_date(m.group(1)),
            })
            continue
        # İç nakliye tarih satırı (tutar = rate + fuel)
        m = re.match(r'^(\d{2}-\d{2}-\d{4})\s+(.+?)\s+([\d.]+,\d{2})$', line)
        if m and 'services rendered' not in line.lower() and not line.lower().startswith('sub total'):
            if pending_transport:
                lines.append(pending_transport)
                pending_transport = None
            orta = m.group(2)
            tutar = _parse_eur(m.group(3))
            if tutar is None:
                continue
            # Ayrı "Fuel surcharge FS" satırı — transport değil
            if re.search(r'fuel\s*surcharge', orta, re.I):
                lines.append({
                    'aciklama': orta[:120], 'kalem_kod': 'fuel_surcharge',
                    'miktar': 1.0, 'birim_fiyat': tutar, 'tutar': tutar,
                    'tarih': _parse_date(m.group(1)),
                })
                continue
            pending_transport = {
                'aciklama': orta[:120], 'kalem_kod': 'transport',
                'miktar': 1.0, 'birim_fiyat': tutar, 'tutar': tutar,
                'tarih': _parse_date(m.group(1)),
            }
            continue
        m = re.search(r'Rate:\s*[\d.]+x[\d.]+\s*=\s*([\d.]+)', line, re.I)
        if m and pending_transport:
            rate_tot = float(m.group(1))
            pending_transport['tutar'] = pending_transport['birim_fiyat'] = rate_tot
            continue
        m = re.search(r'Fuel\s*surcharge\s*:\s*[\d.]+\s*x\s*[\d.]+\s*=\s*([\d.]+)', line, re.I)
        if m:
            fuel = float(m.group(1))
            if pending_transport:
                lines.append(pending_transport)
                pending_transport = None
            # Aynı fatura bloğunda tarih satırıyla zaten eklendiyse tekrar ekleme
            if lines and lines[-1]['kalem_kod'] == 'fuel_surcharge' and abs(lines[-1]['tutar'] - fuel) < 0.02:
                continue
            lines.append({
                'aciklama': 'Fuel surcharge', 'kalem_kod': 'fuel_surcharge',
                'miktar': 1.0, 'birim_fiyat': fuel, 'tutar': fuel,
                'tarih': tarih,
            })
            continue
    if pending_transport:
        lines.append(pending_transport)

    m = re.search(r'Sub\s*Total\s*€?\s*([\d.,]+)', text, re.I)
    sub = _parse_eur(m.group(1)) if m else None
    computed = round(sum(x['tutar'] for x in lines), 2) if lines else None
    if sub is not None and computed is not None and abs(sub - computed) > 0.05 and computed:
        ratio = sub / computed
        for x in lines:
            x['tutar'] = round(x['tutar'] * ratio, 2)
            x['birim_fiyat'] = x['tutar']
        computed = sub
    if tarih:
        d_bas = datetime.date(tarih.year, tarih.month, 1)
        d_bit = datetime.date(tarih.year, tarih.month, calendar.monthrange(tarih.year, tarih.month)[1])
    else:
        dates = [x['tarih'] for x in lines if x.get('tarih')]
        if dates:
            d_bas = min(dates).replace(day=1)
            last = calendar.monthrange(d_bas.year, d_bas.month)[1]
            d_bit = d_bas.replace(day=last)
            tarih = max(dates)
        else:
            d_bas = d_bit = None

    # tarih alanını ISO string'e çevir
    kalemler = []
    for x in lines:
        kalemler.append({
            'aciklama': x['aciklama'], 'kalem_kod': x['kalem_kod'],
            'miktar': x['miktar'], 'birim_fiyat': x['birim_fiyat'], 'tutar': x['tutar'],
        })

    return {
        'ulke': 'nl',
        'fatura_no': fno,
        'fatura_tarihi': tarih.isoformat() if tarih else None,
        'donem_baslangic': d_bas.isoformat() if d_bas else None,
        'donem_bitis': d_bit.isoformat() if d_bit else None,
        'para_birimi': 'EUR',
        'tutar': computed if computed is not None else sub,
        'kalemler': kalemler,
        'kaynak': 'nedline',
    }


def _scan_pdfs(root=None):
    root = root or _NL_DIR
    out = []
    if not os.path.isdir(root):
        return out
    for dirpath, _, files in os.walk(root):
        folder = os.path.basename(dirpath)
        ay_hint = _folder_ay_no(folder)
        for f in sorted(files):
            if not f.lower().endswith('.pdf'):
                continue
            out.append({
                'folder': os.path.relpath(dirpath, root),
                'ay_hint': ay_hint,
                'pdf': os.path.join(dirpath, f),
            })
    return out


def _kalem_id_map(cur):
    cur.execute('SELECT id, kod FROM maliyet_kalemleri WHERE aktif')
    return {r[1]: r[0] for r in cur.fetchall()}


def _upsert_fatura(cur, draft, kalem_ids):
    fno = draft.get('fatura_no')
    if not fno:
        return None, 'fatura_no yok'
    kalemler = []
    for i, row in enumerate(draft.get('kalemler') or []):
        kod = row.get('kalem_kod')
        kid = kalem_ids.get(kod) or kalem_ids.get('handling')
        if not kid:
            continue
        tutar = float(row.get('tutar') or 0)
        kalemler.append({
            'kalem_id': kid, 'tarih': draft.get('donem_bitis'),
            'aciklama': row.get('aciklama') or kod, 'referans': None,
            'miktar': float(row.get('miktar') or 1),
            'birim_fiyat': float(row.get('birim_fiyat') or tutar),
            'tutar': tutar, 'sira': i,
        })
    if not kalemler:
        return None, 'kalem yok'
    tutar = float(draft.get('tutar') or sum(k['tutar'] for k in kalemler))
    cur.execute(
        'SELECT id FROM maliyet_faturalari WHERE ulke=%s AND fatura_no=%s LIMIT 1',
        ('nl', fno),
    )
    row = cur.fetchone()
    alanlar = {
        'ulke': 'nl', 'fatura_no': fno,
        'donem_baslangic': draft.get('donem_baslangic'),
        'donem_bitis': draft.get('donem_bitis'),
        'tutar': round(tutar, 2), 'para_birimi': 'EUR',
        'fatura_tarihi': draft.get('fatura_tarihi'),
        'notlar': f"NL {draft.get('kaynak') or 'import'}",
    }
    if row:
        fid = row[0]
        cur.execute('''UPDATE maliyet_faturalari SET
            donem_baslangic=%(donem_baslangic)s, donem_bitis=%(donem_bitis)s,
            tutar=%(tutar)s, para_birimi=%(para_birimi)s, fatura_tarihi=%(fatura_tarihi)s,
            notlar=%(notlar)s WHERE id=%(id)s''', {**alanlar, 'id': fid})
    else:
        cur.execute('''INSERT INTO maliyet_faturalari
            (ulke,fatura_no,donem_baslangic,donem_bitis,tutar,para_birimi,fatura_tarihi,notlar)
            VALUES (%(ulke)s,%(fatura_no)s,%(donem_baslangic)s,%(donem_bitis)s,%(tutar)s,
                    %(para_birimi)s,%(fatura_tarihi)s,%(notlar)s) RETURNING id''', alanlar)
        fid = cur.fetchone()[0]
    cur.execute('DELETE FROM maliyet_fatura_kalemleri WHERE fatura_id=%s', (fid,))
    for k in kalemler:
        cur.execute('''INSERT INTO maliyet_fatura_kalemleri
            (fatura_id,kalem_id,tarih,aciklama,referans,miktar,birim_fiyat,tutar,sira)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)''',
            (fid, k['kalem_id'], k['tarih'], k['aciklama'], k['referans'],
             k['miktar'], k['birim_fiyat'], k['tutar'], k['sira']))
    return fid, None


def _logistics_2026_aylar():
    wb = load_workbook(_LOGISTICS_XLSX, data_only=True)
    ws = wb['Netherland']
    cols = [
        ('2026-01', 5, 6), ('2026-02', 7, 8), ('2026-03', 9, 10),
        ('2026-04', 14, 15), ('2026-05', 16, 17), ('2026-06', 18, 19),
    ]
    row_map = {'inbound': 22, 'storage': 23, 'outbound': 24, 'transport': 25}
    ciro_row = 28
    aylar = []
    for ay, qc, cc in cols:
        a = {'ay': ay, 'ciro_eur': float(ws.cell(ciro_row, qc).value or 0)}
        for kod, rr in row_map.items():
            a[kod] = {
                'miktar': float(ws.cell(rr, qc).value or 0),
                'tutar': float(ws.cell(rr, cc).value or 0),
            }
        aylar.append(a)
    wb.close()
    return aylar


def _tablo_from_drafts(ay, drafts, ciro=0.0):
    bag = defaultdict(lambda: {'miktar': 0.0, 'tutar': 0.0})
    for d in drafts:
        for k in d.get('kalemler') or []:
            kod = k.get('kalem_kod')
            tutar = float(k.get('tutar') or 0)
            miktar = float(k.get('miktar') or 0)
            if kod == 'pallet_in':
                bag['inbound']['miktar'] += miktar
                bag['inbound']['tutar'] += tutar
            elif kod == 'pallet_out':
                bag['outbound']['miktar'] += miktar
                bag['outbound']['tutar'] += tutar
            elif kod == 'storage':
                bag['storage']['miktar'] += miktar
                bag['storage']['tutar'] += tutar
            elif kod in ('transport', 'fuel_surcharge', 'handling'):
                if kod == 'transport':
                    bag['transport']['miktar'] += miktar
                bag['transport']['tutar'] += tutar
    return {
        'ay': ay,
        'ciro_eur': float(ciro or 0),
        'inbound': {'miktar': round(bag['inbound']['miktar'], 4), 'tutar': round(bag['inbound']['tutar'], 2)},
        'storage': {'miktar': round(bag['storage']['miktar'], 4), 'tutar': round(bag['storage']['tutar'], 2)},
        'outbound': {'miktar': round(bag['outbound']['miktar'], 4), 'tutar': round(bag['outbound']['tutar'], 2)},
        'transport': {'miktar': round(bag['transport']['miktar'], 4), 'tutar': round(bag['transport']['tutar'], 2)},
    }


def seed_nl_from_folder(root=None):
    root = root or _NL_DIR
    fatura_ozet = []
    by_month = defaultdict(list)
    scanned = _scan_pdfs(root)

    conn = get_conn()
    cur = conn.cursor()
    try:
        kalem_ids = _kalem_id_map(cur)
        for item in scanned:
            draft = parse_nedline_invoice_pdf(item['pdf'])
            if not draft.get('fatura_no'):
                fatura_ozet.append({'pdf': item['pdf'], 'hata': 'fatura_no yok'})
                continue
            # Dönem: fatura tarihinin ayı (Q1 klasörleri için doğru)
            ay = (draft.get('donem_bitis') or '')[:7]
            if not ay and item.get('ay_hint'):
                yil = 2026
                last = calendar.monthrange(yil, item['ay_hint'])[1]
                draft['donem_baslangic'] = f'{yil}-{item["ay_hint"]:02d}-01'
                draft['donem_bitis'] = f'{yil}-{item["ay_hint"]:02d}-{last:02d}'
                ay = f'{yil}-{item["ay_hint"]:02d}'
            fid, err = _upsert_fatura(cur, draft, kalem_ids)
            fatura_ozet.append({
                'ay': ay, 'fatura_no': draft['fatura_no'], 'id': fid,
                'tutar': draft.get('tutar'), 'hata': err,
                'pdf': os.path.basename(item['pdf']), 'kaynak': 'nedline',
            })
            if ay and not err:
                by_month[ay].append(draft)
        conn.commit()
    except Exception:
        conn.rollback()
        logging.exception('nl seed')
        return {'success': False, 'error': 'Hollanda aktarımı başarısız'}
    finally:
        cur.close()
        conn.close()

    log_aylar = _logistics_2026_aylar()
    ciro_map = {a['ay']: a['ciro_eur'] for a in log_aylar}
    tablo = list(log_aylar)
    for ay, drafts in sorted(by_month.items()):
        if ay <= '2026-06':
            continue  # Oca–Haz LOGISTICS resmi
        tablo = [a for a in tablo if a['ay'] != ay]
        tablo.append(_tablo_from_drafts(ay, drafts, ciro_map.get(ay, 0)))

    tablo.sort(key=lambda x: x['ay'])
    tablo_kaydet('nl', tablo)
    ulke_ciro_kaydet('nl', {a['ay']: a['ciro_eur'] for a in tablo if a.get('ciro_eur')})

    yeni = [x for x in fatura_ozet if x.get('fatura_no') == '202606051' or (x.get('ay') or '') >= '2026-09']
    return {
        'success': True,
        'klasor': root,
        'pdf_sayisi': len(scanned),
        'ay_sayisi': len(tablo),
        'faturalar': fatura_ozet,
        'yeni_veya_eylul': yeni,
        'aylar': [
            {
                'ay': a['ay'], 'ciro_eur': a.get('ciro_eur') or 0,
                'lojistik': round(
                    float((a.get('inbound') or {}).get('tutar') or 0)
                    + float((a.get('storage') or {}).get('tutar') or 0)
                    + float((a.get('outbound') or {}).get('tutar') or 0)
                    + float((a.get('transport') or {}).get('tutar') or 0), 2),
            }
            for a in tablo
        ],
        'not': 'Oca–Haz LOGISTICS COSTS; Tem–Eyl NedLine PDF klasöründen. KDV hariç.',
    }


def maliyet_nl_seed_post():
    body = request.get_json(silent=True) or {}
    return jsonify(seed_nl_from_folder(body.get('klasor') or _NL_DIR))


def maliyet_nl_onizle_get():
    items = _scan_pdfs()
    out = []
    for item in items:
        d = parse_nedline_invoice_pdf(item['pdf'])
        out.append({
            'folder': item['folder'], 'pdf': os.path.basename(item['pdf']),
            'fatura_no': d.get('fatura_no'), 'tutar': d.get('tutar'),
            'kalem_sayisi': len(d.get('kalemler') or []),
        })
    return jsonify({
        'success': True,
        'pdf_aylar': out,
        'logistics_aylar': [
            {'ay': a['ay'], 'ciro_eur': a['ciro_eur'],
             'lojistik': round(sum(float(a[k]['tutar']) for k in ('inbound', 'storage', 'outbound', 'transport')), 2)}
            for a in _logistics_2026_aylar()
        ],
    })

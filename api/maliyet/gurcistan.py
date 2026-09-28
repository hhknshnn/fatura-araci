# api/maliyet/gurcistan.py
# Gürcistan aylık klasörleri: Gebrüder Weiss PDF faturası + Preliminary Excel detay.
# PDF → maliyet_faturalari (GEL, KDV hariç net kalemler)
# Excel → ulke tablosu miktar/tutar (EUR'ya çevrilir) + depo stok ortalaması

import calendar
import datetime
import logging
import os
import re
from collections import defaultdict

import pdfplumber
from flask import jsonify, request
from openpyxl import load_workbook

from api.db import get_conn
from api.kur import get_tcmb_kurlar
from api.maliyet.hesap import to_eur
from api.maliyet.ulke_tablo import tablo_kaydet, ulke_ciro_kaydet

_BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_GE_DIR = os.path.join(_BASE, 'GÜRCİSTAN - MALİYET', 'GÜRCİSTAN')
_LOGISTICS_XLSX = os.path.join(_BASE, 'Logistic Cost', 'LOGISTICS COSTS.xlsx')

_MONTH_FOLDER = {
    '01': 1, '02': 2, '03': 3, '04': 4, '05': 5, '06': 6, '07': 7, '08': 8,
    '09': 9, '10': 10, '11': 11, '12': 12,
}

# PDF / Excel hizmet → maliyet kalem kodu
_SVC_MAP = (
    (('discharging', 'reconstruction', 'gldani'), 'handling'),
    (('relocation',), 'handling'),
    (('transfer',), 'store_transfer'),
    (('inbound',), 'pallet_in'),
    (('outbound',), 'pallet_out'),
    (('storage', 'stock'), 'storage'),
    (('transport',), 'transport'),
)


def _parse_gel_amount(value):
    """2.774,25 veya 2774.25 → float."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip().replace('\xa0', '').replace(' ', '')
    if not s:
        return None
    if ',' in s and '.' in s:
        s = s.replace('.', '').replace(',', '.')
    elif ',' in s:
        s = s.replace('.', '').replace(',', '.')
    try:
        return float(s)
    except ValueError:
        return None


def _parse_tr_date(value):
    if isinstance(value, datetime.datetime):
        return value.date()
    if isinstance(value, datetime.date):
        return value
    s = str(value or '').strip()
    for fmt in ('%d.%m.%Y', '%Y-%m-%d', '%d/%m/%Y'):
        try:
            return datetime.datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    return None


def _norm_svc(text):
    s = re.sub(r'\s+', ' ', str(text or '').strip().lower())
    for keys, kod in _SVC_MAP:
        if any(k in s for k in keys):
            return kod
    return None


def _folder_month(name):
    """'01.OCAK' / '05.Mayıs' → (yil_ay '2026-01', month int) — yıl PDF/Excel'den gelir."""
    m = re.match(r'^(\d{2})', str(name or '').strip())
    if not m:
        return None, None
    mon = _MONTH_FOLDER.get(m.group(1))
    return None, mon


def parse_ge_invoice_pdf(pdf_bytes_or_path):
    """Aylık GW PDF → fatura taslağı (GEL, net)."""
    if isinstance(pdf_bytes_or_path, (bytes, bytearray)):
        src = pdf_bytes_or_path
        open_kw = {'raw': True}
    else:
        src = pdf_bytes_or_path
        open_kw = {}

    if open_kw.get('raw'):
        import io
        opener = lambda: pdfplumber.open(io.BytesIO(src))
    else:
        opener = lambda: pdfplumber.open(src)

    with opener() as pdf:
        text = '\n'.join((p.extract_text(x_tolerance=2, y_tolerance=3) or '') for p in pdf.pages)

    # Fatura no: "Nr. : 210803878 / 1145182" (UID Nr. değil)
    fno = None
    for m in re.finditer(r'Nr\.\s*:\s*(\d+)\s*/\s*\d+', text):
        cand = m.group(1)
        if cand != '404931972':
            fno = cand
            break
    if not fno:
        m = re.search(r'Nr\.\s*:\s*(\d{6,})', text)
        if m and m.group(1) != '404931972':
            fno = m.group(1)

    tarih = None
    m = re.search(r'თარიღი\s*:\s*(\d{2}\.\d{2}\.\d{4})', text)
    if m:
        tarih = _parse_tr_date(m.group(1))

    d_bas = d_bit = None
    m = re.search(r'(\d{2}\.\d{2}\.\d{4})\s*-\s*(\d{2}\.\d{2}\.\d{4})', text)
    if m:
        d_bas, d_bit = _parse_tr_date(m.group(1)), _parse_tr_date(m.group(2))

    lines = []
    for raw in text.splitlines():
        line = raw.strip()
        m = re.search(r'^(.+?)\s+18,0\s*%\s*GE\s*([\d.]+,\d{2})\s*$', line)
        if not m:
            continue
        ad = m.group(1).strip()
        tutar = _parse_gel_amount(m.group(2))
        if tutar is None:
            continue
        kod = _norm_svc(ad)
        lines.append({
            'aciklama': ad,
            'kalem_kod': kod,
            'tutar': round(tutar, 2),
            'miktar': 1.0,
            'birim_fiyat': round(tutar, 2),
        })

    net = None
    m = re.search(r'ნეტო:\s*GEL\s*([\d.]+,\d{2})', text)
    if m:
        net = _parse_gel_amount(m.group(1))
    if net is None and lines:
        net = round(sum(x['tutar'] for x in lines), 2)

    return {
        'ulke': 'ge',
        'fatura_no': fno,
        'fatura_tarihi': tarih.isoformat() if tarih else None,
        'donem_baslangic': d_bas.isoformat() if d_bas else None,
        'donem_bitis': d_bit.isoformat() if d_bit else None,
        'para_birimi': 'GEL',
        'tutar': net,
        'kalemler': lines,
        'ham_metin_len': len(text or ''),
    }


def parse_ge_preliminary_xlsx(path):
    """Preliminary Excel → hizmet özetleri + günlük stok paneli."""
    wb = load_workbook(path, data_only=True)
    ws = wb[wb.sheetnames[0]]
    header = [c for c in next(ws.iter_rows(min_row=1, max_row=1, values_only=True))]

    # Sağ panel: "Pallet Quantity" kolonu
    pq_idx = None
    for i, h in enumerate(header):
        hs = str(h or '').strip().lower()
        if 'pallet quantity' in hs:
            pq_idx = i
            break

    svc = defaultdict(lambda: {'miktar': 0.0, 'tutar_gel': 0.0, 'satir': 0})
    storage_days = []
    year = month = None

    for row in ws.iter_rows(min_row=2, values_only=True):
        tip = row[0]
        if tip:
            kod = _norm_svc(tip)
            if kod:
                qty = float(row[3] or 0)
                gel = float(row[5] or 0) if row[5] is not None else 0.0
                svc[kod]['miktar'] += qty
                svc[kod]['tutar_gel'] += gel
                svc[kod]['satir'] += 1
            dt = _parse_tr_date(row[6]) if len(row) > 6 else None
            if dt:
                year, month = dt.year, dt.month

        if pq_idx is not None and len(row) > pq_idx and row[pq_idx] is not None:
            try:
                pq = float(row[pq_idx])
            except (TypeError, ValueError):
                pq = 0
            if pq > 0:
                # Date kolonu genelde pq_idx - 1; amount pq_idx + 2
                dt = _parse_tr_date(row[pq_idx - 1]) if pq_idx >= 1 else None
                amt = None
                if len(row) > pq_idx + 2 and row[pq_idx + 2] is not None:
                    try:
                        amt = float(row[pq_idx + 2])
                    except (TypeError, ValueError):
                        amt = None
                if amt is None and len(row) > pq_idx + 1 and row[pq_idx + 1] is not None:
                    try:
                        price = float(row[pq_idx + 1])
                        amt = pq * price
                    except (TypeError, ValueError):
                        amt = 0.0
                storage_days.append({'tarih': dt.isoformat() if dt else None, 'miktar': pq, 'tutar_gel': float(amt or 0)})
                if dt and not year:
                    year, month = dt.year, dt.month

    wb.close()

    st_qty = sum(x['miktar'] for x in storage_days)
    st_gel = sum(x['tutar_gel'] for x in storage_days)
    gun = len(storage_days) or 1
    avg_pallet = st_qty / gun if storage_days else 0.0

    return {
        'yil': year,
        'ay': month,
        'svc': {k: {'miktar': round(v['miktar'], 4), 'tutar_gel': round(v['tutar_gel'], 2), 'satir': v['satir']}
                for k, v in svc.items()},
        'storage': {
            'gun': len(storage_days),
            'pallet_gun': round(st_qty, 2),
            'ortalama_palet': round(avg_pallet, 2),
            'tutar_gel': round(st_gel, 2),
        },
    }


def _scan_month_dirs(root=None):
    root = root or _GE_DIR
    if not os.path.isdir(root):
        return []
    out = []
    for name in sorted(os.listdir(root)):
        path = os.path.join(root, name)
        if not os.path.isdir(path):
            continue
        _, mon = _folder_month(name)
        if not mon:
            continue
        pdf = xls = None
        for f in os.listdir(path):
            low = f.lower()
            if low.endswith('.pdf') and not pdf:
                pdf = os.path.join(path, f)
            elif low.endswith(('.xlsx', '.xls')) and not xls:
                xls = os.path.join(path, f)
        if pdf or xls:
            out.append({'folder': name, 'ay_no': mon, 'pdf': pdf, 'xlsx': xls})
    return out


def _kalem_id_map(cur):
    cur.execute('SELECT id, kod FROM maliyet_kalemleri WHERE aktif')
    return {r[1]: r[0] for r in cur.fetchall()}


def _upsert_fatura(cur, draft, kalem_ids):
    """GE fatura_no ile varsa güncelle, yoksa ekle. Tutar GEL (net)."""
    fno = draft.get('fatura_no')
    if not fno:
        return None, 'fatura_no yok'
    kalemler = []
    for i, row in enumerate(draft.get('kalemler') or []):
        kod = row.get('kalem_kod')
        kid = kalem_ids.get(kod) if kod else None
        if not kid:
            # bilinen eşleme yoksa handling'e düş
            kid = kalem_ids.get('handling') or kalem_ids.get('admin_fee')
        if not kid:
            continue
        tutar = float(row.get('tutar') or 0)
        kalemler.append({
            'kalem_id': kid,
            'tarih': draft.get('donem_bitis'),
            'aciklama': row.get('aciklama') or kod,
            'referans': None,
            'miktar': float(row.get('miktar') or 1),
            'birim_fiyat': float(row.get('birim_fiyat') or tutar),
            'tutar': tutar,
            'sira': i,
        })
    if not kalemler:
        return None, 'kalem yok'

    tutar = float(draft.get('tutar') or sum(k['tutar'] for k in kalemler))
    cur.execute(
        'SELECT id FROM maliyet_faturalari WHERE ulke=%s AND fatura_no=%s LIMIT 1',
        ('ge', fno),
    )
    row = cur.fetchone()
    alanlar = {
        'ulke': 'ge',
        'fatura_no': fno,
        'donem_baslangic': draft.get('donem_baslangic'),
        'donem_bitis': draft.get('donem_bitis'),
        'tutar': round(tutar, 2),
        'para_birimi': 'GEL',
        'fatura_tarihi': draft.get('fatura_tarihi'),
        'notlar': 'GW Preliminary / monthly invoice',
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


def _ciro_from_logistics():
    """LOGISTICS COSTS Georgia 2026 Q1 + Sayfa1 Q2 ciro (EUR)."""
    ciro = {}
    try:
        wb = load_workbook(_LOGISTICS_XLSX, data_only=True)
        if 'Georgia' in wb.sheetnames:
            ws = wb['Georgia']
            # 2026 block: row 27 ciro, qty cols E=5,G=7,I=9 for Jan Feb Mar
            for ay, col in (('2026-01', 5), ('2026-02', 7), ('2026-03', 9)):
                v = ws.cell(27, col).value
                if v is not None:
                    ciro[ay] = float(v)
        if 'Sayfa1' in wb.sheetnames:
            ws = wb['Sayfa1']
            # row 12 Gürcistan Q2: Nisan=4, Mayıs=5, Haziran=6 (1-based cols C=3 country)
            def _num(v):
                if v is None:
                    return None
                if isinstance(v, (int, float)):
                    return float(v)
                s = str(v).replace('\xa0', '').replace('€', '').strip()
                s = s.replace('.', '').replace(',', '.') if s.count(',') == 1 else s.replace(',', '')
                try:
                    return float(re.sub(r'[^\d.-]', '', s) or 0)
                except ValueError:
                    return None
            for ay, col in (('2026-04', 4), ('2026-05', 5), ('2026-06', 6)):
                n = _num(ws.cell(12, col).value)
                if n:
                    ciro[ay] = n
        wb.close()
    except Exception:
        logging.exception('ge ciro logistics')
    return ciro


def seed_ge_from_folder(root=None):
    """Klasördeki tüm ayları oku → fatura defteri + ulke tablosu + ciro."""
    root = root or _GE_DIR
    months = _scan_month_dirs(root)
    if not months:
        return {'success': False, 'error': f'Klasör boş veya bulunamadı: {root}'}

    kurlar = get_tcmb_kurlar()
    gel_rate = float(kurlar.get('GEL') or 0)
    if gel_rate <= 0:
        return {'success': False, 'error': 'GEL kuru alınamadı'}

    ciro_ref = _ciro_from_logistics()
    aylar_tablo = []
    fatura_ozet = []
    conn = get_conn()
    cur = conn.cursor()
    try:
        kalem_ids = _kalem_id_map(cur)
        for item in months:
            draft = parse_ge_invoice_pdf(item['pdf']) if item['pdf'] else {}
            xdet = parse_ge_preliminary_xlsx(item['xlsx']) if item['xlsx'] else {}

            # dönem yıl
            yil = None
            if draft.get('donem_baslangic'):
                yil = int(draft['donem_baslangic'][:4])
            elif xdet.get('yil'):
                yil = xdet['yil']
            else:
                yil = datetime.date.today().year
            ay_no = item['ay_no']
            ay_key = f'{yil}-{ay_no:02d}'
            last = calendar.monthrange(yil, ay_no)[1]
            if not draft.get('donem_baslangic'):
                draft['donem_baslangic'] = f'{yil}-{ay_no:02d}-01'
                draft['donem_bitis'] = f'{yil}-{ay_no:02d}-{last:02d}'
            if not draft.get('fatura_tarihi'):
                draft['fatura_tarihi'] = draft.get('donem_bitis')

            fid, err = _upsert_fatura(cur, draft, kalem_ids) if draft.get('fatura_no') else (None, 'pdf yok')
            fatura_ozet.append({
                'ay': ay_key, 'fatura_no': draft.get('fatura_no'), 'id': fid,
                'tutar_gel': draft.get('tutar'), 'hata': err,
                'kalem': len(draft.get('kalemler') or []),
            })

            # Tablo: Excel miktar + PDF/Excel GEL → EUR (Logistics ile uyumlu 4 satır)
            pdf_lines = {(_norm_svc(k.get('aciklama')) or k.get('kalem_kod')): k['tutar']
                         for k in (draft.get('kalemler') or [])}

            def gel_to_eur(g):
                e = to_eur(g, 'GEL', kurlar)
                return round(e, 2) if e is not None else 0.0

            svc = xdet.get('svc') or {}
            st = xdet.get('storage') or {}

            inbound_gel = (svc.get('pallet_in') or {}).get('tutar_gel') or pdf_lines.get('pallet_in') or 0
            outbound_gel = (svc.get('pallet_out') or {}).get('tutar_gel') or pdf_lines.get('pallet_out') or 0
            transport_gel = (svc.get('transport') or {}).get('tutar_gel') or pdf_lines.get('transport') or 0
            storage_gel = st.get('tutar_gel') or pdf_lines.get('storage') or 0
            # Excel storage amount bazen 0 (fiyat×miktar yazılmamış) → PDF
            if storage_gel < 0.01:
                storage_gel = pdf_lines.get('storage') or 0

            a = {
                'ay': ay_key,
                'ciro_eur': float(ciro_ref.get(ay_key) or 0),
                'inbound': {
                    'miktar': float((svc.get('pallet_in') or {}).get('miktar') or 0),
                    'tutar': gel_to_eur(inbound_gel),
                },
                'outbound': {
                    'miktar': float((svc.get('pallet_out') or {}).get('miktar') or 0),
                    'tutar': gel_to_eur(outbound_gel),
                },
                'transport': {
                    'miktar': float((svc.get('transport') or {}).get('miktar') or 0),
                    'tutar': gel_to_eur(transport_gel),
                },
                'storage': {
                    'miktar': float(st.get('ortalama_palet') or 0),
                    'tutar': gel_to_eur(storage_gel),
                },
            }
            aylar_tablo.append(a)

        conn.commit()
    except Exception:
        conn.rollback()
        logging.exception('ge seed')
        return {'success': False, 'error': 'Gürcistan aktarımı başarısız'}
    finally:
        cur.close()
        conn.close()

    tablo_kaydet('ge', aylar_tablo)
    ulke_ciro_kaydet('ge', {a['ay']: a['ciro_eur'] for a in aylar_tablo if a['ciro_eur']})

    return {
        'success': True,
        'klasor': root,
        'gel_eur': gel_rate,
        'ay_sayisi': len(aylar_tablo),
        'faturalar': fatura_ozet,
        'aylar': [
            {
                'ay': a['ay'],
                'ciro_eur': a['ciro_eur'],
                'inbound': a['inbound'],
                'storage': a['storage'],
                'outbound': a['outbound'],
                'transport': a['transport'],
                'lojistik': round(
                    a['inbound']['tutar'] + a['storage']['tutar'] +
                    a['outbound']['tutar'] + a['transport']['tutar'], 2),
            }
            for a in aylar_tablo
        ],
    }


def maliyet_ge_seed_post():
    """POST /api/maliyet/ge/seed — sunucudaki aylık klasörden aktar."""
    body = request.get_json(silent=True) or {}
    root = body.get('klasor') or _GE_DIR
    return jsonify(seed_ge_from_folder(root))


def maliyet_ge_onizle_get():
    """GET /api/maliyet/ge/onizle — klasörü okur, kaydetmeden özet döner."""
    months = _scan_month_dirs()
    kurlar = get_tcmb_kurlar()
    out = []
    for item in months:
        draft = parse_ge_invoice_pdf(item['pdf']) if item['pdf'] else {}
        xdet = parse_ge_preliminary_xlsx(item['xlsx']) if item['xlsx'] else {}
        net = draft.get('tutar')
        eur = to_eur(net, 'GEL', kurlar) if net is not None else None
        out.append({
            'folder': item['folder'],
            'fatura_no': draft.get('fatura_no'),
            'donem': [draft.get('donem_baslangic'), draft.get('donem_bitis')],
            'tutar_gel': net,
            'tutar_eur': round(eur, 2) if eur is not None else None,
            'pdf_kalemler': draft.get('kalemler'),
            'excel_svc': xdet.get('svc'),
            'storage': xdet.get('storage'),
        })
    return jsonify({'success': True, 'aylar': out, 'kurlar': kurlar})

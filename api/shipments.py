# api/shipments.py
# Sevkiyat kayıtları — PostgreSQL tabanlı

import io
import re
import time
import pdfplumber
from flask import request, jsonify, send_file
from api.db import get_conn
from api.auth import get_session_from_headers

# Ülke adı → müşteri tipi eşlemesi
ULKE_MUSTERI_TIPI = {
    'SIRBİSTAN': 'kurumsal', 'BOSNA': 'kurumsal', 'GÜRCİSTAN': 'kurumsal',
    'KOSOVA': 'kurumsal', 'MAKEDONYA': 'kurumsal', 'BELÇİKA': 'kurumsal',
    'ALMANYA': 'kurumsal', 'HOLLANDA': 'kurumsal', 'KAZAKİSTAN': 'kurumsal',
    'KIBRIS': 'franchise', 'IRAK': 'franchise', 'LİBYA': 'franchise',
    'LİBERYA': 'franchise', 'LÜBNAN': 'franchise', 'ÖZBEKİSTAN': 'franchise',
    'RUSYA': 'franchise',
    'ABHAZYA': 'toptan',
}

def _musteri_tipi_from_ulke(ulke):
    return ULKE_MUSTERI_TIPI.get(str(ulke).strip().upper(), 'kurumsal')


# ── TÜM SEVKİYATLARI GETİR ───────────────────────────────────────────────────
def get_all_shipments(ulke=None, durum=None, musteri_tipi=None):
    conn = get_conn()
    cur  = conn.cursor()

    query = '''
        SELECT id, ihracat_dosya_no, fatura_no, ulke, nakliye_firmasi, plaka,
               mal_bedeli_eur, navlun_eur, sigorta_eur, eur_kuru, fatura_bedeli_eur,
               fatura_bedeli_tl, durum, yukleme_tarihi, gumruk_tarihi,
               varis_tarihi, gumrukleme_bitis, created_at,
               mal_bedeli_tl, ihracat_beyanname_tl, ihracat_beyanname_eur,
               arac_bekleme, brokerage_eur, gumruk_vergisi_eur, kdv_eur,
               toplam_maliyet_eur, musteri_tipi, sefer_id, palet
        FROM shipments
        WHERE 1=1
    '''
    params = []

    if ulke:
        query += ' AND unaccent(lower(ulke)) = unaccent(lower(%s))'
        params.append(ulke)
    if durum:
        query += ' AND upper(durum) = upper(%s)'
        params.append(durum)
    if musteri_tipi:
        query += ' AND musteri_tipi = %s'
        params.append(musteri_tipi)

    query += ' ORDER BY id DESC'

    cur.execute(query, params)
    rows = cur.fetchall()
    cur.close()
    conn.close()

    return [_row_to_dict(r) for r in rows]


# ── TEK SEVKİYAT GETİR ───────────────────────────────────────────────────────
def get_shipment(shipment_id):
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute('SELECT * FROM shipments WHERE id = %s', (shipment_id,))
    row  = cur.fetchone()
    cols = [d[0] for d in cur.description]
    cur.close()
    conn.close()
    if not row:
        return None
    return dict(zip(cols, row))


# ── SEVKİYAT OLUŞTUR ─────────────────────────────────────────────────────────
def create_shipment(data):
    fatura_no = data.get('fatura_no', '')
    if fatura_no:
        conn = get_conn()
        cur  = conn.cursor()
        cur.execute('SELECT id FROM shipments WHERE fatura_no = %s', (fatura_no,))
        if cur.fetchone():
            cur.close()
            conn.close()
            raise ValueError(f'Bu fatura no zaten kayıtlı: {fatura_no}')
        cur.close()
        conn.close()

    ulke         = data.get('ulke', '')
    musteri_tipi = data.get('musteri_tipi') or _musteri_tipi_from_ulke(ulke)

    # Franchise veya toptan ise: varış ve gümrükleme bitiş = gümrük tarihi, durum = TESLİM EDİLDİ
    gumruk_tarihi = data.get('gumruk_tarihi') or None
    if musteri_tipi in ('franchise', 'toptan') and gumruk_tarihi:
        varis_tarihi      = gumruk_tarihi
        gumrukleme_bitis  = gumruk_tarihi
        durum_default     = 'TESLİM EDİLDİ'
    else:
        varis_tarihi      = data.get('varis_tarihi') or None
        gumrukleme_bitis  = data.get('gumrukleme_bitis') or None
        durum_default     = data.get('durum', 'YOLDA')

    conn = get_conn()
    cur  = conn.cursor()
    cur.execute('''
        INSERT INTO shipments (
            ihracat_dosya_no, fatura_no, ulke, nakliye_firmasi, plaka,
            fatura_bedeli_tl, mal_bedeli_eur, navlun_eur, sigorta_eur,
            eur_kuru, fatura_bedeli_eur, yukleme_tarihi, gumruk_tarihi,
            varis_tarihi, gumrukleme_bitis, durum, musteri_tipi, palet
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        RETURNING id
    ''', (
        data.get('ihracat_dosya_no', ''),
        fatura_no,
        ulke,
        data.get('nakliye_firmasi', ''),
        data.get('plaka', ''),
        data.get('fatura_bedeli_tl', 0),
        data.get('mal_bedeli_eur', 0),
        data.get('navlun_eur', 0),
        data.get('sigorta_eur', 0),
        data.get('eur_kuru', 0),
        data.get('fatura_bedeli_eur', 0),
        data.get('yukleme_tarihi') or None,
        gumruk_tarihi,
        varis_tarihi,
        gumrukleme_bitis,
        _normalize_durum(durum_default),
        musteri_tipi,
        data.get('palet') or None,
    ))
    new_id = cur.fetchone()[0]
    conn.commit()
    cur.close()
    conn.close()
    return new_id


# ── SEVKİYAT GÜNCELLE ────────────────────────────────────────────────────────
def update_shipment(shipment_id, data):
    conn = get_conn()
    cur  = conn.cursor()

    toplam = (
        float(data.get('ihracat_beyanname_eur', 0) or 0) +
        float(data.get('arac_bekleme', 0) or 0) +
        float(data.get('brokerage_eur', 0) or 0) +
        float(data.get('gumruk_vergisi_eur', 0) or 0) +
        float(data.get('kdv_eur', 0) or 0)
    )

    cur.execute('''
        UPDATE shipments SET
            ihracat_dosya_no      = %s,
            nakliye_firmasi       = %s,
            plaka                 = %s,
            fatura_bedeli_tl      = %s,
            fatura_bedeli_eur     = %s,
            mal_bedeli_eur        = %s,
            navlun_eur            = %s,
            sigorta_eur           = %s,
            eur_kuru              = %s,
            ihracat_beyanname_tl  = %s,
            ihracat_beyanname_eur = %s,
            arac_bekleme          = %s,
            brokerage_eur         = %s,
            gumruk_vergisi_eur    = %s,
            kdv_eur               = %s,
            toplam_maliyet_eur    = %s,
            varis_tarihi          = %s,
            gumrukleme_bitis      = %s,
            durum                 = %s,
            palet                 = %s
        WHERE id = %s
    ''', (
        data.get('ihracat_dosya_no', ''),
        data.get('nakliye_firmasi', ''),
        data.get('plaka', ''),
        data.get('fatura_bedeli_tl', 0),
        data.get('fatura_bedeli_eur', 0),
        data.get('mal_bedeli_eur', 0),
        data.get('navlun_eur', 0),
        data.get('sigorta_eur', 0),
        data.get('eur_kuru', 0),
        data.get('ihracat_beyanname_tl', 0),
        data.get('ihracat_beyanname_eur', 0),
        data.get('arac_bekleme', 0),
        data.get('brokerage_eur', 0),
        data.get('gumruk_vergisi_eur', 0),
        data.get('kdv_eur', 0),
        toplam,
        data.get('varis_tarihi') or None,
        data.get('gumrukleme_bitis') or None,
        _normalize_durum(data.get('durum', 'YOLDA')),
        data.get('palet') or None,
        shipment_id,
    ))
    conn.commit()
    cur.close()
    conn.close()


# ── DASHBOARD İSTATİSTİKLERİ ─────────────────────────────────────────────────
def get_dashboard_stats():
    conn = get_conn()
    cur  = conn.cursor()

    cur.execute('SELECT COUNT(*) FROM shipments')
    toplam = cur.fetchone()[0]

    # Yolda — sefer bazlı (grupluları 1 say)
    cur.execute('''
        SELECT COUNT(*) FROM (
            SELECT id FROM shipments WHERE sefer_id IS NULL AND upper(durum) = 'YOLDA'
            UNION ALL
            SELECT MIN(id) FROM shipments WHERE sefer_id IS NOT NULL AND upper(durum) = 'YOLDA' GROUP BY sefer_id
        ) t
    ''')
    yolda = cur.fetchone()[0]

    # Teslim edildi — sefer bazlı
    cur.execute('''
        SELECT COUNT(*) FROM (
            SELECT id FROM shipments WHERE sefer_id IS NULL AND upper(durum) IN ('TESLİM EDİLDİ', 'TESLIM EDILDI')
            UNION ALL
            SELECT MIN(id) FROM shipments WHERE sefer_id IS NOT NULL AND upper(durum) IN ('TESLİM EDİLDİ', 'TESLIM EDILDI') GROUP BY sefer_id
        ) t
    ''')
    teslim = cur.fetchone()[0]

    # Varış Gümrük — sefer bazlı
    cur.execute('''
        SELECT COUNT(*) FROM (
            SELECT id FROM shipments WHERE sefer_id IS NULL AND upper(durum) LIKE '%GÜMRÜK%'
            UNION ALL
            SELECT MIN(id) FROM shipments WHERE sefer_id IS NOT NULL AND upper(durum) LIKE '%GÜMRÜK%' GROUP BY sefer_id
        ) t
    ''')
    varis_gumruk = cur.fetchone()[0]

    cur.execute('SELECT COALESCE(SUM(fatura_bedeli_eur), 0) FROM shipments')
    toplam_eur = float(cur.fetchone()[0])

    # Sefer sayısı: gruplanmamışlar tek tek + her grup 1 sefer
    cur.execute('''
        SELECT COUNT(*) FROM (
            SELECT id FROM shipments WHERE sefer_id IS NULL
            UNION ALL
            SELECT MIN(id) FROM shipments WHERE sefer_id IS NOT NULL GROUP BY sefer_id
        ) t
    ''')
    sefer_sayisi = cur.fetchone()[0]

    # Toplam fatura sayısı
    cur.execute('SELECT COUNT(*) FROM shipments')
    toplam_fatura = cur.fetchone()[0]

    # Tek araç sefer sayısı (sefer_id NULL olanlar)
    cur.execute('SELECT COUNT(*) FROM shipments WHERE sefer_id IS NULL')
    tek_arac = cur.fetchone()[0]

    # Gruplu sefer sayısı (unique sefer_id sayısı)
    cur.execute('SELECT COUNT(DISTINCT sefer_id) FROM shipments WHERE sefer_id IS NOT NULL')
    gruplu_sefer = cur.fetchone()[0]

    # Gruplu fatura sayısı (sefer_id NOT NULL olanlar)
    cur.execute('SELECT COUNT(*) FROM shipments WHERE sefer_id IS NOT NULL')
    gruplu_fatura = cur.fetchone()[0]

    # Ülke dağılımı — sefer bazlı
    cur.execute('''
        SELECT ulke, COUNT(*) as sayi FROM (
            SELECT ulke, id FROM shipments WHERE sefer_id IS NULL
            UNION ALL
            SELECT ulke, MIN(id) FROM shipments WHERE sefer_id IS NOT NULL GROUP BY sefer_id, ulke
        ) t
        GROUP BY ulke
        ORDER BY sayi DESC
        LIMIT 8
    ''')
    ulkeler = [{'ulke': r[0], 'sayi': r[1]} for r in cur.fetchall()]

    cur.close()
    conn.close()

    return {
        'toplam':        toplam,
        'sefer_sayisi':  sefer_sayisi,
        'toplam_fatura': toplam_fatura,
        'tek_arac':      tek_arac,
        'gruplu_sefer':  gruplu_sefer,
        'gruplu_fatura': gruplu_fatura,
        'yolda':         yolda,
        'teslim':        teslim,
        'varis_gumruk':  varis_gumruk,
        'toplam_eur':    toplam_eur,
        'ulkeler':       ulkeler,
    }


# ── MALİYET RAPORU EXPORT ────────────────────────────────────────────────────
def export_shipments(ulke=None, durum=None, depo=None, musteri_tipi=None, ids=None):
    rows = get_all_shipments(ulke=ulke, durum=durum, musteri_tipi=musteri_tipi)
    if depo:
        rows = [r for r in rows if str(r.get('fatura_no', '')).startswith(depo)]
    if ids:
        rows = [r for r in rows if r.get('id') in ids]
    try:
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment
    except ImportError:
        return jsonify({'error': 'openpyxl kurulu değil'}), 500

    if not rows:
        return jsonify({'error': 'Veri bulunamadı'}), 404

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'Maliyet Raporu'

    headers = [
        'İhracat Dosya No', 'Fatura No', 'Depo', 'Ülke', 'Müşteri Tipi',
        'Nakliye Firması', 'Plaka', 'Grup', 'Palet',
        'Fatura Bedeli TL', 'Fatura Bedeli EUR', 'Mal Bedeli EUR',
        'Navlun EUR', 'Sigorta EUR', 'EUR Kuru',
        'Yükleme Tarihi', 'Gümrük Tarihi', 'Varış Tarihi', 'Gümrükleme Bitiş',
        'İhracat Beyanname TL', 'İhracat Beyanname EUR',
        'Araç Bekleme', 'Brokerage EUR', 'Gümrük Vergisi EUR', 'KDV EUR',
        'Durum',
    ]

    header_fill = PatternFill('solid', fgColor='1F3864')
    header_font = Font(name='Arial', bold=True, color='FFFFFF', size=10)
    for col_idx, header in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.font      = header_font
        cell.fill      = header_fill
        cell.alignment = Alignment(horizontal='center', vertical='center')

    TL_FMT  = '#,##0.00 ₺'
    EUR_FMT = '#,##0.00 €'
    NUM_FMT = '#,##0.0000'

    for row_idx, s in enumerate(rows, start=2):
        fatura_no = s.get('fatura_no', '')
        depo_val  = 'ANT' if str(fatura_no).startswith('ANT') else 'IHR'

        def c(col, val, fmt=None):
            cell = ws.cell(row=row_idx, column=col, value=val)
            if fmt: cell.number_format = fmt
            return cell

        c(1,  s.get('ihracat_dosya_no', ''))
        c(2,  fatura_no)
        c(3,  depo_val)
        c(4,  s.get('ulke', ''))
        c(5,  s.get('musteri_tipi', ''))
        c(6,  s.get('nakliye_firmasi', ''))
        c(7,  s.get('plaka', ''))
        c(8,  f"Grup {s['sefer_id']}" if s.get('sefer_id') else '')
        c(9,  s.get('palet') or '')
        c(10, float(s.get('fatura_bedeli_tl', 0) or 0),  TL_FMT)
        c(11, float(s.get('fatura_bedeli_eur', 0) or 0), EUR_FMT)
        c(12, float(s.get('mal_bedeli_eur', 0) or 0),    EUR_FMT)
        c(13, float(s.get('navlun_eur', 0) or 0),        EUR_FMT)
        c(14, float(s.get('sigorta_eur', 0) or 0),       EUR_FMT)
        c(15, float(s.get('eur_kuru', 0) or 0),          NUM_FMT)
        c(16, s.get('yukleme_tarihi', ''))
        c(17, s.get('gumruk_tarihi', ''))
        c(18, s.get('varis_tarihi', ''))
        c(19, s.get('gumrukleme_bitis', ''))
        c(20, float(s.get('ihracat_beyanname_tl', 0) or 0),  TL_FMT)
        c(21, float(s.get('ihracat_beyanname_eur', 0) or 0), EUR_FMT)
        c(22, float(s.get('arac_bekleme', 0) or 0),          EUR_FMT)
        c(23, float(s.get('brokerage_eur', 0) or 0),         EUR_FMT)
        c(24, float(s.get('gumruk_vergisi_eur', 0) or 0),    EUR_FMT)
        c(25, float(s.get('kdv_eur', 0) or 0),               EUR_FMT)
        c(26, s.get('durum', ''))

    for col_idx in range(1, len(headers) + 1):
        col_letter = ws.cell(row=1, column=col_idx).column_letter
        max_len    = len(str(ws.cell(row=1, column=col_idx).value or ''))
        for row_idx in range(2, len(rows) + 2):
            val = ws.cell(row=row_idx, column=col_idx).value
            if val is not None:
                max_len = max(max_len, len(str(val)))
        ws.column_dimensions[col_letter].width = min(max_len + 4, 50)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    return send_file(
        buf,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        as_attachment=True,
        download_name='maliyet_raporu.xlsx',
    )


# ── YARDIMCI ─────────────────────────────────────────────────────────────────
def _normalize_durum(raw):
    if not raw:
        return 'YOLDA'
    # Nokta, boşluk gibi karakterleri temizle
    s = raw.strip().rstrip('.').strip().upper()
    if s in ('YOLDA', 'IN TRANSIT', 'TRANSIT'):
        return 'YOLDA'
    if s in ('TESLIM EDILDI', 'TESLİM EDİLDİ', 'DELIVERED', 'TESLIM',
             'TESLIM EDILDI.', 'TESLİM EDİLDİ.'):
        return 'TESLİM EDİLDİ'
    if s in ('VARIŞ GÜMRÜK', 'VARIS GUMRUK', 'CUSTOMS', 'GÜMRÜKTE'):
        return 'Varış Gümrük'
    if s in ('HAZIRLANIYOR', 'HAZIRLANYOR', 'PREPARING'):
        return 'HAZIRLANIYOR'
    return raw.strip()


def _row_to_dict(row):
    return {
        'id':                    row[0],
        'ihracat_dosya_no':      row[1],
        'fatura_no':             row[2],
        'ulke':                  row[3],
        'nakliye_firmasi':       row[4],
        'plaka':                 row[5],
        'mal_bedeli_eur':        float(row[6]  or 0),
        'navlun_eur':            float(row[7]  or 0),
        'sigorta_eur':           float(row[8]  or 0),
        'eur_kuru':              float(row[9]  or 0),
        'fatura_bedeli_eur':     float(row[10] or 0),
        'fatura_bedeli_tl':      float(row[11] or 0),
        'durum':                 row[12],
        'yukleme_tarihi':        str(row[13]) if row[13] else None,
        'gumruk_tarihi':         str(row[14]) if row[14] else None,
        'varis_tarihi':          str(row[15]) if row[15] else None,
        'gumrukleme_bitis':      str(row[16]) if row[16] else None,
        'created_at':            row[17],
        'mal_bedeli_tl':         float(row[18] or 0),
        'ihracat_beyanname_tl':  float(row[19] or 0),
        'ihracat_beyanname_eur': float(row[20] or 0),
        'arac_bekleme':          float(row[21] or 0),
        'brokerage_eur':         float(row[22] or 0),
        'gumruk_vergisi_eur':    float(row[23] or 0),
        'kdv_eur':               float(row[24] or 0),
        'toplam_maliyet_eur':    float(row[25] or 0),
        'musteri_tipi':          row[26] if len(row) > 26 else 'kurumsal',
        'sefer_id':              row[27] if len(row) > 27 else None,
        'palet':                 row[28] if len(row) > 28 else None,
    }


# ── FLASK ROUTE FONKSİYONLARI ─────────────────────────────────────────────────
def shipments_get():
    mode         = request.args.get('mode')
    ulke         = request.args.get('ulke')
    durum        = request.args.get('durum')
    musteri_tipi = request.args.get('musteri_tipi')
    sid          = request.args.get('id')

    if mode == 'dashboard':
        return jsonify({'success': True, 'stats': get_dashboard_stats()})

    if sid:
        s = get_shipment(int(sid))
        if not s:
            return jsonify({'success': False, 'error': 'Bulunamadı'}), 404
        return jsonify({'success': True, 'shipment': s})

    shipments = get_all_shipments(ulke=ulke, durum=durum, musteri_tipi=musteri_tipi)
    return jsonify({'success': True, 'shipments': shipments})


def shipments_post():
    body = request.get_json() or {}
    try:
        new_id = create_shipment(body)
        return jsonify({'success': True, 'id': new_id})
    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 400


def shipments_put():
    body = request.get_json() or {}
    sid  = body.get('id')
    if not sid:
        return jsonify({'success': False, 'error': 'id gerekli'}), 400
    update_shipment(int(sid), body)
    return jsonify({'success': True})


def shipments_delete():
    body = request.get_json() or {}
    sid  = body.get('id')
    if not sid:
        return jsonify({'success': False, 'error': 'id gerekli'}), 400
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute('DELETE FROM shipments WHERE id = %s', (int(sid),))
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({'success': True})
def bulk_update_shipments(rows):
    """
    Excel'den parse edilmiş satır listesini fatura_no eşleşimine göre günceller.
    rows: list of dict
    Döner: (guncellenen, atlanan, hatalar)
    """
    conn = get_conn()
    cur  = conn.cursor()
    guncellenen, atlanan, hatalar = 0, 0, []

    def to_float(v):
        try:
            if v in (None, '', 'nan'): return None
            s = str(v).strip()
            # Para birimi kelimelerini temizle
            s = s.replace('EUR', '').replace('USD', '').replace('BAM', '').replace('TRY', '')
            # Para birimi sembollerini temizle
            s = s.replace('€', '').replace('$', '').replace('₺', '').replace('£', '')
            # Boşluk ve non-breaking space temizle
            s = s.replace('\xa0', '').replace('\u202f', '').replace(' ', '')
            # Binlik ayraç ve ondalık düzelt
            # 1.234,56 formatı (Türkçe) → 1234.56
            if ',' in s and '.' in s:
                if s.rfind(',') > s.rfind('.'):
                    # Türkçe format: 1.234,56
                    s = s.replace('.', '').replace(',', '.')
                else:
                    # İngilizce format: 1,234.56
                    s = s.replace(',', '')
            elif ',' in s:
                s = s.replace(',', '.')
            s = s.strip()
            if not s or s == '-': return None
            return float(s)
        except: return None

    def to_date(v):
        if not v or str(v).strip() in ('', 'nan', 'None'): return None
        s = str(v).strip()
        if '/' in s:
            parts = s.split('/')
            if len(parts) == 3 and len(parts[2]) == 4:
                return f"{parts[2]}-{parts[1].zfill(2)}-{parts[0].zfill(2)}"
        if '.' in s:
            parts = s.split('.')
            if len(parts) == 3 and len(parts[2]) == 4:
                return f"{parts[2]}-{parts[1].zfill(2)}-{parts[0].zfill(2)}"
        return s[:10] if len(s) >= 10 else None

    def to_str(v):
        if v is None or str(v).strip() in ('', 'nan', 'None'): return None
        return str(v).strip()

    for i, row in enumerate(rows):
        try:
            fatura_no = to_str(row.get('fatura_no'))
            if not fatura_no:
                atlanan += 1
                hatalar.append(f'Satır {i+1}: fatura_no boş, atlandı.')
                continue

            # Kayıt var mı kontrol et
            cur.execute('SELECT id FROM shipments WHERE fatura_no = %s', (fatura_no,))
            existing = cur.fetchone()
            if not existing:
                atlanan += 1
                hatalar.append(f'Satır {i+1}: {fatura_no} bulunamadı, atlandı.')
                continue

            # Sadece gönderilen alanları güncelle (None olanları atla)
            fields = {}
            mapping = {
                'ulke': to_str, 'ihracat_dosya_no': to_str,
                'nakliye_firmasi': to_str, 'plaka': to_str,
                'fatura_bedeli_tl': to_float, 'mal_bedeli_tl': to_float,
                'mal_bedeli_eur': to_float, 'navlun_eur': to_float,
                'sigorta_eur': to_float, 'eur_kuru': to_float,
                'fatura_bedeli_eur': to_float, 'arac_bekleme': to_float,
                'ihracat_beyanname_tl': to_float, 'ihracat_beyanname_eur': to_float,
                'brokerage_eur': to_float, 'gumruk_vergisi_eur': to_float,
                'kdv_eur': to_float, 'toplam_maliyet_eur': to_float,
                'durum': to_str,  # aşağıda varis_tarihi kontrolü yapılıyor
            }
            date_fields = ['yukleme_tarihi', 'gumruk_tarihi', 'varis_tarihi', 'gumrukleme_bitis']

            for col, fn in mapping.items():
                if col in row:
                    val = fn(row[col])
                    if val is not None:
                        fields[col] = val

            for col in date_fields:
                if col in row:
                    val = to_date(row[col])
                    if val is not None:
                        fields[col] = val

            # Durum boşsa varış tarihine göre otomatik belirle
            if 'durum' not in fields or not fields.get('durum'):
                varis = fields.get('varis_tarihi') or to_date(row.get('varis_tarihi'))
                if varis:
                    fields['durum'] = 'TESLİM EDİLDİ'
                elif 'durum' not in fields:
                    fields['durum'] = 'YOLDA'

            if not fields:
                atlanan += 1
                hatalar.append(f'Satır {i+1}: {fatura_no} — güncellenecek alan yok.')
                continue

            set_clause = ', '.join(f'{k} = %s' for k in fields)
            values = list(fields.values()) + [fatura_no]
            cur.execute(f'UPDATE shipments SET {set_clause} WHERE fatura_no = %s', values)
            guncellenen += 1

        except Exception as e:
            hatalar.append(f'Satır {i+1}: {str(e)}')

    conn.commit()
    cur.close()
    conn.close()
    return guncellenen, atlanan, hatalar

def _otomatik_durum(durum, varis_tarihi):
    """Durum boşsa varış tarihine göre otomatik belirle."""
    if durum and durum.strip():
        return durum
    if varis_tarihi:
        return 'TESLİM EDİLDİ'
    return 'YOLDA'

def bulk_import_shipments(rows):
    """
    Excel'den parse edilmiş satır listesini toplu olarak shipments tablosuna ekler.
    rows: list of dict
    Döner: (eklenen, atlanan, hatalar)
    """
    conn = get_conn()
    cur  = conn.cursor()
    eklenen, atlanan, hatalar = 0, 0, []

    def to_float(v):
        # € $ ₺ sembollerini, boşlukları ve binlik ayraçları temizle
        try:
            if v in (None, '', 'nan'): return 0.0
            s = str(v).strip()
            # Para birimi kelimelerini temizle
            s = s.replace('EUR', '').replace('USD', '').replace('BAM', '').replace('TRY', '')
            # Para birimi sembollerini temizle
            s = s.replace('€', '').replace('$', '').replace('₺', '')
            s = s.replace('\xa0', '').replace(' ', '')
            # 1,234.56 formatı (binlik virgül, ondalık nokta)
            if ',' in s and '.' in s:
                s = s.replace(',', '')
            # 1.234,56 formatı (binlik nokta, ondalık virgül)
            elif ',' in s and '.' not in s:
                s = s.replace(',', '.')
            s = s.strip()
            if not s or s == '-': return 0.0
            return float(s)
        except: return 0.0

    def to_date(v):
        # Tarihi YYYY-MM-DD formatına çevir
        if not v or str(v).strip() in ('', 'nan', 'None'): return None
        s = str(v).strip()
        # DD/MM/YYYY → YYYY-MM-DD
        if '/' in s:
            parts = s.split('/')
            if len(parts) == 3 and len(parts[2]) == 4:
                return f"{parts[2]}-{parts[1].zfill(2)}-{parts[0].zfill(2)}"
        # DD.MM.YYYY → YYYY-MM-DD
        if '.' in s:
            parts = s.split('.')
            if len(parts) == 3 and len(parts[2]) == 4:
                return f"{parts[2]}-{parts[1].zfill(2)}-{parts[0].zfill(2)}"
        # Zaten YYYY-MM-DD veya uzun string, ilk 10 karakter al
        return s[:10] if len(s) >= 10 else None

    def to_str(v):
        if v is None or str(v).strip() in ('', 'nan', 'None'): return ''
        return str(v).strip()

    for i, row in enumerate(rows):
        try:
            fatura_no = to_str(row.get('fatura_no'))
            if fatura_no:
                cur.execute('SELECT id FROM shipments WHERE fatura_no = %s', (fatura_no,))
                if cur.fetchone():
                    atlanan += 1
                    hatalar.append(f'Satır {i+1}: {fatura_no} zaten kayıtlı, atlandı.')
                    continue

            ulke         = to_str(row.get('ulke'))
            musteri_tipi = to_str(row.get('musteri_tipi')) or _musteri_tipi_from_ulke(ulke)

            cur.execute('''
                INSERT INTO shipments (
                    arac_sira_no, ulke, ihracat_dosya_no, nakliye_firmasi, plaka,
                    fatura_no, palet, aciklama,
                    fatura_bedeli_tl, mal_bedeli_tl, mal_bedeli_eur,
                    navlun_eur, sigorta_eur, eur_kuru, fatura_bedeli_eur,
                    arac_bekleme, ihracat_beyanname_tl, ihracat_beyanname_eur,
                    brokerage_yerel, brokerage_birim, brokerage_eur,
                    gumruk_vergisi_yerel, gumruk_vergisi_birim, gumruk_vergisi_eur,
                    kdv_yerel, kdv_birim, kdv_eur,
                    toplam_maliyet_eur,
                    yukleme_tarihi, gumruk_tarihi, varis_tarihi, gumrukleme_bitis,
                    durum, musteri_tipi
                ) VALUES (
                    %s,%s,%s,%s,%s,%s,%s,%s,
                    %s,%s,%s,%s,%s,%s,%s,
                    %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                    %s,%s,%s,%s,%s,%s
                )
            ''', (
                row.get('arac_sira_no') or None,
                ulke,
                to_str(row.get('ihracat_dosya_no')),
                to_str(row.get('nakliye_firmasi')),
                to_str(row.get('plaka')),
                fatura_no,
                to_str(row.get('palet')),
                to_str(row.get('aciklama')),
                to_float(row.get('fatura_bedeli_tl')),
                to_float(row.get('mal_bedeli_tl')),
                to_float(row.get('mal_bedeli_eur')),
                to_float(row.get('navlun_eur')),
                to_float(row.get('sigorta_eur')),
                to_float(row.get('eur_kuru')),
                to_float(row.get('fatura_bedeli_eur')),
                to_float(row.get('arac_bekleme')),
                to_float(row.get('ihracat_beyanname_tl')),
                to_float(row.get('ihracat_beyanname_eur')),
                to_float(row.get('brokerage_yerel')),
                to_str(row.get('brokerage_birim')),
                to_float(row.get('brokerage_eur')),
                to_float(row.get('gumruk_vergisi_yerel')),
                to_str(row.get('gumruk_vergisi_birim')),
                to_float(row.get('gumruk_vergisi_eur')),
                to_float(row.get('kdv_yerel')),
                to_str(row.get('kdv_birim')),
                to_float(row.get('kdv_eur')),
                to_float(row.get('toplam_maliyet_eur')),
                to_date(row.get('yukleme_tarihi')),
                to_date(row.get('gumruk_tarihi')),
                to_date(row.get('varis_tarihi')),
                to_date(row.get('gumrukleme_bitis')),
                _normalize_durum(_otomatik_durum(to_str(row.get('durum', '')), to_date(row.get('varis_tarihi')))),
                musteri_tipi,
            ))
            eklenen += 1
        except Exception as e:
            hatalar.append(f'Satır {i+1}: {str(e)}')

    conn.commit()
    cur.close()
    conn.close()
    return eklenen, atlanan, hatalar


# ── FR PDF TOPLU IMPORT ENDPOINT ─────────────────────────────────────────────
def parse_fr_pdf_import():
    """
    Çoklu FR fatura PDF'lerini parse eder, önizleme için veri döner.
    POST /api/shipments/parse-fr-pdf
    Body: { "pdfs": [ { "name": "ANT2026...", "data": "<base64>" }, ... ] }
    """
    import base64

    body = request.get_json() or {}
    pdfs = body.get('pdfs', [])

    if not pdfs:
        return jsonify({'success': False, 'error': 'PDF listesi boş'}), 400

    sonuclar = []

    for item in pdfs:
        name     = item.get('name', '')
        b64data  = item.get('data', '')

        try:
            pdf_bytes = base64.b64decode(b64data)
            parsed    = parse_fr_fatura_pdf(pdf_bytes)

            usd_kuru = parsed.get('usd_kuru', 0.0)
            if not usd_kuru and parsed.get('yukleme_tarihi'):
                usd_kuru = _get_usd_kuru_for_date(parsed['yukleme_tarihi'])

            usd_tutar = parsed.get('fatura_bedeli_usd', 0.0)
            fatura_tl = round(usd_tutar * usd_kuru, 2) if usd_kuru else 0.0

            sonuclar.append({
                'dosya_adi':         name,
                'fatura_no':         parsed.get('fatura_no'),
                'yukleme_tarihi':    parsed.get('yukleme_tarihi'),
                'fatura_bedeli_usd': usd_tutar,
                'usd_kuru':          usd_kuru,
                'fatura_bedeli_tl':  fatura_tl,
                'palet':             parsed.get('palet'),
                'hata':              None,
            })

        except Exception as e:
            sonuclar.append({
                'dosya_adi': name,
                'fatura_no': None,
                'hata':      str(e),
            })

    return jsonify({'success': True, 'sonuclar': sonuclar})


def bulk_import_fr_shipments():
    """
    Parse edilmiş FR faturalarını toplu olarak shipments tablosuna ekler.
    POST /api/shipments/bulk-import-fr
    Body: { "rows": [ { fatura_no, yukleme_tarihi, fatura_bedeli_usd, usd_kuru, fatura_bedeli_tl, eur_kuru } ] }
    """
    body = request.get_json() or {}
    rows = body.get('rows', [])

    if not rows:
        return jsonify({'success': False, 'error': 'Satır listesi boş'}), 400

    eklenen, atlanan, hatalar = 0, 0, []

    for i, row in enumerate(rows):
        try:
            fatura_no = str(row.get('fatura_no', '')).strip()
            if not fatura_no:
                atlanan += 1
                hatalar.append(f'Satır {i+1}: fatura_no boş, atlandı.')
                continue

            conn = get_conn()
            cur  = conn.cursor()
            cur.execute('SELECT id FROM shipments WHERE fatura_no = %s', (fatura_no,))
            if cur.fetchone():
                cur.close()
                conn.close()
                atlanan += 1
                hatalar.append(f'{fatura_no}: zaten kayıtlı, atlandı.')
                continue
            cur.close()
            conn.close()

            usd_tutar  = float(row.get('fatura_bedeli_usd', 0) or 0)
            usd_kuru   = float(row.get('usd_kuru', 0) or 0)
            fatura_tl  = float(row.get('fatura_bedeli_tl', 0) or 0)
            eur_kuru   = float(row.get('eur_kuru', 0) or 0)   # 1 EUR = kaç TL
            usd_per_eur = float(row.get('usd_per_eur', 0) or 0)  # 1 EUR = kaç USD

            # USD → EUR: usd_per_eur varsa kullan, yoksa TL üzerinden hesapla
            if usd_per_eur:
                fatura_eur = round(usd_tutar / usd_per_eur, 2)
            elif eur_kuru and usd_kuru:
                # 1 EUR = eur_kuru TL, 1 USD = usd_kuru TL → 1 EUR = eur_kuru/usd_kuru USD
                fatura_eur = round(usd_tutar / (eur_kuru / usd_kuru), 2)
            else:
                fatura_eur = 0.0

            yukleme_tarihi = row.get('yukleme_tarihi') or None

            new_id = create_shipment({
                'fatura_no':          fatura_no,
                'ihracat_dosya_no':   str(row.get('ihracat_dosya_no', '') or ''),
                'ulke':               'IRAK',
                'musteri_tipi':       'franchise',
                'nakliye_firmasi':    str(row.get('nakliye_firmasi', '') or ''),
                'plaka':              str(row.get('plaka', '') or ''),
                'yukleme_tarihi':     yukleme_tarihi,
                'gumruk_tarihi':      yukleme_tarihi,
                'fatura_bedeli_tl':   fatura_tl,
                'fatura_bedeli_eur':  fatura_eur,
                'eur_kuru':           eur_kuru,
                'durum':              'TESLİM EDİLDİ',
            })
            eklenen += 1

        except ValueError as e:
            atlanan += 1
            hatalar.append(str(e))
        except Exception as e:
            hatalar.append(f'Satır {i+1}: {str(e)}')

    return jsonify({
        'success': True,
        'eklenen': eklenen,
        'atlanan': atlanan,
        'hatalar': hatalar,
    })


def _get_usd_kuru_for_date(tarih_str):
    """
    Verilen tarihe (YYYY-MM-DD) ait USD/TRY kurunu Frankfurter API'den çeker.
    Bulunamazsa 0.0 döner.
    """
    import urllib.request
    import json

    try:
        url = f'https://api.frankfurter.app/{tarih_str}?from=USD&to=TRY'
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode())
            return float(data['rates']['TRY'])
    except Exception as e:
        print(f'USD kuru API hatası ({tarih_str}): {e}')
        return 0.0


def shipments_export():
    ulke         = request.args.get('ulke')
    durum        = request.args.get('durum')
    depo         = request.args.get('depo')
    musteri_tipi = request.args.get('musteri_tipi')
    ids_raw      = request.args.get('ids')
    ids          = [int(i) for i in ids_raw.split(',') if i.strip().isdigit()] if ids_raw else None
    return export_shipments(ulke=ulke, durum=durum, depo=depo, musteri_tipi=musteri_tipi, ids=ids)

# ── GRUPLAMA ──────────────────────────────────────────────────────────────────
def group_shipments(shipment_ids):
    """Verilen id'lere yeni bir sefer_id ata."""
    if not shipment_ids:
        return

    conn = get_conn()
    cur  = conn.cursor()

    # Mevcut en yüksek sefer_id'yi bul, 1 artır
    cur.execute('SELECT COALESCE(MAX(sefer_id), 0) + 1 FROM shipments')
    new_sefer_id = cur.fetchone()[0]

    cur.execute(
        'UPDATE shipments SET sefer_id = %s WHERE id = ANY(%s)',
        (new_sefer_id, shipment_ids)
    )
    conn.commit()
    cur.close()
    conn.close()
    return new_sefer_id


def ungroup_shipment(shipment_id):
    """Tek bir kaydı gruptan çıkar."""
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute('UPDATE shipments SET sefer_id = NULL WHERE id = %s', (shipment_id,))
    conn.commit()
    cur.close()
    conn.close()
    
    
def bulk_update_palet(rows):
    """
    Fatura no eşleşimine göre palet alanını toplu günceller.
    rows: [{ fatura_no, palet }, ...]
    Döner: (guncellenen, atlanan, hatalar)
    """
    conn = get_conn()
    cur  = conn.cursor()
    guncellenen, atlanan, hatalar = 0, 0, []

    for i, row in enumerate(rows):
        try:
            fatura_no = str(row.get('fatura_no', '')).strip()
            palet     = str(row.get('palet', '')).strip()
            if not fatura_no or not palet:
                atlanan += 1
                continue

            cur.execute('SELECT id FROM shipments WHERE fatura_no = %s', (fatura_no,))
            if not cur.fetchone():
                atlanan += 1
                hatalar.append(f'{fatura_no}: kayıt bulunamadı, atlandı.')
                continue

            cur.execute('UPDATE shipments SET palet = %s WHERE fatura_no = %s', (palet, fatura_no))
            guncellenen += 1

        except Exception as e:
            hatalar.append(f'Satır {i+1}: {str(e)}')

    conn.commit()
    cur.close()
    conn.close()
    return guncellenen, atlanan, hatalar


def bulk_delete_shipments(ids):
    """Birden fazla sevkiyatı id listesine göre siler."""
    if not ids:
        return 0
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute('DELETE FROM shipments WHERE id = ANY(%s)', (ids,))
    deleted = cur.rowcount
    conn.commit()
    cur.close()
    conn.close()
    return deleted

# ── SIRBİSTAN VERGİ PDF PARSE ────────────────────────────────────────────────
def parse_rs_vergi_pdf(pdf_bytes):
    """
    Sırbistan gümrük faturasından CARINA ve POREZ NA DODATU VREDNOST çeker.
    Format: 4.071,40 (binlik nokta, ondalık virgül)
    """
    result = {'carina': 0.0, 'pdv': 0.0, 'svega': 0.0}

    def parse_rs_sayi(s):
        s = s.strip().replace('.', '').replace(',', '.')
        try:
            return float(s)
        except:
            return 0.0

    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            text = ' '.join((p.extract_text() or '') for p in pdf.pages)
        text = re.sub(r'\s+', ' ', text)

        m = re.search(r'CARINA\s+([\d.,]+)', text)
        if m:
            result['carina'] = parse_rs_sayi(m.group(1))

        m = re.search(r'POREZ NA DODATU VREDNOST\s+([\d.,]+)', text)
        if m:
            result['pdv'] = parse_rs_sayi(m.group(1))

        m = re.search(r'SVEGA\s+([\d.,]+)', text)
        if m:
            result['svega'] = parse_rs_sayi(m.group(1))

    except Exception as e:
        print(f'RS vergi PDF parse hatası: {e}')

    return result


def parse_rs_brokerage_pdf(pdf_bytes):
    """
    M&M gibi Sırbistan spediter faturasından 'Naši troškovi bez PDV-a' tutarını çeker.
    Format: 13.616,06 (binlik nokta, ondalık virgül)
    """
    result = {'nasi_troskovi': 0.0}

    def parse_rs_sayi(s):
        s = s.strip().replace('.', '').replace(',', '.')
        try:
            return float(s)
        except:
            return 0.0

    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            text = ' '.join((p.extract_text() or '') for p in pdf.pages)
        text = re.sub(r'\s+', ' ', text)

        m = re.search(r'Na[šs]i tro[šs]kovi bez PDV-a[:\s]*([\d.,]+)', text, re.IGNORECASE)
        if m:
            result['nasi_troskovi'] = parse_rs_sayi(m.group(1))

    except Exception as e:
        print(f'RS brokerage PDF parse hatası: {e}')

    return result

def parse_aksu_beyanname_pdf(pdf_bytes):
    """
    Aksu Gümrük e-faturasından tüm faturaları parse eder.
    Fatura sayfası (Vergiler Hariç Toplam Tutar) + özet sayfası (MÜŞTERİ REF.NO) çifti.
    """
    faturalar = []

    def parse_tl_sayi(s):
        s = str(s).strip().replace('.', '').replace(',', '.').replace('TL', '').strip()
        try:
            return float(s)
        except:
            return 0.0

    def extract_ref_no(text):
        # "POZİSYON NO H-26-01461 2026-281 EŞYANIN CİNSİ" → 2026-281
        m = re.search(r'POZ[İI]SYON NO\s+\S+\s+(\d{4}-\d+)', text)
        if m:
            return m.group(1).strip()
        return None

    def extract_fatura_no(text):
        # "MÜŞTERİ FATURA NO IHR2026..." veya "MÜŞTERİ 26TR... NOT" formatı
        m = re.search(r'MÜŞTER[İI]\s+(?:FATURA\s+NO\s+)?((?:IHR|ANT)\d+)', text, re.IGNORECASE)
        if m:
            return m.group(1).strip()
        return None

    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            pages_text = []
            for page in pdf.pages:
                raw = page.extract_text() or ''
                pages_text.append(re.sub(r'\s+', ' ', raw))

        i = 0
        while i < len(pages_text):
            text = pages_text[i]

            if 'Vergiler Hariç Toplam Tutar' in text:
                # Fatura sayfası
                tutar     = 0.0
                ref_no    = None
                fatura_no = None

                m = re.search(r'Vergiler Hariç Toplam Tutar\s+([\d.,]+)', text)
                if m:
                    tutar = parse_tl_sayi(m.group(1))

                # Ref ve fatura no aynı sayfada olabilir
                ref_no    = extract_ref_no(text)
                fatura_no = extract_fatura_no(text)

                # Bir sonraki sayfa özet sayfasıysa oradan da al
                if i + 1 < len(pages_text):
                    next_text = pages_text[i + 1]
                    if 'POZİSYON NO' in next_text or 'MÜŞTERİ REF' in next_text:
                        if not ref_no:
                            ref_no = extract_ref_no(next_text)
                        if not fatura_no:
                            fatura_no = extract_fatura_no(next_text)
                        i += 2
                    else:
                        i += 1
                else:
                    i += 1

                faturalar.append({
                    'ref_no':    ref_no,
                    'fatura_no': fatura_no,
                    'tutar_tl':  tutar,
                })
            else:
                i += 1

    except Exception as e:
        print(f'Aksu beyanname PDF parse hatası: {e}')

    return faturalar


# ── FR FATURA PDF PARSE ───────────────────────────────────────────────────────
def parse_fr_fatura_pdf(pdf_bytes):
    """
    ANT (e-Arşiv) ve IHR (e-Fatura) formatındaki franchise faturalarını parse eder.
    Sadece ilk sayfa + son 2 sayfa okunur (performans için).
    """
    result = {
        'fatura_no':        None,
        'yukleme_tarihi':   None,
        'fatura_bedeli_usd': 0.0,
        'usd_kuru':          0.0,
        'fatura_tipi':      None,  # 'ANT' veya 'IHR'
        'palet':            None,
    }

    def parse_tr_sayi(s):
        # 59.073,14 → 59073.14
        s = str(s).strip().replace('.', '').replace(',', '.').strip()
        try:
            return float(s)
        except:
            return 0.0

    def parse_tarih(s):
        # "06-01-2026 / 15:13" veya "22- 01- 2026" → "2026-01-06"
        s = re.sub(r'\s+', '', s)          # boşlukları kaldır
        s = re.sub(r'/.*', '', s).strip()  # saat kısmını at
        parts = s.split('-')
        if len(parts) == 3 and len(parts[2]) == 4:
            return f"{parts[2]}-{parts[1].zfill(2)}-{parts[0].zfill(2)}"
        return None

    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            total = len(pdf.pages)
            # İlk sayfa + son 2 sayfa (max 3 sayfa, üst üste gelirse tekrar alma)
            idxs = list(dict.fromkeys(
                [0] + [i for i in [total - 2, total - 1] if i >= 0]
            ))
            pages_text = []
            for i in idxs:
                raw = pdf.pages[i].extract_text() or ''
                pages_text.append(re.sub(r'\s+', ' ', raw))

        full = ' '.join(pages_text)

        # ── Fatura No ────────────────────────────────────────────────────────
        m = re.search(r'Fatura No[:\s]*((?:ANT|IHR)\d+)', full)
        if m:
            result['fatura_no'] = m.group(1).strip()
            result['fatura_tipi'] = 'ANT' if result['fatura_no'].startswith('ANT') else 'IHR'

        # ── Tarih ────────────────────────────────────────────────────────────
        if result['fatura_tipi'] == 'ANT':
            # "Tarih / Saat: 06-01-2026 / 15:13"
            m = re.search(r'Tarih\s*/\s*Saat[:\s]*([\d][\d\s\-]+)', full)
        else:
            # "Tarih: 22- 01- 2026"
            m = re.search(r'Tarih[:\s]*([\d][\d\s\-]+)', full)

        if m:
            result['yukleme_tarihi'] = parse_tarih(m.group(1))

        # ── USD Tutar ────────────────────────────────────────────────────────
        if result['fatura_tipi'] == 'ANT':
            # "Ürün Bedeli: 59.073,14 USD"
            m = re.search(r'Ürün Bedeli[:\s]*([\d.,]+)\s*USD', full)
        else:
            # "Mal Hizmet Toplam Tutarı: 46.289,24USD"
            m = re.search(r'Mal Hizmet Toplam Tutarı[:\s]*([\d.,]+)\s*USD', full)

        if m:
            result['fatura_bedeli_usd'] = parse_tr_sayi(m.group(1))

        # ── Döviz Kuru ───────────────────────────────────────────────────────
        # Her iki formatta da: "Döviz Kuru: 42,9648 TL"
        m = re.search(r'Döviz Kuru[:\s]*([\d.,]+)\s*TL', full)
        if m:
            result['usd_kuru'] = parse_tr_sayi(m.group(1))

        # ── Palet / Kap ──────────────────────────────────────────────────────
        m = re.search(r'KAP(?:\s*ADETİ)?[:\s]*([\d]+(?:\s*\([^)]+\))?)', full, re.IGNORECASE)
        if m:
            import math
            kap_str = m.group(1).strip()
            kap = int(re.search(r'[\d]+', kap_str).group())
            if result['fatura_tipi'] == 'ANT':
                palet = math.ceil(kap / 30)
                result['palet'] = f'{kap} ({palet})'
            else:
                # IHR: parantez varsa tümünü al, yoksa sadece sayıyı al
                result['palet'] = kap_str

    except Exception as e:
        print(f'FR fatura PDF parse hatası: {e}')

    return result
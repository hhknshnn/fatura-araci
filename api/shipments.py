# api/shipments.py
# Sevkiyat kayıtları — PostgreSQL tabanlı

import io
import time
from flask import request, jsonify, send_file
from api.db import get_conn
from api.auth import get_session_from_headers


# ── TÜM SEVKİYATLARI GETİR ───────────────────────────────────────────────────
def get_all_shipments(ulke=None, durum=None):
    conn = get_conn()
    cur  = conn.cursor()

    query = '''
        SELECT id, ihracat_dosya_no, fatura_no, ulke, nakliye_firmasi, plaka,
               mal_bedeli_eur, navlun_eur, sigorta_eur, eur_kuru, fatura_bedeli_eur,
               fatura_bedeli_tl, durum, yukleme_tarihi, gumruk_tarihi,
               varis_tarihi, gumrukleme_bitis, created_at
        FROM shipments
        WHERE 1=1
    '''
    params = []

    if ulke:
        # Case-insensitive eşleşme — DB'de SIRBİSTAN var, kullanıcı Sırbistan gönderir
        query += ' AND unaccent(lower(ulke)) = unaccent(lower(%s))'
        params.append(ulke)
    if durum:
        # Durum değerleri büyük harf olarak tutulur
        query += ' AND upper(durum) = upper(%s)'
        params.append(durum)

    query += ' ORDER BY ihracat_dosya_no ASC'

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
    row = cur.fetchone()
    cols = [d[0] for d in cur.description]
    cur.close()
    conn.close()
    if not row:
        return None
    return dict(zip(cols, row))


# ── SEVKİYAT OLUŞTUR ─────────────────────────────────────────────────────────
def create_shipment(data):
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute('''
        INSERT INTO shipments (
            ihracat_dosya_no, fatura_no, ulke, nakliye_firmasi, plaka,
            fatura_bedeli_tl, mal_bedeli_eur, navlun_eur, sigorta_eur,
            eur_kuru, fatura_bedeli_eur, yukleme_tarihi, gumruk_tarihi,
            varis_tarihi, durum
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        RETURNING id
    ''', (
        data.get('ihracat_dosya_no', ''),
        data.get('fatura_no', ''),
        data.get('ulke', ''),
        data.get('nakliye_firmasi', ''),
        data.get('plaka', ''),
        data.get('fatura_bedeli_tl', 0),
        data.get('mal_bedeli_eur', 0),
        data.get('navlun_eur', 0),
        data.get('sigorta_eur', 0),
        data.get('eur_kuru', 0),
        data.get('fatura_bedeli_eur', 0),
        data.get('yukleme_tarihi') or None,
        data.get('gumruk_tarihi') or None,
        data.get('varis_tarihi') or None, 
        # Durum değerini normalize ederek kaydet — her zaman büyük harf
        _normalize_durum(data.get('durum', 'YOLDA')),
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
            nakliye_firmasi      = %s,
            plaka                = %s,
            ihracat_beyanname_tl  = %s,
            ihracat_beyanname_eur = %s,
            arac_bekleme         = %s,
            brokerage_eur        = %s,
            gumruk_vergisi_eur   = %s,
            kdv_eur              = %s,
            toplam_maliyet_eur   = %s,
            varis_tarihi         = %s,
            gumrukleme_bitis     = %s,
            durum                = %s
        WHERE id = %s
    ''', (
        data.get('nakliye_firmasi', ''),
        data.get('plaka', ''),
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

    cur.execute("SELECT COUNT(*) FROM shipments WHERE upper(durum) = 'YOLDA'")
    yolda = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM shipments WHERE upper(durum) = 'TESLİM EDİLDİ'")
    teslim = cur.fetchone()[0]

    cur.execute('SELECT COALESCE(SUM(fatura_bedeli_eur), 0) FROM shipments')
    toplam_eur = float(cur.fetchone()[0])

    cur.execute('''
        SELECT ulke, COUNT(*) as sayi
        FROM shipments
        GROUP BY ulke
        ORDER BY sayi DESC
        LIMIT 8
    ''')
    ulkeler = [{'ulke': r[0], 'sayi': r[1]} for r in cur.fetchall()]

    cur.close()
    conn.close()

    return {
        'toplam':     toplam,
        'yolda':      yolda,
        'teslim':     teslim,
        'toplam_eur': toplam_eur,
        'ulkeler':    ulkeler,
    }


# ── MALİYET RAPORU EXPORT ────────────────────────────────────────────────────
def export_shipments(ulke=None):
    """Sevkiyatları Excel olarak döndür."""
    try:
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment
    except ImportError:
        return jsonify({'error': 'openpyxl kurulu değil'}), 500

    rows = get_all_shipments(ulke=ulke)
    if not rows:
        return jsonify({'error': 'Veri bulunamadı'}), 404

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'Maliyet Raporu'

    headers = [
        'İhracat Dosya No', 'Fatura No', 'Ülke', 'Nakliye Firması', 'Plaka',
        'Fatura Bedeli (EUR)', 'Fatura Bedeli (TL)', 'Yükleme Tarihi',
        'Varış Tarihi', 'Durum',
    ]

    # Header satırı
    header_fill = PatternFill('solid', fgColor='1F3864')
    header_font = Font(name='Arial', bold=True, color='FFFFFF', size=10)
    for col_idx, header in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.font      = header_font
        cell.fill      = header_fill
        cell.alignment = Alignment(horizontal='center', vertical='center')


    # Veri satırları
    for row_idx, s in enumerate(rows, start=2):
        ws.cell(row=row_idx, column=1,  value=s.get('ihracat_dosya_no', ''))
        ws.cell(row=row_idx, column=2,  value=s.get('fatura_no', ''))
        ws.cell(row=row_idx, column=3,  value=s.get('ulke', ''))
        ws.cell(row=row_idx, column=4,  value=s.get('nakliye_firmasi', ''))
        ws.cell(row=row_idx, column=5,  value=s.get('plaka', ''))
        ws.cell(row=row_idx, column=6,  value=s.get('fatura_bedeli_eur', 0))
        ws.cell(row=row_idx, column=7,  value=s.get('fatura_bedeli_tl', 0))
        ws.cell(row=row_idx, column=8,  value=s.get('yukleme_tarihi', ''))
        ws.cell(row=row_idx, column=9,  value=s.get('varis_tarihi', ''))
        ws.cell(row=row_idx, column=10, value=s.get('durum', ''))
    
    # Veri satırları yazıldıktan sonra otomatik genişlik ayarla
    for col_idx in range(1, len(headers) + 1):
        col_letter = ws.cell(row=1, column=col_idx).column_letter
        max_len = len(str(ws.cell(row=1, column=col_idx).value or ''))
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
        download_name=f'maliyet_raporu.xlsx',
    )


# ── YARDIMCI ─────────────────────────────────────────────────────────────────
def _normalize_durum(raw):
    """Durum değerini standart formata çevir."""
    if not raw:
        return 'YOLDA'
    s = raw.strip().upper()
    # Türkçe karakter normalizasyonu
    s = s.replace('İ', 'İ').replace('I', 'I')

    if s in ('YOLDA', 'IN TRANSIT', 'TRANSIT'):
        return 'YOLDA'
    if s in ('TESLIM EDILDI', 'TESLİM EDİLDİ', 'DELIVERED', 'TESLIM'):
        return 'TESLİM EDİLDİ'
    if s in ('VARIŞ GÜMRÜK', 'VARIS GUMRUK', 'CUSTOMS', 'GÜMRÜKTE'):
        return 'Varış Gümrük'
    if s in ('HAZIRLANIYOR', 'HAZIRLANYOR', 'PREPARING'):
        return 'HAZIRLANIYOR'

    return raw.strip()


def _row_to_dict(row):
    return {
        'id':                row[0],
        'ihracat_dosya_no':  row[1],
        'fatura_no':         row[2],
        'ulke':              row[3],
        'nakliye_firmasi':   row[4],
        'plaka':             row[5],
        'mal_bedeli_eur':    float(row[6]  or 0),
        'navlun_eur':        float(row[7]  or 0),
        'sigorta_eur':       float(row[8]  or 0),
        'eur_kuru':          float(row[9]  or 0),
        'fatura_bedeli_eur': float(row[10] or 0),
        'fatura_bedeli_tl':  float(row[11] or 0),
        'durum':             row[12],
        'yukleme_tarihi':    str(row[13]) if row[13] else None,
        'gumruk_tarihi':     str(row[14]) if row[14] else None,
        'varis_tarihi':      str(row[15]) if row[15] else None,
        'gumrukleme_bitis':  str(row[16]) if row[16] else None,
        'created_at':        row[17],
    }


# ── FLASK ROUTE FONKSİYONLARI ─────────────────────────────────────────────────
def shipments_get():
    """GET /api/shipments — listele veya dashboard stats"""
    mode  = request.args.get('mode')
    ulke  = request.args.get('ulke')
    durum = request.args.get('durum')
    sid   = request.args.get('id')

    if mode == 'dashboard':
        return jsonify({'success': True, 'stats': get_dashboard_stats()})

    if sid:
        s = get_shipment(int(sid))
        if not s:
            return jsonify({'success': False, 'error': 'Bulunamadı'}), 404
        return jsonify({'success': True, 'shipment': s})

    shipments = get_all_shipments(ulke=ulke, durum=durum)
    return jsonify({'success': True, 'shipments': shipments})


def shipments_post():
    """POST /api/shipments — yeni sevkiyat oluştur"""
    body   = request.get_json() or {}
    new_id = create_shipment(body)
    return jsonify({'success': True, 'id': new_id})


def shipments_put():
    """PUT /api/shipments — sevkiyat güncelle"""
    body = request.get_json() or {}
    sid  = body.get('id')
    if not sid:
        return jsonify({'success': False, 'error': 'id gerekli'}), 400
    update_shipment(int(sid), body)
    return jsonify({'success': True})


def shipments_export():
    """GET /api/shipments/export — Excel raporu"""
    ulke = request.args.get('ulke')
    return export_shipments(ulke=ulke)
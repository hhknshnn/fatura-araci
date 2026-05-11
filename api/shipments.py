# api/shipments.py
# Sevkiyat kayıtları — PostgreSQL tabanlı

import time
from flask import request, jsonify
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
        query += ' AND ulke = %s'
        params.append(ulke)
    if durum:
        query += ' AND durum = %s'
        params.append(durum)

    query += ' ORDER BY created_at DESC'

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
            eur_kuru, fatura_bedeli_eur, yukleme_tarihi, gumruk_tarihi, durum
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
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
        data.get('durum', 'YOLDA'),
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
    cur.execute('''
        UPDATE shipments SET
            nakliye_firmasi     = %s,
            plaka               = %s,
            ihracat_beyanname_tl = %s,
            ihracat_beyanname_eur = %s,
            arac_bekleme        = %s,
            brokerage_fee_eur   = %s,
            gumruk_vergisi_eur  = %s,
            kdv_eur             = %s,
            toplam_maliyet_eur  = %s,
            varis_tarihi        = %s,
            gumrukleme_bitis    = %s,
            durum               = %s
        WHERE id = %s
    ''', (
        data.get('nakliye_firmasi', ''),
        data.get('plaka', ''),
        data.get('ihracat_beyanname_tl', 0),
        data.get('ihracat_beyanname_eur', 0),
        data.get('arac_bekleme', 0),
        data.get('brokerage_fee_eur', 0),
        data.get('gumruk_vergisi_eur', 0),
        data.get('kdv_eur', 0),
        data.get('toplam_maliyet_eur', 0),
        data.get('varis_tarihi') or None,
        data.get('gumrukleme_bitis') or None,
        data.get('durum', 'YOLDA'),
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

    cur.execute("SELECT COUNT(*) FROM shipments WHERE durum = 'YOLDA'")
    yolda = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM shipments WHERE durum = 'TESLİM EDİLDİ'")
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
        'toplam': toplam,
        'yolda': yolda,
        'teslim': teslim,
        'toplam_eur': toplam_eur,
        'ulkeler': ulkeler,
    }


# ── YARDIMCI ─────────────────────────────────────────────────────────────────
def _row_to_dict(row):
    return {
        'id':               row[0],
        'ihracat_dosya_no': row[1],
        'fatura_no':        row[2],
        'ulke':             row[3],
        'nakliye_firmasi':  row[4],
        'plaka':            row[5],
        'mal_bedeli_eur':   float(row[6] or 0),
        'navlun_eur':       float(row[7] or 0),
        'sigorta_eur':      float(row[8] or 0),
        'eur_kuru':         float(row[9] or 0),
        'fatura_bedeli_eur':float(row[10] or 0),
        'fatura_bedeli_tl': float(row[11] or 0),
        'durum':            row[12],
        'yukleme_tarihi':   str(row[13]) if row[13] else None,
        'gumruk_tarihi':    str(row[14]) if row[14] else None,
        'varis_tarihi':     str(row[15]) if row[15] else None,
        'gumrukleme_bitis': str(row[16]) if row[16] else None,
        'created_at':       row[17],
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
    body = request.get_json() or {}
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
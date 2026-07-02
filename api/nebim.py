# api/nebim.py
# Nebim v3 entegrasyonu icin sevkiyat/fatura bazli hazirlik kayitlari.

import time
from flask import jsonify, request
from api.db import get_conn


NEBIM_COUNTRIES = ('KAZAKİSTAN', 'SIRBİSTAN')


def _row_to_delivery_dict(row):
    return {
        'shipment_id': row[0],
        'ihracat_dosya_no': row[1],
        'fatura_no': row[2],
        'ulke': row[3],
        'plaka': row[4],
        'yukleme_tarihi': str(row[5]) if row[5] else None,
        'durum': row[6],
        'fatura_ref_no': row[7] or '',
        'ready_for_nebim': bool(row[8]) if row[8] is not None else False,
        'nebim_status': row[9] or 'pending',
        'nebim_response': row[10] or {},
        'updated_at': row[11],
    }


def nebim_delivery_get():
    country = request.args.get('ulke', '').strip()
    ready_only = request.args.get('ready') in ('1', 'true', 'True')

    conn = get_conn()
    cur = conn.cursor()

    query = '''
        SELECT s.id, s.ihracat_dosya_no, s.fatura_no, s.ulke, s.plaka,
               s.yukleme_tarihi, s.durum,
               n.fatura_ref_no, n.ready_for_nebim, n.nebim_status,
               n.nebim_response, n.updated_at
        FROM shipments s
        LEFT JOIN nebim_delivery_refs n ON n.shipment_id = s.id
        WHERE unaccent(upper(s.ulke)) IN (unaccent(%s), unaccent(%s))
    '''
    params = [NEBIM_COUNTRIES[0], NEBIM_COUNTRIES[1]]

    if country:
        query += ' AND unaccent(lower(s.ulke)) = unaccent(lower(%s))'
        params.append(country)

    if ready_only:
        query += ' AND COALESCE(n.ready_for_nebim, FALSE) = TRUE'
        query += " AND COALESCE(n.fatura_ref_no, '') <> ''"
        query += " AND COALESCE(s.plaka, '') <> ''"

    query += ' ORDER BY s.yukleme_tarihi DESC NULLS LAST, s.id DESC'

    cur.execute(query, params)
    rows = cur.fetchall()
    cur.close()
    conn.close()

    return jsonify({'success': True, 'items': [_row_to_delivery_dict(r) for r in rows]})


def nebim_delivery_put():
    body = request.get_json() or {}
    shipment_id = body.get('shipment_id')
    if not shipment_id:
        return jsonify({'success': False, 'error': 'shipment_id gerekli'}), 400

    fatura_ref_no = str(body.get('fatura_ref_no') or '').strip()
    ready_for_nebim = bool(body.get('ready_for_nebim'))
    now = int(time.time())

    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute('SELECT fatura_no, plaka FROM shipments WHERE id = %s', (int(shipment_id),))
        shipment = cur.fetchone()
        if not shipment:
            return jsonify({'success': False, 'error': 'Sevkiyat bulunamadı'}), 404

        fatura_no, plaka = shipment
        if ready_for_nebim and (not fatura_ref_no or not str(plaka or '').strip()):
            return jsonify({
                'success': False,
                'error': 'Nebim onayı için fatura ref no ve plaka zorunlu',
            }), 400

        cur.execute('''
            INSERT INTO nebim_delivery_refs (
                shipment_id, fatura_no, fatura_ref_no, ready_for_nebim,
                nebim_status, created_at, updated_at
            )
            VALUES (%s, %s, %s, %s, 'pending', %s, %s)
            ON CONFLICT (shipment_id) DO UPDATE SET
                fatura_no       = EXCLUDED.fatura_no,
                fatura_ref_no   = EXCLUDED.fatura_ref_no,
                ready_for_nebim = EXCLUDED.ready_for_nebim,
                nebim_status    = CASE
                    WHEN nebim_delivery_refs.nebim_status = 'sent'
                         AND EXCLUDED.ready_for_nebim = TRUE
                    THEN nebim_delivery_refs.nebim_status
                    ELSE 'pending'
                END,
                updated_at      = EXCLUDED.updated_at
        ''', (int(shipment_id), fatura_no, fatura_ref_no, ready_for_nebim, now, now))
        conn.commit()
    finally:
        cur.close()
        conn.close()

    return jsonify({'success': True})

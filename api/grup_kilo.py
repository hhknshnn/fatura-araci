# api/grup_kilo.py
# Ürün ara grubu -> standart birim kilo (kg). Menşe/GTİP akışlarında ağırlığı
# eksik satırlar için kullanılan tek ortak kaynak; sadece admin düzenleyebilir,
# herkes okuyabilir.

import time

from flask import jsonify, request, g

from api.db import get_conn
from api.audit import log_action


def grup_kilo_get():
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute('SELECT grup_adi, kilo FROM group_weights')
        rows = cur.fetchall()
        return jsonify({'success': True, 'grupKilolari': {r[0]: float(r[1]) for r in rows}})
    finally:
        cur.close()
        conn.close()


def grup_kilo_put():
    """PUT /api/grup-kilo — body: {"grupKilolari": {"Cam": 0.4, ...}}. Sadece admin."""
    body = request.get_json(silent=True) or {}
    grup_kilolari = body.get('grupKilolari')
    if not isinstance(grup_kilolari, dict) or not grup_kilolari:
        return jsonify({'success': False, 'error': 'grupKilolari boş olamaz'}), 400

    temiz = {}
    for grup, kilo in grup_kilolari.items():
        grup = str(grup).strip()
        if not grup:
            continue
        try:
            kilo = float(kilo)
        except (TypeError, ValueError):
            return jsonify({'success': False, 'error': f'Geçersiz kilo değeri: {grup}'}), 400
        if kilo <= 0:
            return jsonify({'success': False, 'error': f'Kilo pozitif olmalı: {grup}'}), 400
        temiz[grup] = kilo

    if not temiz:
        return jsonify({'success': False, 'error': 'grupKilolari boş olamaz'}), 400

    session = getattr(g, 'user', None)
    username = session.get('username', '') if session else ''
    now = int(time.time())

    conn = get_conn()
    cur = conn.cursor()
    try:
        for grup, kilo in temiz.items():
            cur.execute('''
                INSERT INTO group_weights (grup_adi, kilo, updated_by, updated_at)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (grup_adi) DO UPDATE SET
                    kilo       = EXCLUDED.kilo,
                    updated_by = EXCLUDED.updated_by,
                    updated_at = EXCLUDED.updated_at
            ''', (grup, kilo, username, now))
        conn.commit()
        log_action(session, 'grup_kilo', f'Grup kilosu güncellendi: {", ".join(temiz.keys())}')
        return jsonify({'success': True})
    except Exception as e:
        conn.rollback()
        return jsonify({'success': False, 'error': str(e)}), 400
    finally:
        cur.close()
        conn.close()

# api/maliyet/meta.py
# Maliyet Takip: kurumsal ülke listesi (config/countries.json), kalem
# tanımları CRUD ve depo ayarları (açılış bakiyesi, bakiye yöntemi).

import json
import os
import re

from flask import jsonify, request, g

from api.db import get_conn
from api.audit import log_action

GECERLI_TIPLER = ('hareket', 'storage', 'sabit', 'minimum')
GECERLI_BAKIYE_YONTEMLERI = ('donem_sonu', 'donem_basi', 'gun_ortalama', 'maksimum')


def kurumsal_ulkeler():
    """config/countries.json içinden grup=kurumsal ülkeleri döner."""
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    with open(os.path.join(base_dir, 'config', 'countries.json'), encoding='utf-8') as f:
        data = json.load(f)
    return [
        {'kod': kod, 'label': u.get('label', kod), 'currency': u.get('currency', 'EUR')}
        for kod, u in data.items()
        if u.get('grup') == 'kurumsal'
    ]


def gecerli_ulke_kodlari():
    return {u['kod'] for u in kurumsal_ulkeler()}


def kalem_listesi(cur, sadece_aktif=False):
    where = 'WHERE aktif' if sadece_aktif else ''
    cur.execute(f'''
        SELECT id, kod, ad, birim_secenekleri, tip, aktif, sira
        FROM maliyet_kalemleri {where}
        ORDER BY sira, id
    ''')
    return [
        {'id': r[0], 'kod': r[1], 'ad': r[2], 'birim_secenekleri': r[3],
         'tip': r[4], 'aktif': r[5], 'sira': r[6]}
        for r in cur.fetchall()
    ]


def maliyet_meta_get():
    """GET /api/maliyet/meta — ülkeler + kalemler + depo ayarları tek çağrıda."""
    conn = get_conn()
    cur = conn.cursor()
    try:
        kalemler = kalem_listesi(cur)
        cur.execute('SELECT ulke, acilis_tarihi, acilis_bakiye, bakiye_yontemi FROM maliyet_depo_ayarlari')
        depo_ayarlari = {
            r[0]: {
                'acilis_tarihi': r[1].isoformat() if r[1] else None,
                'acilis_bakiye': float(r[2]),
                'bakiye_yontemi': r[3],
            }
            for r in cur.fetchall()
        }
    finally:
        cur.close()
        conn.close()
    return jsonify({
        'success': True,
        'ulkeler': kurumsal_ulkeler(),
        'kalemler': kalemler,
        'depo_ayarlari': depo_ayarlari,
    })


def _slugify(ad):
    s = str(ad or '').strip().lower()
    tr_map = str.maketrans('çğıöşü', 'cgiosu')
    s = s.translate(tr_map)
    s = re.sub(r'[^a-z0-9]+', '_', s).strip('_')
    return s or 'kalem'


def maliyet_kalem_post():
    """POST /api/maliyet/kalem — yeni tarife kalemi tanımlar."""
    body = request.get_json(silent=True) or {}
    ad = str(body.get('ad') or '').strip()
    if not ad:
        return jsonify({'success': False, 'error': 'Kalem adı zorunlu'}), 400

    birimler = body.get('birim_secenekleri') or []
    if not isinstance(birimler, list) or not all(str(b).strip() for b in birimler) or not birimler:
        return jsonify({'success': False, 'error': 'En az bir birim seçeneği girilmeli'}), 400
    birimler = [str(b).strip() for b in birimler]

    tip = str(body.get('tip') or 'hareket').strip()
    if tip not in GECERLI_TIPLER:
        return jsonify({'success': False, 'error': f'Geçersiz tip: {tip}'}), 400

    kod = str(body.get('kod') or '').strip() or _slugify(ad)
    try:
        sira = int(body.get('sira') or 0)
    except (TypeError, ValueError):
        sira = 0

    conn = get_conn()
    cur = conn.cursor()
    try:
        if not sira:
            cur.execute('SELECT COALESCE(MAX(sira), 0) + 10 FROM maliyet_kalemleri')
            sira = cur.fetchone()[0]
        cur.execute('''
            INSERT INTO maliyet_kalemleri (kod, ad, birim_secenekleri, tip, sira)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (kod) DO NOTHING
            RETURNING id
        ''', (kod, ad, birimler, tip, sira))
        row = cur.fetchone()
        if not row:
            return jsonify({'success': False, 'error': f"'{kod}' kodlu kalem zaten var"}), 409
        conn.commit()
        log_action(getattr(g, 'user', None), 'maliyet_kalem', f'Maliyet kalemi ekledi: {ad} ({kod})')
        return jsonify({'success': True, 'id': row[0], 'kod': kod})
    finally:
        cur.close()
        conn.close()


def maliyet_kalem_put(kalem_id):
    """PUT /api/maliyet/kalem/<id> — ad/birimler/sıra/aktiflik günceller."""
    body = request.get_json(silent=True) or {}
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute('SELECT ad, birim_secenekleri, tip, aktif, sira FROM maliyet_kalemleri WHERE id = %s', (kalem_id,))
        row = cur.fetchone()
        if not row:
            return jsonify({'success': False, 'error': 'Kalem bulunamadı'}), 404
        ad, birimler, tip, aktif, sira = row

        if 'ad' in body:
            ad = str(body['ad'] or '').strip() or ad
        if 'birim_secenekleri' in body:
            yeni = body['birim_secenekleri'] or []
            if not isinstance(yeni, list) or not yeni:
                return jsonify({'success': False, 'error': 'En az bir birim seçeneği girilmeli'}), 400
            birimler = [str(b).strip() for b in yeni if str(b).strip()]
        if 'tip' in body:
            tip = str(body['tip'] or '').strip()
            if tip not in GECERLI_TIPLER:
                return jsonify({'success': False, 'error': f'Geçersiz tip: {tip}'}), 400
        if 'aktif' in body:
            aktif = bool(body['aktif'])
        if 'sira' in body:
            try:
                sira = int(body['sira'])
            except (TypeError, ValueError):
                pass

        cur.execute('''
            UPDATE maliyet_kalemleri
            SET ad = %s, birim_secenekleri = %s, tip = %s, aktif = %s, sira = %s
            WHERE id = %s
        ''', (ad, birimler, tip, aktif, sira, kalem_id))
        conn.commit()
        log_action(getattr(g, 'user', None), 'maliyet_kalem', f'Maliyet kalemi güncelledi: {ad}')
        return jsonify({'success': True})
    finally:
        cur.close()
        conn.close()


def maliyet_kalem_delete(kalem_id):
    """DELETE /api/maliyet/kalem/<id> — tarife/hareket referansı yoksa siler,
    varsa pasifler (veri korunur)."""
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute('SELECT ad FROM maliyet_kalemleri WHERE id = %s', (kalem_id,))
        row = cur.fetchone()
        if not row:
            return jsonify({'success': False, 'error': 'Kalem bulunamadı'}), 404
        ad = row[0]

        cur.execute('''
            SELECT (SELECT COUNT(*) FROM maliyet_tarifeleri  WHERE kalem_id = %s)
                 + (SELECT COUNT(*) FROM maliyet_hareketleri WHERE kalem_id = %s)
                 + (SELECT COUNT(*) FROM maliyet_fatura_kalemleri WHERE kalem_id = %s)
        ''', (kalem_id, kalem_id, kalem_id))
        referans = cur.fetchone()[0]

        if referans:
            cur.execute('UPDATE maliyet_kalemleri SET aktif = FALSE WHERE id = %s', (kalem_id,))
            sonuc = 'pasiflendi'
        else:
            cur.execute('DELETE FROM maliyet_kalemleri WHERE id = %s', (kalem_id,))
            sonuc = 'silindi'
        conn.commit()
        log_action(getattr(g, 'user', None), 'maliyet_kalem', f'Maliyet kalemi {sonuc}: {ad}')
        return jsonify({'success': True, 'sonuc': sonuc})
    finally:
        cur.close()
        conn.close()


def maliyet_depo_ayar_put():
    """PUT /api/maliyet/depo-ayar — ülke başına açılış bakiyesi ve bakiye yöntemi."""
    body = request.get_json(silent=True) or {}
    ulke = str(body.get('ulke') or '').strip().lower()
    if ulke not in gecerli_ulke_kodlari():
        return jsonify({'success': False, 'error': f'Geçersiz ülke: {ulke}'}), 400

    yontem = str(body.get('bakiye_yontemi') or 'donem_sonu').strip()
    if yontem not in GECERLI_BAKIYE_YONTEMLERI:
        return jsonify({'success': False, 'error': f'Geçersiz bakiye yöntemi: {yontem}'}), 400

    try:
        bakiye = float(body.get('acilis_bakiye') or 0)
    except (TypeError, ValueError):
        return jsonify({'success': False, 'error': 'Açılış bakiyesi sayı olmalı'}), 400

    acilis_tarihi = str(body.get('acilis_tarihi') or '').strip() or None

    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute('''
            INSERT INTO maliyet_depo_ayarlari (ulke, acilis_tarihi, acilis_bakiye, bakiye_yontemi)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (ulke) DO UPDATE SET
                acilis_tarihi  = EXCLUDED.acilis_tarihi,
                acilis_bakiye  = EXCLUDED.acilis_bakiye,
                bakiye_yontemi = EXCLUDED.bakiye_yontemi
        ''', (ulke, acilis_tarihi, bakiye, yontem))
        conn.commit()
        log_action(getattr(g, 'user', None), 'maliyet_depo_ayar', f'Depo ayarı güncelledi: {ulke}')
        return jsonify({'success': True})
    except Exception as e:
        conn.rollback()
        return jsonify({'success': False, 'error': str(e)}), 400
    finally:
        cur.close()
        conn.close()

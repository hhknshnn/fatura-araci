# ── TASLAK_STORE.PY ───────────────────────────────────────────────────────────
# Taslak dosyalarını DB'ye kaydet, listele, indir, sil.

import psycopg2
import psycopg2.extras
import base64
from datetime import datetime, timedelta
from flask import request, jsonify
from .db import get_conn


# ── 36 SAAT ESKİYENLERİ SİL ──────────────────────────────────────────────────
def temizle_eski_taslaklar(conn):
    with conn.cursor() as cur:
        cur.execute("""
            DELETE FROM taslak_dosyalar
            WHERE olusturma_tarihi < NOW() - INTERVAL '36 hours'
        """)
        conn.commit()


# ── KAYDET ────────────────────────────────────────────────────────────────────
def taslak_store_kaydet():
    try:
        data        = request.get_json(force=True)
        referans_no = data.get('referansNo', '')
        ulke_kodu   = data.get('ulkeKodu', '')
        ulke_adi    = data.get('ulkeAdi', '')
        depo_tipi   = data.get('depoTipi', '')
        excel_b64   = data.get('excel', '')
        kullanici   = data.get('kullanici', '')

        if not referans_no or not excel_b64:
            return jsonify({'success': False, 'error': 'Referans no ve Excel zorunlu'})

        excel_bytes = base64.b64decode(excel_b64)
        conn = get_conn()
        temizle_eski_taslaklar(conn)

        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO taslak_dosyalar
                  (referans_no, ulke_kodu, ulke_adi, depo_tipi, excel_data, kullanici)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (referans_no, ulke_kodu, ulke_adi, depo_tipi,
                  psycopg2.Binary(excel_bytes), kullanici))
            new_id = cur.fetchone()[0]
            conn.commit()

        conn.close()
        return jsonify({'success': True, 'id': new_id})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


# ── LİSTELE ───────────────────────────────────────────────────────────────────
def taslak_store_liste():
    try:
        conn = get_conn()
        temizle_eski_taslaklar(conn)

        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT id, referans_no, ulke_kodu, ulke_adi, depo_tipi,
                       olusturma_tarihi, kullanici
                FROM taslak_dosyalar
                ORDER BY olusturma_tarihi DESC
            """)
            rows = cur.fetchall()

        conn.close()

        taslaklar = []
        for r in rows:
            kalan = r['olusturma_tarihi'] + timedelta(hours=36) - datetime.now()
            kalan_saat = max(0, int(kalan.total_seconds() / 3600))
            taslaklar.append({
                'id':              r['id'],
                'referansNo':      r['referans_no'],
                'ulkeKodu':        r['ulke_kodu'],
                'ulkeAdi':         r['ulke_adi'],
                'depoTipi':        r['depo_tipi'],
                'olusturmaTarihi': r['olusturma_tarihi'].strftime('%d.%m.%Y %H:%M'),
                'kalanSaat':       kalan_saat,
                'kullanici':       r['kullanici'],
            })

        return jsonify({'success': True, 'taslaklar': taslaklar})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


# ── İNDİR ─────────────────────────────────────────────────────────────────────
def taslak_store_indir(taslak_id):
    try:
        conn = get_conn()

        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT id, referans_no, ulke_kodu, ulke_adi, depo_tipi, excel_data
                FROM taslak_dosyalar
                WHERE id = %s
            """, (taslak_id,))
            row = cur.fetchone()

        conn.close()

        if not row:
            return jsonify({'success': False, 'error': 'Taslak bulunamadı'})

        excel_b64 = base64.b64encode(bytes(row['excel_data'])).decode('utf-8')
        return jsonify({
            'success':    True,
            'excel':      excel_b64,
            'referansNo': row['referans_no'],
            'ulkeKodu':   row['ulke_kodu'],
            'ulkeAdi':    row['ulke_adi'],
            'depoTipi':   row['depo_tipi'],
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


# ── SİL ───────────────────────────────────────────────────────────────────────
def taslak_store_sil(taslak_id):
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            cur.execute("DELETE FROM taslak_dosyalar WHERE id = %s", (taslak_id,))
            conn.commit()
        conn.close()
        return jsonify({'success': True})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})
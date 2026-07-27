# ── TASLAK_FORM.PY ────────────────────────────────────────────────────────────
# "Fatura Üret" ekranındaki tamamlanmamış taslak FORM state'ini kaydet/listele/
# getir/sil. Üretilmiş Excel'i saklayan taslak_dosyalar/taslak_store.py ile
# KARIŞTIRILMASIN — bu modül henüz indirilmemiş, eksik olabilen girdileri tutar.
#
# Otomatik silme kuralı (tembel, /liste çağrısında yürür):
#   - korunmayan (korunan=false) taslak, son güncellemesinden 5 gün sonra silinir.
#   - 4. günde (silinmeye ~1 gün kala) listede "silinecek" uyarısı döner.
#   - "Tut" (koru) ile işaretlenen taslaklar bu otomatik silmeden muaftır.
#   - Korunan bir taslak son güncellemesinden 15 günden uzun süredir duruyorsa
#     yine uyarı döner ("15 günü geçti") — otomatik silinmez, yalnız hatırlatma.

import psycopg2
import psycopg2.extras
import json
from datetime import datetime, timezone
from flask import request, jsonify, g
from .db import get_conn


def _kullanici():
    return (g.user or {}).get('username', '')


# ── KAYDET (upsert) ──────────────────────────────────────────────────────────
def taslak_form_kaydet():
    try:
        data        = request.get_json(force=True) or {}
        kayit_id    = data.get('id')
        ulke_kodu   = str(data.get('ulkeKodu', '')).strip()
        ulke_adi    = str(data.get('ulkeAdi', '')).strip()
        depo_tipi   = data.get('depoTipi') or None
        referans_no = str(data.get('referansNo', '')).strip()
        form_data   = data.get('formData') or {}

        if not ulke_kodu:
            return jsonify({'success': False, 'error': 'Ülke kodu zorunlu'})

        # Yalnız listede rozet için bilgi amaçlı — hiçbir akışı gate etmez.
        durum = 'hazir' if referans_no and depo_tipi else 'eksik'

        kullanici = _kullanici()
        conn = get_conn()

        with conn.cursor() as cur:
            if kayit_id:
                cur.execute("""
                    UPDATE taslak_form_kayitlari
                    SET ulke_kodu = %s, ulke_adi = %s, depo_tipi = %s,
                        referans_no = %s, durum = %s, form_data = %s,
                        guncelleme_tarihi = now()
                    WHERE id = %s AND kullanici = %s
                    RETURNING id
                """, (ulke_kodu, ulke_adi, depo_tipi, referans_no, durum,
                      json.dumps(form_data), kayit_id, kullanici))
                row = cur.fetchone()
                if not row:
                    conn.close()
                    return jsonify({'success': False, 'error': 'Taslak bulunamadı'}), 404
                new_id = row[0]
            else:
                cur.execute("""
                    INSERT INTO taslak_form_kayitlari
                      (kullanici, ulke_kodu, ulke_adi, depo_tipi, referans_no, durum, form_data)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                """, (kullanici, ulke_kodu, ulke_adi, depo_tipi, referans_no, durum,
                      json.dumps(form_data)))
                new_id = cur.fetchone()[0]
            conn.commit()

        conn.close()
        return jsonify({'success': True, 'id': new_id})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


# ── LİSTELE (+ tembel otomatik silme + hatırlatma hesabı) ────────────────────
def taslak_form_liste():
    try:
        kullanici = _kullanici()
        conn = get_conn()

        # Süresi dolmuş + korunmayan kayıtları sil (yalnız bu kullanıcının kendi taslakları).
        with conn.cursor() as cur:
            cur.execute("""
                DELETE FROM taslak_form_kayitlari
                WHERE kullanici = %s AND korunan = FALSE
                  AND guncelleme_tarihi < now() - INTERVAL '5 days'
            """, (kullanici,))
            conn.commit()

        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT id, ulke_kodu, ulke_adi, depo_tipi, referans_no,
                       korunan, guncelleme_tarihi
                FROM taslak_form_kayitlari
                WHERE kullanici = %s
                ORDER BY guncelleme_tarihi DESC
            """, (kullanici,))
            rows = cur.fetchall()

        conn.close()

        now = datetime.now(timezone.utc)
        taslaklar = []
        for r in rows:
            gun_farki = (now - r['guncelleme_tarihi']).days
            uyari      = None
            kalan_gun  = None

            if not r['korunan']:
                if gun_farki >= 4:
                    uyari     = 'silinecek'
                    kalan_gun = max(0, 5 - gun_farki)
            else:
                if gun_farki > 15:
                    uyari = 'onbes_gecti'

            taslaklar.append({
                'id':              r['id'],
                'ulkeKodu':        r['ulke_kodu'],
                'ulkeAdi':         r['ulke_adi'],
                'depoTipi':        r['depo_tipi'],
                'referansNo':      r['referans_no'],
                'korunan':         r['korunan'],
                'guncellemeTarihi': r['guncelleme_tarihi'].strftime('%d.%m.%Y %H:%M'),
                'uyari':           uyari,
                'kalanGun':        kalan_gun,
            })

        return jsonify({'success': True, 'taslaklar': taslaklar})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


# ── TEKİL GETİR (devam et — formu doldurmak için) ────────────────────────────
def taslak_form_getir(kayit_id):
    try:
        kullanici = _kullanici()
        conn = get_conn()

        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT id, ulke_kodu, ulke_adi, depo_tipi, referans_no, form_data
                FROM taslak_form_kayitlari
                WHERE id = %s AND kullanici = %s
            """, (kayit_id, kullanici))
            row = cur.fetchone()

        conn.close()

        if not row:
            return jsonify({'success': False, 'error': 'Taslak bulunamadı'}), 404

        return jsonify({
            'success':    True,
            'id':         row['id'],
            'ulkeKodu':   row['ulke_kodu'],
            'ulkeAdi':    row['ulke_adi'],
            'depoTipi':   row['depo_tipi'],
            'referansNo': row['referans_no'],
            'formData':   row['form_data'] or {},
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


# ── SİL ───────────────────────────────────────────────────────────────────────
def taslak_form_sil(kayit_id):
    try:
        kullanici = _kullanici()
        conn = get_conn()
        with conn.cursor() as cur:
            cur.execute("""
                DELETE FROM taslak_form_kayitlari WHERE id = %s AND kullanici = %s
            """, (kayit_id, kullanici))
            silindi = cur.rowcount > 0
            conn.commit()
        conn.close()
        if not silindi:
            return jsonify({'success': False, 'error': 'Taslak bulunamadı'}), 404
        return jsonify({'success': True})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


# ── KORU ("Tut") ──────────────────────────────────────────────────────────────
def taslak_form_koru(kayit_id):
    try:
        kullanici = _kullanici()
        conn = get_conn()
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE taslak_form_kayitlari SET korunan = TRUE
                WHERE id = %s AND kullanici = %s
            """, (kayit_id, kullanici))
            guncellendi = cur.rowcount > 0
            conn.commit()
        conn.close()
        if not guncellendi:
            return jsonify({'success': False, 'error': 'Taslak bulunamadı'}), 404
        return jsonify({'success': True})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

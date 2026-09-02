# api/maliyet/tarife.py
# Versiyonlu tarife yönetimi. Fiyat değişiminde eski satır silinmez; yeni
# gecerli_baslangic ile yeni satır açılır. Hesap motoru (hesap.py) hareket
# tarihine denk gelen versiyonu tarife_haritasi() ile çözer.

import datetime

from flask import jsonify, request, g

from api.db import get_conn
from api.audit import log_action
from api.maliyet.meta import gecerli_ulke_kodlari

GECERLI_PARA_BIRIMLERI = ('EUR', 'USD', 'TRY')


def _parse_date(value):
    try:
        return datetime.date.fromisoformat(str(value or '').strip())
    except ValueError:
        return None


def tarife_haritasi(cur, ulke):
    """Ülkenin tüm tarife versiyonlarını kalem bazında, tarih azalan sırada döner:
    {kalem_id: [{'birim', 'birim_fiyat', 'para_birimi', 'gecerli_baslangic'}, ...]}
    Belirli bir tarih için geçerli fiyat = listede gecerli_baslangic <= tarih
    olan ilk satır."""
    cur.execute('''
        SELECT kalem_id, birim, birim_fiyat, para_birimi, gecerli_baslangic
        FROM maliyet_tarifeleri
        WHERE ulke = %s
        ORDER BY kalem_id, gecerli_baslangic DESC
    ''', (ulke,))
    harita = {}
    for kalem_id, birim, fiyat, para, baslangic in cur.fetchall():
        harita.setdefault(kalem_id, []).append({
            'birim': birim,
            'birim_fiyat': float(fiyat),
            'para_birimi': para,
            'gecerli_baslangic': baslangic,
        })
    return harita


def fiyat_bul(versiyonlar, tarih):
    """tarife_haritasi() çıktısındaki versiyon listesinden `tarih` için geçerli
    satırı döner; tarife o tarihte başlamamışsa None."""
    for v in versiyonlar or []:
        if v['gecerli_baslangic'] <= tarih:
            return v
    return None


def maliyet_tarife_get():
    """GET /api/maliyet/tarife?ulke=de — ülkenin tüm tarife satırları
    (güncel versiyon işaretli) kalem bilgisiyle birlikte.

    ``?all=1`` ülke karşılaştırma tablosu için tüm ülkeleri tek çağrıda
    döndürür. Mevcut ülke bazlı çağrı geriye dönük uyumlu kalır.
    """
    ulke = str(request.args.get('ulke') or '').strip().lower()
    tumu = str(request.args.get('all') or '').strip().lower() in ('1', 'true', 'yes')
    if not tumu and ulke not in gecerli_ulke_kodlari():
        return jsonify({'success': False, 'error': f'Geçersiz ülke: {ulke}'}), 400

    bugun = datetime.date.today()
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute(f'''
            SELECT t.id, t.kalem_id, k.kod, k.ad, t.birim, t.birim_fiyat,
                   t.para_birimi, t.gecerli_baslangic, t.notlar
                   {', t.ulke' if tumu else ''}
            FROM maliyet_tarifeleri t
            JOIN maliyet_kalemleri k ON k.id = t.kalem_id
            {'WHERE t.ulke = %s' if not tumu else ''}
            ORDER BY {('t.ulke, ' if tumu else '')}k.sira, k.id, t.gecerli_baslangic DESC
        ''', (ulke,) if not tumu else ())
        rows = cur.fetchall()
    finally:
        cur.close()
        conn.close()

    # Ülke + kalem başına, bugüne göre geçerli olan en yeni versiyonu işaretle
    guncel_ids = {}
    for r in rows:
        tid, kalem_id, baslangic = r[0], r[1], r[7]
        satir_ulke = r[9] if tumu else ulke
        anahtar = (satir_ulke, kalem_id)
        if anahtar not in guncel_ids and baslangic <= bugun:
            guncel_ids[anahtar] = tid

    tarifeler = [
        {
            'id': r[0], 'kalem_id': r[1], 'kalem_kod': r[2], 'kalem_ad': r[3],
            'birim': r[4], 'birim_fiyat': float(r[5]), 'para_birimi': r[6],
            'gecerli_baslangic': r[7].isoformat(), 'notlar': r[8],
            'ulke': r[9] if tumu else ulke,
            'guncel': guncel_ids.get(((r[9] if tumu else ulke), r[1])) == r[0],
        }
        for r in rows
    ]
    return jsonify({'success': True, 'ulke': None if tumu else ulke, 'tarifeler': tarifeler})


def maliyet_tarife_post():
    """POST /api/maliyet/tarife — yeni tarife versiyonu açar. Aynı ülke+kalem+
    geçerlilik tarihine ikinci kez yazılırsa fiyat güncellenir (düzeltme)."""
    body = request.get_json(silent=True) or {}

    ulke = str(body.get('ulke') or '').strip().lower()
    if ulke not in gecerli_ulke_kodlari():
        return jsonify({'success': False, 'error': f'Geçersiz ülke: {ulke}'}), 400

    try:
        kalem_id = int(body.get('kalem_id'))
    except (TypeError, ValueError):
        return jsonify({'success': False, 'error': 'kalem_id zorunlu'}), 400

    para = str(body.get('para_birimi') or '').strip().upper()
    if para not in GECERLI_PARA_BIRIMLERI:
        return jsonify({'success': False, 'error': f'Geçersiz para birimi: {para}'}), 400

    try:
        fiyat = float(body.get('birim_fiyat'))
    except (TypeError, ValueError):
        return jsonify({'success': False, 'error': 'Birim fiyat sayı olmalı'}), 400
    if fiyat < 0:
        return jsonify({'success': False, 'error': 'Birim fiyat negatif olamaz'}), 400

    baslangic = _parse_date(body.get('gecerli_baslangic'))
    if not baslangic:
        return jsonify({'success': False, 'error': 'Geçerlilik başlangıç tarihi zorunlu (YYYY-AA-GG)'}), 400

    birim = str(body.get('birim') or '').strip()
    notlar = str(body.get('notlar') or '').strip() or None

    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute('SELECT ad, birim_secenekleri FROM maliyet_kalemleri WHERE id = %s AND aktif', (kalem_id,))
        row = cur.fetchone()
        if not row:
            return jsonify({'success': False, 'error': 'Kalem bulunamadı veya pasif'}), 404
        kalem_ad, birim_secenekleri = row

        if not birim:
            birim = birim_secenekleri[0]
        elif birim not in birim_secenekleri:
            return jsonify({
                'success': False,
                'error': f"Geçersiz birim '{birim}' — seçenekler: {', '.join(birim_secenekleri)}",
            }), 400

        cur.execute('''
            INSERT INTO maliyet_tarifeleri
                (ulke, kalem_id, birim, birim_fiyat, para_birimi, gecerli_baslangic, notlar)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (ulke, kalem_id, gecerli_baslangic) DO UPDATE SET
                birim = EXCLUDED.birim,
                birim_fiyat = EXCLUDED.birim_fiyat,
                para_birimi = EXCLUDED.para_birimi,
                notlar = EXCLUDED.notlar
            RETURNING id
        ''', (ulke, kalem_id, birim, fiyat, para, baslangic, notlar))
        tarife_id = cur.fetchone()[0]
        conn.commit()
        log_action(getattr(g, 'user', None), 'maliyet_tarife',
                   f'Tarife girdi: {ulke} / {kalem_ad} = {fiyat} {para} ({baslangic})')
        return jsonify({'success': True, 'id': tarife_id})
    finally:
        cur.close()
        conn.close()


def maliyet_tarife_delete(tarife_id):
    """DELETE /api/maliyet/tarife/<id> — hatalı girilen versiyonu siler.
    Normal fiyat değişiminde silme değil yeni versiyon kullanılır."""
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute('''
            DELETE FROM maliyet_tarifeleri t
            USING maliyet_kalemleri k
            WHERE t.id = %s AND k.id = t.kalem_id
            RETURNING t.ulke, k.ad, t.birim_fiyat, t.para_birimi
        ''', (tarife_id,))
        row = cur.fetchone()
        if not row:
            return jsonify({'success': False, 'error': 'Tarife satırı bulunamadı'}), 404
        conn.commit()
        log_action(getattr(g, 'user', None), 'maliyet_tarife',
                   f'Tarife versiyonu sildi: {row[0]} / {row[1]} = {float(row[2])} {row[3]}')
        return jsonify({'success': True})
    finally:
        cur.close()
        conn.close()

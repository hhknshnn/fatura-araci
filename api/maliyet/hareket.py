# api/maliyet/hareket.py
# Palet/kutu hareketleri: günlük toplu giriş (upsert), Excel/yapıştırma import,
# listeleme, silme ve palet stok bakiyesi. Bakiye = açılış bakiyesi +
# kümülatif (Pallet In − Pallet Out); storage hesabı (hesap.py) bunu kullanır.

import datetime

from flask import jsonify, request, g

from api.db import get_conn
from api.audit import log_action
from api.maliyet.meta import gecerli_ulke_kodlari

# Bakiye hesabında kullanılan sabit kalem kodları (migration seed'i ile aynı)
PALLET_IN_KOD = 'pallet_in'
PALLET_OUT_KOD = 'pallet_out'
BOX_IN_KOD = 'box_in'
BOX_OUT_KOD = 'box_out'


def _parse_date(value):
    s = str(value or '').strip()
    for fmt in ('%Y-%m-%d', '%d.%m.%Y', '%d/%m/%Y'):
        try:
            return datetime.datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def depo_ayar(cur, ulke):
    cur.execute('''
        SELECT acilis_tarihi, acilis_bakiye, bakiye_yontemi
        FROM maliyet_depo_ayarlari WHERE ulke = %s
    ''', (ulke,))
    row = cur.fetchone()
    if not row:
        return {'acilis_tarihi': None, 'acilis_bakiye': 0.0, 'bakiye_yontemi': 'donem_sonu'}
    return {'acilis_tarihi': row[0], 'acilis_bakiye': float(row[1]), 'bakiye_yontemi': row[2]}


def palet_bakiye(cur, ulke, tarih=None):
    """Verilen tarihe kadar (dahil) palet bakiyesi. tarih=None → bugüne kadar.
    Açılış tarihi girildiyse ondan önceki hareketler bakiyeye sayılmaz."""
    ayar = depo_ayar(cur, ulke)
    if tarih is None:
        tarih = datetime.date.today()

    acilis_filtre = 'AND h.tarih >= %s' if ayar['acilis_tarihi'] else ''
    cur.execute(f'''
        SELECT COALESCE(SUM(CASE WHEN k.kod = %s THEN h.miktar
                                 WHEN k.kod = %s THEN -h.miktar END), 0)
        FROM maliyet_hareketleri h
        JOIN maliyet_kalemleri k ON k.id = h.kalem_id
        WHERE h.ulke = %s AND k.kod IN (%s, %s) AND h.tarih <= %s {acilis_filtre}
    ''', ([PALLET_IN_KOD, PALLET_OUT_KOD, ulke, PALLET_IN_KOD, PALLET_OUT_KOD, tarih]
          + ([ayar['acilis_tarihi']] if ayar['acilis_tarihi'] else [])))
    net = float(cur.fetchone()[0])
    return ayar['acilis_bakiye'] + net


def box_bakiye(cur, ulke, tarih=None):
    """Verilen tarihe kadar Box In − Box Out bakiyesi. Box için ayrı açılış
    bakiyesi tanımı bulunmadığından hareket kayıtları sıfırdan kümüle edilir."""
    if tarih is None:
        tarih = datetime.date.today()
    cur.execute('''
        SELECT COALESCE(SUM(CASE WHEN k.kod = %s THEN h.miktar
                                 WHEN k.kod = %s THEN -h.miktar END), 0)
        FROM maliyet_hareketleri h
        JOIN maliyet_kalemleri k ON k.id = h.kalem_id
        WHERE h.ulke = %s AND k.kod IN (%s, %s) AND h.tarih <= %s
    ''', (BOX_IN_KOD, BOX_OUT_KOD, ulke, BOX_IN_KOD, BOX_OUT_KOD, tarih))
    return float(cur.fetchone()[0])


def maliyet_hareket_get():
    """GET /api/maliyet/hareket?ulke=de&start&end — hareket listesi + bakiye özeti."""
    ulke = str(request.args.get('ulke') or '').strip().lower()
    if ulke not in gecerli_ulke_kodlari():
        return jsonify({'success': False, 'error': f'Geçersiz ülke: {ulke}'}), 400

    start = _parse_date(request.args.get('start'))
    end = _parse_date(request.args.get('end'))

    where = ['h.ulke = %s']
    params = [ulke]
    if start:
        where.append('h.tarih >= %s')
        params.append(start)
    if end:
        where.append('h.tarih <= %s')
        params.append(end)

    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute(f'''
            SELECT h.id, h.tarih, h.kalem_id, k.kod, k.ad, h.miktar, h.notlar
            FROM maliyet_hareketleri h
            JOIN maliyet_kalemleri k ON k.id = h.kalem_id
            WHERE {' AND '.join(where)}
            ORDER BY h.tarih DESC, k.sira, k.id
            LIMIT 1000
        ''', params)
        hareketler = [
            {'id': r[0], 'tarih': r[1].isoformat(), 'kalem_id': r[2], 'kalem_kod': r[3],
             'kalem_ad': r[4], 'miktar': float(r[5]), 'notlar': r[6]}
            for r in cur.fetchall()
        ]
        ayar = depo_ayar(cur, ulke)
        bakiye = palet_bakiye(cur, ulke)
    finally:
        cur.close()
        conn.close()

    return jsonify({
        'success': True,
        'ulke': ulke,
        'hareketler': hareketler,
        'bakiye': {
            'guncel': bakiye,
            'acilis_tarihi': ayar['acilis_tarihi'].isoformat() if ayar['acilis_tarihi'] else None,
            'acilis_bakiye': ayar['acilis_bakiye'],
            'bakiye_yontemi': ayar['bakiye_yontemi'],
        },
    })


def _upsert_hareket(cur, tarih, ulke, kalem_id, miktar):
    """miktar > 0 → upsert; miktar == 0 → o günün kaydını sil (düzeltme)."""
    if miktar == 0:
        cur.execute('''
            DELETE FROM maliyet_hareketleri
            WHERE tarih = %s AND ulke = %s AND kalem_id = %s
        ''', (tarih, ulke, kalem_id))
        return
    cur.execute('''
        INSERT INTO maliyet_hareketleri (tarih, ulke, kalem_id, miktar)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (tarih, ulke, kalem_id) DO UPDATE SET miktar = EXCLUDED.miktar
    ''', (tarih, ulke, kalem_id, miktar))


def maliyet_hareket_bulk_post():
    """POST /api/maliyet/hareket/bulk — tek tarih + ülke için tüm kalem
    miktarlarını upsert eder. Gövde: {tarih, ulke, hareketler: {kalem_id: miktar}}.
    Boş/None miktarlar atlanır; 0 o günün kaydını siler."""
    body = request.get_json(silent=True) or {}

    ulke = str(body.get('ulke') or '').strip().lower()
    if ulke not in gecerli_ulke_kodlari():
        return jsonify({'success': False, 'error': f'Geçersiz ülke: {ulke}'}), 400

    tarih = _parse_date(body.get('tarih'))
    if not tarih:
        return jsonify({'success': False, 'error': 'Geçerli bir tarih girin (YYYY-AA-GG)'}), 400

    hareketler = body.get('hareketler') or {}
    if not isinstance(hareketler, dict) or not hareketler:
        return jsonify({'success': False, 'error': 'En az bir kalem miktarı girilmeli'}), 400

    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id FROM maliyet_kalemleri WHERE aktif AND tip = 'hareket'")
        gecerli_ids = {r[0] for r in cur.fetchall()}

        yazilan = 0
        for kalem_id_raw, miktar_raw in hareketler.items():
            if miktar_raw is None or str(miktar_raw).strip() == '':
                continue
            try:
                kalem_id = int(kalem_id_raw)
                miktar = float(miktar_raw)
            except (TypeError, ValueError):
                return jsonify({'success': False, 'error': f'Geçersiz miktar: {kalem_id_raw}={miktar_raw}'}), 400
            if kalem_id not in gecerli_ids:
                return jsonify({'success': False, 'error': f'Geçersiz veya hareket-dışı kalem: {kalem_id}'}), 400
            if miktar < 0:
                return jsonify({'success': False, 'error': 'Miktar negatif olamaz'}), 400
            _upsert_hareket(cur, tarih, ulke, kalem_id, miktar)
            yazilan += 1

        if not yazilan:
            return jsonify({'success': False, 'error': 'Kaydedilecek miktar girilmedi'}), 400
        conn.commit()
        log_action(getattr(g, 'user', None), 'maliyet_hareket',
                   f'Hareket girdi: {ulke} / {tarih} ({yazilan} kalem)')
        return jsonify({'success': True, 'yazilan': yazilan})
    finally:
        cur.close()
        conn.close()


def maliyet_hareket_import_post():
    """POST /api/maliyet/hareket/import — Excel'den yapıştırılan satırları alır.
    Gövde: {ulke, rows: [{tarih, kalem, miktar}]}; kalem kod veya ad olabilir.
    Aynı tarih+kalem varsa üzerine yazar."""
    body = request.get_json(silent=True) or {}

    ulke = str(body.get('ulke') or '').strip().lower()
    if ulke not in gecerli_ulke_kodlari():
        return jsonify({'success': False, 'error': f'Geçersiz ülke: {ulke}'}), 400

    rows = body.get('rows') or []
    if not isinstance(rows, list) or not rows:
        return jsonify({'success': False, 'error': 'Aktarılacak satır yok'}), 400
    if len(rows) > 5000:
        return jsonify({'success': False, 'error': 'Tek seferde en fazla 5000 satır aktarılabilir'}), 400

    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id, kod, ad FROM maliyet_kalemleri WHERE aktif AND tip = 'hareket'")
        kalem_map = {}
        for kid, kod, ad in cur.fetchall():
            kalem_map[kod.lower()] = kid
            kalem_map[ad.strip().lower()] = kid

        yazilan = 0
        hatalar = []
        for i, row in enumerate(rows, 1):
            tarih = _parse_date(row.get('tarih'))
            kalem_adi = str(row.get('kalem') or '').strip().lower()
            kalem_id = kalem_map.get(kalem_adi)
            try:
                miktar = float(str(row.get('miktar')).replace(',', '.'))
            except (TypeError, ValueError):
                miktar = None

            if not tarih:
                hatalar.append(f"satır {i}: geçersiz tarih '{row.get('tarih')}'")
            elif not kalem_id:
                hatalar.append(f"satır {i}: kalem bulunamadı '{row.get('kalem')}'")
            elif miktar is None or miktar < 0:
                hatalar.append(f"satır {i}: geçersiz miktar '{row.get('miktar')}'")
            else:
                _upsert_hareket(cur, tarih, ulke, kalem_id, miktar)
                yazilan += 1

        if hatalar and not yazilan:
            conn.rollback()
            return jsonify({'success': False, 'error': 'Hiçbir satır aktarılamadı', 'hatalar': hatalar[:20]}), 400

        conn.commit()
        log_action(getattr(g, 'user', None), 'maliyet_hareket',
                   f'Hareket import: {ulke} ({yazilan} satır, {len(hatalar)} hatalı)')
        return jsonify({'success': True, 'yazilan': yazilan, 'hatalar': hatalar[:20]})
    finally:
        cur.close()
        conn.close()


def maliyet_hareket_delete(hareket_id):
    """DELETE /api/maliyet/hareket/<id>"""
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute('''
            DELETE FROM maliyet_hareketleri h
            USING maliyet_kalemleri k
            WHERE h.id = %s AND k.id = h.kalem_id
            RETURNING h.ulke, h.tarih, k.ad, h.miktar
        ''', (hareket_id,))
        row = cur.fetchone()
        if not row:
            return jsonify({'success': False, 'error': 'Hareket kaydı bulunamadı'}), 404
        conn.commit()
        log_action(getattr(g, 'user', None), 'maliyet_hareket',
                   f'Hareket sildi: {row[0]} / {row[1]} / {row[2]} = {float(row[3])}')
        return jsonify({'success': True})
    finally:
        cur.close()
        conn.close()

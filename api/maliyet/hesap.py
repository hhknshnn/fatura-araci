# api/maliyet/hesap.py
# Beklenen fatura hesap motoru: hareket kalemleri (miktar × tarihe uygun tarife),
# storage (bakiye yöntemi × periyot), aylık sabit ücretler ve Minimum Monthly Fee
# düzeltmesi. Karşılaştırma endpoint'i tüm ülkeler için beklenen vs gerçek döner.
#
# Kur: mevcut altyapı (api/kur.get_tcmb_kurlar, exchangerate-api EUR bazlı) ile
# güncel kur kullanılır. Ay kapanış kuru snapshot'ı 2. faz (kur_snapshot tablosu).

import calendar
import datetime

from flask import jsonify, request

from api.db import get_conn
from api.kur import get_tcmb_kurlar
from api.maliyet.meta import kurumsal_ulkeler, gecerli_ulke_kodlari
from api.maliyet.tarife import tarife_haritasi, fiyat_bul
from api.maliyet.hareket import (depo_ayar, palet_bakiye, box_bakiye,
    PALLET_IN_KOD, PALLET_OUT_KOD, BOX_IN_KOD, BOX_OUT_KOD)


def _parse_date(value):
    try:
        return datetime.date.fromisoformat(str(value or '').strip())
    except ValueError:
        return None


def to_eur(tutar, para, kurlar):
    """EUR bazlı kurlarla EUR karşılığı; kur yoksa None."""
    if para == 'EUR':
        return float(tutar)
    kur = (kurlar or {}).get(para) or 0
    if kur <= 0:
        return None
    return float(tutar) / kur


def maliyet_depolama_get():
    """GET /api/maliyet/depolama?tarih=YYYY-AA-GG — ülke bazında güncel palet
    veya box bakiyesi × geçerli Storage tarifesiyle dönem beklentisini döner.
    Aylık görünüm karşılaştırılabilir bir 30 günlük dönem olarak hesaplanır."""
    tarih = _parse_date(request.args.get('tarih')) if request.args.get('tarih') else datetime.date.today()
    if not tarih:
        return jsonify({'success': False, 'error': 'Geçerli tarih girin (YYYY-AA-GG)'}), 400

    kurlar = get_tcmb_kurlar()
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id, ad FROM maliyet_kalemleri WHERE aktif AND tip = 'storage' ORDER BY sira, id")
        storage_kalemler = cur.fetchall()
        rows = []
        for ulke in kurumsal_ulkeler():
            palet_bakiye_ham = palet_bakiye(cur, ulke['kod'], tarih)
            box_bakiye_ham = box_bakiye(cur, ulke['kod'], tarih)
            palet_stok = max(float(palet_bakiye_ham), 0.0)
            box_stok = max(float(box_bakiye_ham), 0.0)
            harita = tarife_haritasi(cur, ulke['kod'])
            tarifeler = []
            toplamlar = {'gunluk': 0.0, 'haftalik': 0.0, 'aylik': 0.0}
            eur_eksik = False

            for kalem_id, kalem_ad in storage_kalemler:
                tarife = fiyat_bul(harita.get(kalem_id), tarih)
                if not tarife or tarife['birim'] not in ('palet_gun', 'palet_hafta', 'palet_ay', 'box_gun'):
                    continue
                fiyat = float(tarife['birim_fiyat'])
                stok_birimi = 'box' if tarife['birim'] == 'box_gun' else 'palet'
                bakiye = box_stok if stok_birimi == 'box' else palet_stok
                if tarife['birim'] == 'palet_hafta':
                    birim_gunluk = fiyat / 7
                    birim_haftalik = fiyat
                    birim_aylik = birim_gunluk * 30
                elif tarife['birim'] == 'palet_ay':
                    birim_aylik = fiyat
                    birim_gunluk = fiyat / 30
                    birim_haftalik = birim_gunluk * 7
                else:  # palet_gun veya box_gun
                    birim_gunluk = fiyat
                    birim_haftalik = fiyat * 7
                    birim_aylik = fiyat * 30

                maliyet = {
                    'gunluk': bakiye * birim_gunluk,
                    'haftalik': bakiye * birim_haftalik,
                    'aylik': bakiye * birim_aylik,
                }
                maliyet_eur = {}
                for key, value in maliyet.items():
                    eur = 0.0 if value == 0 else to_eur(value, tarife['para_birimi'], kurlar)
                    maliyet_eur[key] = eur
                    if eur is None:
                        eur_eksik = True
                    else:
                        toplamlar[key] += eur

                tarifeler.append({
                    'kalem_ad': kalem_ad,
                    'birim': tarife['birim'],
                    'birim_fiyat': round(fiyat, 4),
                    'para_birimi': tarife['para_birimi'],
                    'bekleyen_miktar': round(bakiye, 2),
                    'stok_birimi': stok_birimi,
                    'gecerli_baslangic': tarife['gecerli_baslangic'].isoformat(),
                    'maliyet': {k: round(v, 2) for k, v in maliyet.items()},
                    'maliyet_eur': {k: (round(v, 2) if v is not None else None) for k, v in maliyet_eur.items()},
                })

            rows.append({
                'ulke': ulke['kod'],
                'label': ulke['label'],
                'palet_bakiye': round(palet_stok, 2),
                'palet_bakiye_ham': round(float(palet_bakiye_ham), 2),
                'box_bakiye': round(box_stok, 2),
                'box_bakiye_ham': round(float(box_bakiye_ham), 2),
                'tarifeler': tarifeler,
                'tarifeli': bool(tarifeler),
                'gunluk_eur': None if (not tarifeler or eur_eksik) else round(toplamlar['gunluk'], 2),
                'haftalik_eur': None if (not tarifeler or eur_eksik) else round(toplamlar['haftalik'], 2),
                'aylik_eur': None if (not tarifeler or eur_eksik) else round(toplamlar['aylik'], 2),
            })
    finally:
        cur.close()
        conn.close()

    tarifeli_rows = [r for r in rows if r['tarifeli']]
    return jsonify({
        'success': True,
        'tarih': tarih.isoformat(),
        'ay_gun': 30,
        'rows': rows,
        'ozet': {
            'palet_toplam': round(sum(r['palet_bakiye'] for r in rows), 2),
            'box_toplam': round(sum(r['box_bakiye'] for r in rows), 2),
            'tarifeli_ulke': len(tarifeli_rows),
            'gunluk_eur': round(sum((r['gunluk_eur'] or 0) for r in tarifeli_rows), 2),
            'haftalik_eur': round(sum((r['haftalik_eur'] or 0) for r in tarifeli_rows), 2),
            'aylik_eur': round(sum((r['aylik_eur'] or 0) for r in tarifeli_rows), 2),
            'kur_eksik': any(r['tarifeli'] and r['gunluk_eur'] is None for r in rows),
        },
    })


def bakiye_serisi(cur, ulke, start, end):
    """start..end (dahil) her gün için gün sonu palet bakiyesi: {date: bakiye}."""
    onceki = palet_bakiye(cur, ulke, start - datetime.timedelta(days=1))
    ayar = depo_ayar(cur, ulke)

    acilis_filtre = 'AND h.tarih >= %s' if ayar['acilis_tarihi'] else ''
    params = [PALLET_IN_KOD, ulke, PALLET_IN_KOD, PALLET_OUT_KOD, start, end]
    if ayar['acilis_tarihi']:
        params.append(ayar['acilis_tarihi'])

    cur.execute(f'''
        SELECT h.tarih, SUM(CASE WHEN k.kod = %s THEN h.miktar ELSE -h.miktar END)
        FROM maliyet_hareketleri h
        JOIN maliyet_kalemleri k ON k.id = h.kalem_id
        WHERE h.ulke = %s AND k.kod IN (%s, %s)
          AND h.tarih BETWEEN %s AND %s {acilis_filtre}
        GROUP BY h.tarih
    ''', params)
    gunluk_net = {r[0]: float(r[1]) for r in cur.fetchall()}

    seri = {}
    bakiye = onceki
    gun = start
    while gun <= end:
        bakiye += gunluk_net.get(gun, 0.0)
        seri[gun] = bakiye
        gun += datetime.timedelta(days=1)
    return seri


def box_bakiye_serisi(cur, ulke, start, end):
    """start..end (dahil) her gün için gün sonu box bakiyesi."""
    onceki = box_bakiye(cur, ulke, start - datetime.timedelta(days=1))
    cur.execute('''
        SELECT h.tarih, SUM(CASE WHEN k.kod = %s THEN h.miktar ELSE -h.miktar END)
        FROM maliyet_hareketleri h
        JOIN maliyet_kalemleri k ON k.id = h.kalem_id
        WHERE h.ulke = %s AND k.kod IN (%s, %s) AND h.tarih BETWEEN %s AND %s
        GROUP BY h.tarih
    ''', (BOX_IN_KOD, ulke, BOX_IN_KOD, BOX_OUT_KOD, start, end))
    gunluk_net = {r[0]: float(r[1]) for r in cur.fetchall()}
    seri = {}
    bakiye = onceki
    gun = start
    while gun <= end:
        bakiye += gunluk_net.get(gun, 0.0)
        seri[gun] = bakiye
        gun += datetime.timedelta(days=1)
    return seri


def _gun_dilimleri(start, end):
    """Aralıktaki her günü tek günlük storage dilimi olarak döner."""
    out = []
    gun = start
    while gun <= end:
        out.append((gun, gun))
        gun += datetime.timedelta(days=1)
    return out


def _hafta_dilimleri(start, end):
    """Aralıkla kesişen takvim haftaları (Pzt–Paz), takvim sınırlarıyla."""
    p = start - datetime.timedelta(days=start.weekday())
    out = []
    while p <= end:
        out.append((p, p + datetime.timedelta(days=6)))
        p += datetime.timedelta(days=7)
    return out


def _ay_dilimleri(start, end):
    """Aralıkla kesişen takvim ayları."""
    y, m = start.year, start.month
    out = []
    while (y, m) <= (end.year, end.month):
        out.append((datetime.date(y, m, 1), datetime.date(y, m, calendar.monthrange(y, m)[1])))
        m += 1
        if m == 13:
            y, m = y + 1, 1
    return out


def _storage_bakiye_degeri(seri, yontem, k_start, k_end):
    """Bakiye yöntemine göre dilimin storage hesabına giren palet sayısı."""
    gunler = []
    gun = k_start
    while gun <= k_end:
        gunler.append(seri.get(gun, 0.0))
        gun += datetime.timedelta(days=1)
    if not gunler:
        return 0.0
    if yontem == 'donem_basi':
        return gunler[0]
    if yontem == 'gun_ortalama':
        return sum(gunler) / len(gunler)
    if yontem == 'maksimum':
        return max(gunler)
    return gunler[-1]  # donem_sonu (varsayılan)


def beklenen_hesapla(cur, ulke, start, end, kurlar):
    """Tek ülke için beklenen tutar satırları.

    Dönüş: {'satirlar': [{tarih, kalem_id, kalem_ad, tip, birim, miktar,
    birim_fiyat, para_birimi, tutar, tutar_eur}], 'uyarilar': [...]}
    Satır tarihleri: hareket=hareket günü, storage=dilim kesişim sonu,
    sabit=ay başı, minimum düzeltmesi=ay sonu."""
    harita = tarife_haritasi(cur, ulke)
    ayar = depo_ayar(cur, ulke)
    satirlar = []
    uyarilar = []
    tarifesiz = set()

    cur.execute('SELECT id, kod, ad, tip FROM maliyet_kalemleri')
    kalemler = {r[0]: {'kod': r[1], 'ad': r[2], 'tip': r[3]} for r in cur.fetchall()}

    def ekle(tarih, kalem_id, birim, miktar, fiyat, para, tutar):
        satirlar.append({
            'tarih': tarih, 'kalem_id': kalem_id,
            'kalem_ad': kalemler[kalem_id]['ad'], 'tip': kalemler[kalem_id]['tip'],
            'birim': birim, 'miktar': miktar, 'birim_fiyat': fiyat,
            'para_birimi': para, 'tutar': tutar,
            'tutar_eur': to_eur(tutar, para, kurlar),
        })

    # ── 1) Hareket kalemleri: miktar × tarihe uygun tarife ───────────────────
    cur.execute('''
        SELECT h.tarih, h.kalem_id, h.miktar
        FROM maliyet_hareketleri h
        JOIN maliyet_kalemleri k ON k.id = h.kalem_id
        WHERE h.ulke = %s AND k.tip = 'hareket' AND h.tarih BETWEEN %s AND %s
        ORDER BY h.tarih
    ''', (ulke, start, end))
    for tarih, kalem_id, miktar in cur.fetchall():
        v = fiyat_bul(harita.get(kalem_id), tarih)
        if not v:
            tarifesiz.add(kalemler[kalem_id]['ad'])
            continue
        miktar = float(miktar)
        ekle(tarih, kalem_id, v['birim'], miktar, v['birim_fiyat'],
             v['para_birimi'], miktar * v['birim_fiyat'])

    # ── 2) Storage: bakiye yöntemi × periyot (tarife biriminden) ─────────────
    storage_kalemler = [kid for kid, k in kalemler.items() if k['tip'] == 'storage' and kid in harita]
    if storage_kalemler:
        palet_seri = None
        box_seri = None
        for kalem_id in storage_kalemler:
            guncel = fiyat_bul(harita[kalem_id], end)
            if not guncel:
                continue  # tarife aralık sonunda henüz başlamamış
            if guncel['birim'] == 'box_gun':
                if box_seri is None:
                    box_seri = box_bakiye_serisi(cur, ulke, start, end)
                seri = box_seri
            else:
                if palet_seri is None:
                    palet_seri = bakiye_serisi(cur, ulke, start, end)
                seri = palet_seri
            if guncel['birim'] == 'palet_ay':
                dilimler = _ay_dilimleri(start, end)
            elif guncel['birim'] == 'palet_hafta':
                dilimler = _hafta_dilimleri(start, end)
            elif guncel['birim'] in ('palet_gun', 'box_gun'):
                dilimler = _gun_dilimleri(start, end)
            else:
                continue
            for p_start, p_end in dilimler:
                k_start, k_end = max(p_start, start), min(p_end, end)
                v = fiyat_bul(harita[kalem_id], k_end)
                if not v:
                    continue
                bakiye = _storage_bakiye_degeri(seri, ayar['bakiye_yontemi'], k_start, k_end)
                if bakiye <= 0:
                    continue
                ekle(k_end, kalem_id, v['birim'], round(bakiye, 2),
                     v['birim_fiyat'], v['para_birimi'], bakiye * v['birim_fiyat'])

    # ── 3) Aylık sabit ücretler ──────────────────────────────────────────────
    # Kısmi ay kapsanıyorsa gün oranıyla eklenir; böylece haftalık fatura
    # dönemleriyle eşleştirmede aylık ücret her haftaya tam binmez ve ay
    # toplamı yine tam ücrete denk gelir. (miktar = ay kesri)
    aylar = _ay_dilimleri(start, end)
    sabit_kalemler = [kid for kid, k in kalemler.items() if k['tip'] == 'sabit' and kid in harita]
    for kalem_id in sabit_kalemler:
        for a_start, a_end in aylar:
            v = fiyat_bul(harita[kalem_id], a_end)
            if not v:
                continue
            kesisim_gun = (min(a_end, end) - max(a_start, start)).days + 1
            ay_gun = (a_end - a_start).days + 1
            oran = kesisim_gun / ay_gun
            ekle(max(a_start, start), kalem_id, v['birim'], round(oran, 4),
                 v['birim_fiyat'], v['para_birimi'], v['birim_fiyat'] * oran)

    # ── 4) Minimum Monthly Fee: yalnızca tamamen kapsanan aylarda ────────────
    minimum_kalemler = [kid for kid, k in kalemler.items() if k['tip'] == 'minimum' and kid in harita]
    for kalem_id in minimum_kalemler:
        for a_start, a_end in aylar:
            if a_start < start or a_end > end:
                continue  # kısmi ayda minimum kontrolü yanıltıcı olur
            v = fiyat_bul(harita[kalem_id], a_end)
            if not v:
                continue
            ay_satirlari = [s for s in satirlar if a_start <= s['tarih'] <= a_end]
            paralar = {s['para_birimi'] for s in ay_satirlari}

            if not paralar or paralar == {v['para_birimi']}:
                # Tek para birimi: doğrudan karşılaştır (kur gerekmez)
                ay_toplam = sum(s['tutar'] for s in ay_satirlari)
                fark = v['birim_fiyat'] - ay_toplam
                if fark > 0:
                    ekle(a_end, kalem_id, v['birim'], 1, v['birim_fiyat'],
                         v['para_birimi'], fark)
            else:
                # Karışık para birimleri: EUR bazında karşılaştır
                eur_degerler = [s['tutar_eur'] for s in ay_satirlari]
                min_eur = to_eur(v['birim_fiyat'], v['para_birimi'], kurlar)
                if None in eur_degerler or min_eur is None:
                    uyarilar.append(f"{a_start.strftime('%Y-%m')}: kur alınamadığı için Minimum Monthly Fee kontrolü yapılamadı")
                    continue
                fark_eur = min_eur - sum(eur_degerler)
                if fark_eur > 0:
                    # Farkı min fee'nin kendi para biriminde ifade et
                    kur = (kurlar or {}).get(v['para_birimi']) or (1.0 if v['para_birimi'] == 'EUR' else 0)
                    ekle(a_end, kalem_id, v['birim'], 1, v['birim_fiyat'],
                         v['para_birimi'], fark_eur * (kur or 1.0))

    if tarifesiz:
        uyarilar.append('Tarifesiz hareket kalemleri hesaba katılmadı: ' + ', '.join(sorted(tarifesiz)))

    return {'satirlar': satirlar, 'uyarilar': uyarilar}


def _toplamlar(satirlar):
    """Para birimi bazlı toplamlar + EUR toplam (kur eksikse None)."""
    para_toplam = {}
    eur = 0.0
    eur_eksik = False
    for s in satirlar:
        para_toplam[s['para_birimi']] = para_toplam.get(s['para_birimi'], 0.0) + s['tutar']
        if s['tutar_eur'] is None:
            eur_eksik = True
        else:
            eur += s['tutar_eur']
    return {
        'para_toplamlari': {k: round(v, 2) for k, v in para_toplam.items()},
        'eur': None if eur_eksik else round(eur, 2),
    }


def beklenen_eur(cur, ulke, start, end, kurlar):
    """Verilen aralığın beklenen toplamının EUR karşılığı (kur eksikse None).
    Fatura dönemi eşleştirmesinde kullanılır: her gerçek fatura, kendi
    döneminin beklenen tutarıyla kıyaslanır."""
    return _toplamlar(beklenen_hesapla(cur, ulke, start, end, kurlar)['satirlar'])['eur']


def kalem_ozeti(satirlar):
    """Hesap satırlarını kalem bazında toplar; tutara göre azalan sırada."""
    ozet = {}
    for s in satirlar:
        o = ozet.setdefault(s['kalem_id'], {
            'kalem_id': s['kalem_id'], 'kalem_ad': s['kalem_ad'], 'tip': s['tip'],
            'birim': s['birim'], 'para_birimi': s['para_birimi'],
            'miktar': 0.0, 'tutar': 0.0, 'tutar_eur': 0.0, 'eur_eksik': False,
        })
        o['miktar'] += s['miktar']
        o['tutar'] += s['tutar']
        if s['tutar_eur'] is None:
            o['eur_eksik'] = True
        else:
            o['tutar_eur'] += s['tutar_eur']
    kalemler = [
        {**o, 'miktar': round(o['miktar'], 2), 'tutar': round(o['tutar'], 2),
         'tutar_eur': None if o.pop('eur_eksik') else round(o['tutar_eur'], 2)}
        for o in ozet.values()
    ]
    kalemler.sort(key=lambda x: -(x['tutar_eur'] or 0))
    return kalemler


def _donem_anahtari(tarih, kirilim):
    if kirilim == 'gun':
        return tarih.isoformat()
    if kirilim == 'hafta':
        return (tarih - datetime.timedelta(days=tarih.weekday())).isoformat()
    return tarih.strftime('%Y-%m')  # ay


def maliyet_beklenen_get():
    """GET /api/maliyet/beklenen?ulke&start&end&kirilim=gun|hafta|ay —
    kalem kırılımlı beklenen tutar + dönem kırılımı + EUR karşılıkları."""
    ulke = str(request.args.get('ulke') or '').strip().lower()
    if ulke not in gecerli_ulke_kodlari():
        return jsonify({'success': False, 'error': f'Geçersiz ülke: {ulke}'}), 400
    start = _parse_date(request.args.get('start'))
    end = _parse_date(request.args.get('end'))
    if not start or not end or start > end:
        return jsonify({'success': False, 'error': 'Geçerli bir tarih aralığı girin'}), 400
    kirilim = request.args.get('kirilim') or 'ay'
    if kirilim not in ('gun', 'hafta', 'ay'):
        return jsonify({'success': False, 'error': f'Geçersiz kırılım: {kirilim}'}), 400

    kurlar = get_tcmb_kurlar()
    conn = get_conn()
    cur = conn.cursor()
    try:
        sonuc = beklenen_hesapla(cur, ulke, start, end, kurlar)
    finally:
        cur.close()
        conn.close()

    satirlar = sonuc['satirlar']
    kalemler = kalem_ozeti(satirlar)

    # Dönem kırılımı
    donem_gruplari = {}
    for s in satirlar:
        donem_gruplari.setdefault(_donem_anahtari(s['tarih'], kirilim), []).append(s)
    donemler = [
        {'donem': d, **_toplamlar(grup)}
        for d, grup in sorted(donem_gruplari.items())
    ]

    return jsonify({
        'success': True, 'ulke': ulke,
        'start': start.isoformat(), 'end': end.isoformat(), 'kirilim': kirilim,
        'kalemler': kalemler,
        'donemler': donemler,
        'toplam': _toplamlar(satirlar),
        'uyarilar': sonuc['uyarilar'],
        'kurlar': kurlar,
    })


def maliyet_karsilastirma_get():
    """GET /api/maliyet/karsilastirma?start&end — tüm kurumsal ülkeler için
    beklenen vs gerçek (EUR bazında), fark tutarı ve yüzdesi."""
    start = _parse_date(request.args.get('start'))
    end = _parse_date(request.args.get('end'))
    if not start or not end or start > end:
        return jsonify({'success': False, 'error': 'Geçerli bir tarih aralığı girin'}), 400

    kurlar = get_tcmb_kurlar()
    ulkeler = kurumsal_ulkeler()
    conn = get_conn()
    cur = conn.cursor()
    try:
        sonuc = []
        for u in ulkeler:
            hesap = beklenen_hesapla(cur, u['kod'], start, end, kurlar)
            beklenen = _toplamlar(hesap['satirlar'])

            # Dönemi tamamen aralık içinde kalan faturalar dahil edilir.
            # Her fatura KENDİ DÖNEMİNİN beklenen tutarıyla eşleştirilir —
            # aralığın tamamıyla kıyaslamak dönemler örtüşmediğinde yanıltır.
            cur.execute('''
                SELECT fatura_no, donem_baslangic, donem_bitis, tutar, para_birimi
                FROM maliyet_faturalari
                WHERE ulke = %s AND donem_baslangic >= %s AND donem_bitis <= %s
                ORDER BY donem_baslangic
            ''', (u['kod'], start, end))
            fatura_rows = cur.fetchall()
            cur.execute('''
                SELECT COUNT(*) FROM maliyet_faturalari
                WHERE ulke = %s AND donem_baslangic <= %s AND donem_bitis >= %s
                  AND NOT (donem_baslangic >= %s AND donem_bitis <= %s)
            ''', (u['kod'], end, start, start, end))
            tasan = cur.fetchone()[0]

            fatura_detay = []
            gercek_eur = 0.0
            gercek_eksik = False
            eslesen_eur = 0.0
            eslesen_eksik = False
            for f_no, d_bas, d_bit, tutar, para in fatura_rows:
                t_eur = to_eur(float(tutar), para, kurlar)
                b_eur = beklenen_eur(cur, u['kod'], d_bas, d_bit, kurlar)
                if t_eur is None:
                    gercek_eksik = True
                else:
                    gercek_eur += t_eur
                if b_eur is None:
                    eslesen_eksik = True
                else:
                    eslesen_eur += b_eur
                f_fark = f_pct = None
                if t_eur is not None and b_eur is not None:
                    f_fark = round(t_eur - b_eur, 2)
                    if b_eur > 0:
                        f_pct = round(f_fark / b_eur * 100, 1)
                fatura_detay.append({
                    'fatura_no': f_no,
                    'donem_baslangic': d_bas.isoformat(),
                    'donem_bitis': d_bit.isoformat(),
                    'tutar_eur': round(t_eur, 2) if t_eur is not None else None,
                    'beklenen_eur': round(b_eur, 2) if b_eur is not None else None,
                    'fark_eur': f_fark,
                    'fark_pct': f_pct,
                })

            # Fatura hiç girilmemişse 0 değil None: UI'da '—' ve 'fatura girilmedi'
            gercek_eur = None if (gercek_eksik or not fatura_rows) else round(gercek_eur, 2)
            eslesen = None if (eslesen_eksik or not fatura_rows) else round(eslesen_eur, 2)

            fark = fark_pct = None
            if eslesen is not None and gercek_eur is not None:
                fark = round(gercek_eur - eslesen, 2)
                if eslesen > 0:
                    fark_pct = round(fark / eslesen * 100, 1)

            sonuc.append({
                'ulke': u['kod'], 'label': u['label'],
                'beklenen': beklenen,
                'eslesen_beklenen_eur': eslesen,
                'gercek_eur': gercek_eur,
                'fatura_sayisi': len(fatura_rows),
                'tasan_fatura_sayisi': tasan,
                'fark_eur': fark,
                'fark_pct': fark_pct,
                'faturalar': fatura_detay,
                'uyarilar': hesap['uyarilar'],
            })
    finally:
        cur.close()
        conn.close()

    return jsonify({
        'success': True,
        'start': start.isoformat(), 'end': end.isoformat(),
        'ulkeler': sonuc,
        'kurlar': kurlar,
    })


def maliyet_analiz_get():
    """GET /api/maliyet/analiz?ulke&start&end — seçili ülke için aylık
    beklenen-gerçek trendi ve kalem dağılımı; tüm ülkeler için toplam ve
    palet başına maliyet (EUR). Gerçek faturalar, dönem başlangıcının
    ayına/aralığına atanır."""
    ulke = str(request.args.get('ulke') or '').strip().lower()
    if ulke not in gecerli_ulke_kodlari():
        return jsonify({'success': False, 'error': f'Geçersiz ülke: {ulke}'}), 400
    start = _parse_date(request.args.get('start'))
    end = _parse_date(request.args.get('end'))
    if not start or not end or start > end:
        return jsonify({'success': False, 'error': 'Geçerli bir tarih aralığı girin'}), 400

    kurlar = get_tcmb_kurlar()
    conn = get_conn()
    cur = conn.cursor()
    try:
        # ── Seçili ülke: aylık trend + kalem dağılımı ────────────────────────
        hesap = beklenen_hesapla(cur, ulke, start, end, kurlar)
        aylik = {a_start.strftime('%Y-%m'): {'beklenen_eur': 0.0, 'gercek_eur': 0.0, 'gercek_var': False}
                 for a_start, _ in _ay_dilimleri(start, end)}
        kalem_dagilimi = {}
        for s in hesap['satirlar']:
            ay = s['tarih'].strftime('%Y-%m')
            if s['tutar_eur'] is not None and ay in aylik:
                aylik[ay]['beklenen_eur'] += s['tutar_eur']
            k = kalem_dagilimi.setdefault(s['kalem_ad'], 0.0)
            kalem_dagilimi[s['kalem_ad']] = k + (s['tutar_eur'] or 0.0)

        cur.execute('''
            SELECT donem_baslangic, tutar, para_birimi FROM maliyet_faturalari
            WHERE ulke = %s AND donem_baslangic BETWEEN %s AND %s
        ''', (ulke, start, end))
        for d_bas, tutar, para in cur.fetchall():
            ay = d_bas.strftime('%Y-%m')
            e = to_eur(float(tutar), para, kurlar)
            if e is not None and ay in aylik:
                aylik[ay]['gercek_eur'] += e
                aylik[ay]['gercek_var'] = True

        aylik_list = [
            {'ay': ay, 'beklenen_eur': round(v['beklenen_eur'], 2),
             'gercek_eur': round(v['gercek_eur'], 2) if v['gercek_var'] else None}
            for ay, v in sorted(aylik.items())
        ]
        kalemler = sorted(
            [{'kalem_ad': ad, 'tutar_eur': round(t, 2)} for ad, t in kalem_dagilimi.items()],
            key=lambda x: -x['tutar_eur'],
        )

        # ── Tüm ülkeler: toplam + palet başına maliyet ───────────────────────
        ulkeler = []
        for u in kurumsal_ulkeler():
            h = beklenen_hesapla(cur, u['kod'], start, end, kurlar)
            beklenen = _toplamlar(h['satirlar'])

            cur.execute('''
                SELECT COALESCE(SUM(tutar), 0), COUNT(*), array_agg(DISTINCT para_birimi)
                FROM maliyet_faturalari
                WHERE ulke = %s AND donem_baslangic BETWEEN %s AND %s
            ''', (u['kod'], start, end))
            _toplam, f_sayi, _paralar = cur.fetchone()
            gercek_eur = None
            if f_sayi:
                cur.execute('''
                    SELECT tutar, para_birimi FROM maliyet_faturalari
                    WHERE ulke = %s AND donem_baslangic BETWEEN %s AND %s
                ''', (u['kod'], start, end))
                toplam = 0.0
                eksik = False
                for tutar, para in cur.fetchall():
                    e = to_eur(float(tutar), para, kurlar)
                    if e is None:
                        eksik = True
                    else:
                        toplam += e
                gercek_eur = None if eksik else round(toplam, 2)

            cur.execute('''
                SELECT COALESCE(SUM(h.miktar), 0)
                FROM maliyet_hareketleri h
                JOIN maliyet_kalemleri k ON k.id = h.kalem_id
                WHERE h.ulke = %s AND k.kod = %s AND h.tarih BETWEEN %s AND %s
            ''', (u['kod'], PALLET_OUT_KOD, start, end))
            palet_out = float(cur.fetchone()[0])

            ulkeler.append({
                'ulke': u['kod'], 'label': u['label'],
                'beklenen_eur': beklenen['eur'],
                'gercek_eur': gercek_eur,
                'palet_out': palet_out,
                'palet_basina_beklenen': round(beklenen['eur'] / palet_out, 2)
                    if beklenen['eur'] and palet_out > 0 else None,
                'palet_basina_gercek': round(gercek_eur / palet_out, 2)
                    if gercek_eur and palet_out > 0 else None,
            })
    finally:
        cur.close()
        conn.close()

    return jsonify({
        'success': True, 'ulke': ulke,
        'start': start.isoformat(), 'end': end.isoformat(),
        'aylik': aylik_list,
        'kalemler': kalemler,
        'ulkeler': ulkeler,
        'kurlar': kurlar,
    })

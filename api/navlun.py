# api/navlun.py
# Navlun/sigorta otomatik hesaplama modülü.
#
# İki iş: (1) kurumsal ülke navlun tanımlarının yönetimi (admin ekranı),
# (2) taslak ekranında palet/kap oranına göre navlun+sigorta hesabı ve gruplu
# sevkiyatta kalan tutarın partner dosyaya "bekleyen tahsis" olarak saklanması.
#
# HTTP route'ları app.py içindedir; burası sadece motor/handler fonksiyonlarıdır.

import math

from flask import jsonify, request, g

from api.db import get_conn
from api.audit import log_action

# Kamyon palet kapasitesi — formülün sabit böleni.
KAMYON_PALET = 33
# ANT (antrepo) tarafında kap → palet dönüşümünde kullanılan palet başı kap.
PALET_BASINA_KAP = 30

GECERLI_PARA_BIRIMLERI = ('EUR', 'USD', 'TRY')

# Navlun tanımı olan kurumsal ülkeler (config/countries.json kodlarıyla birebir).
KURUMSAL_ULKELER = {
    'mk': 'Makedonya',
    'xk': 'Kosova',
    'rs': 'Sırbistan',
    'ba': 'Bosna',
    'kz': 'Kazakistan',
    'ge': 'Gürcistan',
    'be': 'Belçika',
    'nl': 'Hollanda',
}


# ── YARDIMCILAR ───────────────────────────────────────────────────────────────
def _kap_to_int(value):
    """Kap alanından baştaki tam sayıyı çıkarır. '370', '43 (33 palet + 10 koli)'
    gibi değerlerin hepsinden ilk sayıyı okur."""
    s = str(value or '').strip()
    num = ''
    for ch in s:
        if ch.isdigit():
            num += ch
        elif num:
            break
    try:
        return int(num) if num else 0
    except ValueError:
        return 0


def _yil_ayikla(dosya_no):
    """'2026-101' → '2026'. Yıl parçası yoksa boş döner."""
    s = str(dosya_no or '').strip()
    if '-' in s:
        bas = s.split('-', 1)[0]
        if bas.isdigit():
            return bas
    return ''


def hesapla_navlun_sigorta(ulke_navlun, sigorta_baz, depo_tipi, kap, gruplu):
    """Navlun ve sigortayı iş kuralına göre hesaplar.

    - IHR (serbest) taslağı: çarpan = ham kap
    - ANT (antrepo) taslağı : palet = ceil(kap / 30); çarpan = palet
    - navlun  = (ülke_navlunu / 33) × çarpan → yukarı en yakın 100'e yuvarlanır
    - sigorta = (sigorta_baz / 33) × çarpan → yukarı en yakın 1'e (ceil)

    ``ulke_navlun`` çağrı öncesi doğru senaryoya göre seçilmiş tek değerdir
    (gruplu ise navlun_ant_ihr, değilse depo tipine göre navlun_ihr/navlun_ant).
    """
    kap_int = _kap_to_int(kap)
    if depo_tipi == 'antrepo':
        palet = math.ceil(kap_int / PALET_BASINA_KAP) if kap_int > 0 else 0
        carpan = palet
    else:
        palet = 0
        carpan = kap_int

    if carpan <= 0:
        return {'navlun': 0, 'sigorta': 0, 'palet': palet, 'carpan': carpan}

    navlun = math.ceil((float(ulke_navlun) / KAMYON_PALET) * carpan / 100.0) * 100
    sigorta = math.ceil((float(sigorta_baz) / KAMYON_PALET) * carpan)
    return {'navlun': int(navlun), 'sigorta': int(sigorta), 'palet': palet, 'carpan': carpan}


def _navlun_baz_sec(row, depo_tipi, gruplu):
    """Kullanılacak navlun senaryosunu seçer.
    - Gruplu (ANT+İHR aynı sevkte) → her iki taslak da navlun_ant_ihr
    - Gruplu değil + ANT (antrepo) → navlun_ant
    - Gruplu değil + İHR (serbest) → navlun_ihr
    """
    if gruplu:
        return float(row['navlun_ant_ihr'])
    if depo_tipi == 'antrepo':
        return float(row['navlun_ant'])
    return float(row['navlun_ihr'])


def _tanim_getir(cur, ulke_kodu):
    """Tek ülkenin navlun tanım satırını dict olarak döner, yoksa None."""
    cur.execute('''
        SELECT ulke_kodu, para_birimi, navlun_ihr, navlun_ant_ihr,
               navlun_ant, sigorta_baz, guncelleme_tarihi
        FROM ulke_navlun WHERE ulke_kodu = %s
    ''', (ulke_kodu,))
    r = cur.fetchone()
    if not r:
        return None
    return {
        'ulke_kodu': r[0], 'para_birimi': r[1], 'navlun_ihr': float(r[2]),
        'navlun_ant_ihr': float(r[3]), 'navlun_ant': float(r[4]),
        'sigorta_baz': float(r[5]), 'guncelleme_tarihi': r[6],
    }


# ── NAVLUN TANIMLARI: LİSTELE ─────────────────────────────────────────────────
def navlun_tanim_liste():
    """GET /api/navlun/tanim — tüm kurumsal ülkelerin navlun tanımlarını döner.
    Tanımı olmayan ülke için boş/varsayılan satır üretilir (ekranda düzenlenebilsin)."""
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute('''
            SELECT ulke_kodu, para_birimi, navlun_ihr, navlun_ant_ihr,
                   navlun_ant, sigorta_baz, guncelleme_tarihi
            FROM ulke_navlun
        ''')
        mevcut = {r[0]: r for r in cur.fetchall()}
    finally:
        cur.close()
        conn.close()

    tanimlar = []
    for kod, ad in KURUMSAL_ULKELER.items():
        r = mevcut.get(kod)
        if r:
            tanimlar.append({
                'ulkeKodu': kod, 'ulkeAdi': ad, 'paraBirimi': r[1],
                'navlunIhr': float(r[2]), 'navlunAntIhr': float(r[3]),
                'navlunAnt': float(r[4]), 'sigortaBaz': float(r[5]),
                'guncellemeTarihi': r[6].isoformat() if r[6] else None,
            })
        else:
            tanimlar.append({
                'ulkeKodu': kod, 'ulkeAdi': ad, 'paraBirimi': 'EUR',
                'navlunIhr': 0, 'navlunAntIhr': 0, 'navlunAnt': 0,
                'sigortaBaz': 10, 'guncellemeTarihi': None,
            })
    return jsonify({'success': True, 'tanimlar': tanimlar})


# ── NAVLUN TANIMLARI: KAYDET ──────────────────────────────────────────────────
def navlun_tanim_kaydet():
    """POST /api/navlun/tanim — tek ülkenin navlun tanımını ekler/günceller."""
    body = request.get_json(silent=True) or {}
    ulke = str(body.get('ulkeKodu') or '').strip().lower()
    if ulke not in KURUMSAL_ULKELER:
        return jsonify({'success': False, 'error': f'Geçersiz ülke: {ulke}'}), 400

    para = str(body.get('paraBirimi') or 'EUR').strip().upper()
    if para not in GECERLI_PARA_BIRIMLERI:
        return jsonify({'success': False, 'error': f'Geçersiz para birimi: {para}'}), 400

    def _num(anahtar):
        try:
            v = float(body.get(anahtar))
        except (TypeError, ValueError):
            return None
        return v if v >= 0 else None

    navlun_ihr = _num('navlunIhr')
    navlun_ant_ihr = _num('navlunAntIhr')
    navlun_ant = _num('navlunAnt')
    sigorta_baz = _num('sigortaBaz')
    if None in (navlun_ihr, navlun_ant_ihr, navlun_ant, sigorta_baz):
        return jsonify({'success': False, 'error': 'Navlun/sigorta değerleri negatif olmayan sayı olmalı'}), 400

    # Kullanıcının elle girdiği geçerlilik/güncelleme tarihi (opsiyonel, YYYY-AA-GG)
    import datetime
    def _parse_tarih(v):
        try:
            return datetime.date.fromisoformat(str(v or '').strip())
        except ValueError:
            return None
    saglanan_tarih = _parse_tarih(body.get('guncellemeTarihi'))

    conn = get_conn()
    cur = conn.cursor()
    try:
        # Mevcut (güncel) satırı al — değişim olursa arşivlenecek
        mevcut = _tanim_getir(cur, ulke)
        degisti = False
        geri_tarihli = False
        if mevcut:
            degisti = (
                mevcut['para_birimi'] != para or
                mevcut['navlun_ihr'] != navlun_ihr or
                mevcut['navlun_ant_ihr'] != navlun_ant_ihr or
                mevcut['navlun_ant'] != navlun_ant or
                mevcut['sigorta_baz'] != sigorta_baz
            )
            # Geri tarihli kayıt = düzeltme. Kullanıcı mevcut satırın tarihine eşit
            # ya da daha eski bir tarih girdiyse bu yeni bir revizyon değil, önceki
            # (hatalı) girişin düzeltilmesidir: o tarihten itibaren yazılmış geçmiş
            # satırları silinir ve mevcut satır arşive yazılmaz — böylece grafikte
            # sahte bir "yükselip düştü" geçişi oluşmaz.
            geri_tarihli = bool(
                saglanan_tarih and mevcut['guncelleme_tarihi']
                and saglanan_tarih <= mevcut['guncelleme_tarihi']
            )
            if geri_tarihli:
                cur.execute('''
                    DELETE FROM ulke_navlun_gecmis
                    WHERE ulke_kodu = %s AND gecerli_baslangic >= %s
                ''', (ulke, saglanan_tarih))
            # Değer değiştiyse eski değerleri, geçerli oldukları tarihle arşive yaz
            elif degisti:
                cur.execute('''
                    INSERT INTO ulke_navlun_gecmis
                        (ulke_kodu, para_birimi, navlun_ihr, navlun_ant_ihr,
                         navlun_ant, sigorta_baz, gecerli_baslangic)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                ''', (ulke, mevcut['para_birimi'], mevcut['navlun_ihr'],
                      mevcut['navlun_ant_ihr'], mevcut['navlun_ant'],
                      mevcut['sigorta_baz'], mevcut['guncelleme_tarihi']))

        # Tarih önceliği: kullanıcı elle girdiyse onu kullan; yoksa gerçek
        # değişimde/yeni kayıtta bugün, değişim yoksa mevcut tarih korunur
        # (grafik zaman ekseni sağlam kalır).
        if saglanan_tarih:
            yeni_tarih = saglanan_tarih
        elif not mevcut or degisti:
            yeni_tarih = datetime.date.today()
        else:
            yeni_tarih = mevcut['guncelleme_tarihi']

        cur.execute('''
            INSERT INTO ulke_navlun
                (ulke_kodu, para_birimi, navlun_ihr, navlun_ant_ihr,
                 navlun_ant, sigorta_baz, guncelleme_tarihi)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (ulke_kodu) DO UPDATE SET
                para_birimi = EXCLUDED.para_birimi,
                navlun_ihr = EXCLUDED.navlun_ihr,
                navlun_ant_ihr = EXCLUDED.navlun_ant_ihr,
                navlun_ant = EXCLUDED.navlun_ant,
                sigorta_baz = EXCLUDED.sigorta_baz,
                guncelleme_tarihi = EXCLUDED.guncelleme_tarihi
        ''', (ulke, para, navlun_ihr, navlun_ant_ihr, navlun_ant, sigorta_baz, yeni_tarih))
        conn.commit()
        arsivlendi = bool(degisti and not geri_tarihli)
        log_action(getattr(g, 'user', None), 'navlun_tanim',
                   f'Navlun tanımı kaydetti: {ulke} ({para}) '
                   f'İHR={navlun_ihr} ANT+İHR={navlun_ant_ihr} ANT={navlun_ant}'
                   + (' [revize+arşiv]' if arsivlendi else '')
                   + (f' [geri tarihli düzeltme → {saglanan_tarih}]' if geri_tarihli else ''))
        return jsonify({'success': True, 'arsivlendi': arsivlendi,
                        'geriTarihli': geri_tarihli,
                        'guncellemeTarihi': yeni_tarih.isoformat()})
    finally:
        cur.close()
        conn.close()


# ── NAVLUN TANIMLARI: DEĞİŞİM GEÇMİŞİ (grafik için) ───────────────────────────
def navlun_tanim_gecmis():
    """GET /api/navlun/gecmis?ulke=rs — ülkenin navlun değişim geçmişini
    (arşiv + güncel satır) tarih artan sırada döner. Ardışık versiyonlar
    arası yüzde değişim (navlun_ant_ihr üzerinden) de hesaplanır."""
    ulke = str(request.args.get('ulke') or '').strip().lower()
    if ulke not in KURUMSAL_ULKELER:
        return jsonify({'success': False, 'error': f'Geçersiz ülke: {ulke}'}), 400

    conn = get_conn()
    cur = conn.cursor()
    try:
        # Arşivlenmiş eski versiyonlar
        cur.execute('''
            SELECT gecerli_baslangic, para_birimi, navlun_ihr, navlun_ant_ihr,
                   navlun_ant, sigorta_baz, arsivlendi_at
            FROM ulke_navlun_gecmis
            WHERE ulke_kodu = %s
            ORDER BY gecerli_baslangic NULLS FIRST, id
        ''', (ulke,))
        arsiv = cur.fetchall()
        # Güncel (canlı) satır
        guncel = _tanim_getir(cur, ulke)
    finally:
        cur.close()
        conn.close()

    versiyonlar = []
    for r in arsiv:
        versiyonlar.append({
            'tarih': r[0].isoformat() if r[0] else (r[6].date().isoformat() if r[6] else None),
            'paraBirimi': r[1], 'navlunIhr': float(r[2]), 'navlunAntIhr': float(r[3]),
            'navlunAnt': float(r[4]), 'sigortaBaz': float(r[5]), 'guncel': False,
        })
    if guncel:
        versiyonlar.append({
            'tarih': guncel['guncelleme_tarihi'].isoformat() if guncel['guncelleme_tarihi'] else None,
            'paraBirimi': guncel['para_birimi'], 'navlunIhr': guncel['navlun_ihr'],
            'navlunAntIhr': guncel['navlun_ant_ihr'], 'navlunAnt': guncel['navlun_ant'],
            'sigortaBaz': guncel['sigorta_baz'], 'guncel': True,
        })

    # Zaman ekseni her zaman artan sırada olsun; aynı tarihe düşen kayıtlarda
    # sonuncusu (en güncel yazım) kalsın — geri tarihli düzeltmeler grafikte
    # tek nokta olarak görünür, ileri-geri sıçrama oluşmaz.
    versiyonlar.sort(key=lambda v: (v['tarih'] is None, v['tarih'] or ''))
    tekil = {}
    for v in versiyonlar:
        tekil[v['tarih']] = v
    versiyonlar = list(tekil.values())

    # Ardışık versiyonlar arası yüzde değişim (İhracat+Transit baz alınır)
    for i, v in enumerate(versiyonlar):
        if i == 0:
            v['degisimYuzde'] = None
        else:
            onceki = versiyonlar[i - 1]['navlunAntIhr']
            v['degisimYuzde'] = round(((v['navlunAntIhr'] - onceki) / onceki) * 100, 2) if onceki else None

    return jsonify({'success': True, 'ulke': ulke, 'versiyonlar': versiyonlar})


# ── HESAPLA (yan etkisiz canlı önizleme) ──────────────────────────────────────
def navlun_hesapla():
    """POST /api/navlun/hesapla — ülke + depo tipi + kap + gruplu bilgisinden
    navlun ve sigortayı döner. Yan etkisizdir (kayıt yapmaz); taslak ekranında
    alanları canlı doldurmak için kullanılır."""
    body = request.get_json(silent=True) or {}
    ulke = str(body.get('ulkeKodu') or '').strip().lower()
    depo_tipi = str(body.get('depoTipi') or '').strip()
    gruplu = bool(body.get('gruplu'))
    komple = bool(body.get('komple'))
    kap = body.get('kap', '')

    if ulke not in KURUMSAL_ULKELER:
        return jsonify({'success': False, 'error': f'Bu ülke için navlun tanımı yok: {ulke}'}), 400

    conn = get_conn()
    cur = conn.cursor()
    try:
        row = _tanim_getir(cur, ulke)
    finally:
        cur.close()
        conn.close()

    if not row:
        return jsonify({'success': False, 'error': 'Ülke navlun tanımı bulunamadı'}), 404

    # Komple depo/antrepo: kamyonun tamamı bu dosyaya ait → navlun ve sigorta
    # kap oranına bölünmeden, ülke tanımındaki tam değerle döner.
    if komple:
        baz = _navlun_baz_sec(row, depo_tipi, gruplu=False)
        return jsonify({
            'success': True,
            'navlun': int(round(baz)),
            'sigorta': int(round(row['sigorta_baz'])),
            'palet': 0,
            'komple': True,
            'paraBirimi': row['para_birimi'],
        })

    baz = _navlun_baz_sec(row, depo_tipi, gruplu)
    sonuc = hesapla_navlun_sigorta(baz, row['sigorta_baz'], depo_tipi, kap, gruplu)
    return jsonify({
        'success': True,
        'navlun': sonuc['navlun'],
        'sigorta': sonuc['sigorta'],
        'palet': sonuc['palet'],
        'paraBirimi': row['para_birimi'],
    })


# ── GRUPLU: KALAN TUTARI PARTNER'A SAKLA ──────────────────────────────────────
def navlun_tahsis_olustur():
    """POST /api/navlun/tahsis — gruplu sevkin ilk taslağı kaydedilirken çağrılır.
    Kalan = toplam − ilk taslağın NİHAİ (override edilmiş olabilen) değeri.
      toplam navlun  = navlun_ant_ihr
      toplam sigorta = sigorta_baz
    Kalan, partner dosya no'ya bekleyen tahsis olarak yazılır (upsert)."""
    body = request.get_json(silent=True) or {}
    ulke = str(body.get('ulkeKodu') or '').strip().lower()
    partner = str(body.get('partnerDosyaNo') or '').strip()
    kaynak = str(body.get('kaynakDosyaNo') or '').strip()

    if ulke not in KURUMSAL_ULKELER:
        return jsonify({'success': False, 'error': f'Geçersiz ülke: {ulke}'}), 400
    if not partner:
        return jsonify({'success': False, 'error': 'Partner dosya no zorunlu'}), 400

    try:
        navlun_final = float(body.get('navlunFinal'))
        sigorta_final = float(body.get('sigortaFinal'))
    except (TypeError, ValueError):
        return jsonify({'success': False, 'error': 'İlk taslak navlun/sigorta değeri geçersiz'}), 400

    conn = get_conn()
    cur = conn.cursor()
    try:
        row = _tanim_getir(cur, ulke)
        if not row:
            return jsonify({'success': False, 'error': 'Ülke navlun tanımı bulunamadı'}), 404

        # Kalan = toplam − ilk taslağın nihai değeri (negatife düşmez)
        kalan_navlun = max(0.0, float(row['navlun_ant_ihr']) - navlun_final)
        kalan_sigorta = max(0.0, float(row['sigorta_baz']) - sigorta_final)
        yil = _yil_ayikla(partner)

        cur.execute('''
            INSERT INTO navlun_bekleyen_tahsis
                (dosya_no, yil, navlun, sigorta, para_birimi, kaynak_dosya_no, kullanildi)
            VALUES (%s, %s, %s, %s, %s, %s, FALSE)
            ON CONFLICT (dosya_no, yil) DO UPDATE SET
                navlun = EXCLUDED.navlun,
                sigorta = EXCLUDED.sigorta,
                para_birimi = EXCLUDED.para_birimi,
                kaynak_dosya_no = EXCLUDED.kaynak_dosya_no,
                kullanildi = FALSE,
                created_at = now()
        ''', (partner, yil, kalan_navlun, kalan_sigorta,
              row['para_birimi'], kaynak))
        conn.commit()
        log_action(getattr(g, 'user', None), 'navlun_tahsis',
                   f'Gruplu kalan tahsis: {kaynak} → {partner} '
                   f'navlun={kalan_navlun} sigorta={kalan_sigorta} {row["para_birimi"]}')
        return jsonify({
            'success': True,
            'navlun': kalan_navlun,
            'sigorta': kalan_sigorta,
            'paraBirimi': row['para_birimi'],
        })
    finally:
        cur.close()
        conn.close()


# ── PARTNER TASLAK AÇILIŞI: BEKLEYEN TAHSİS SORGULA ──────────────────────────
def navlun_bekleyen_sorgu():
    """GET /api/navlun/bekleyen?dosyaNo=2026-101 — bu dosya için kullanılmamış
    bekleyen tahsis varsa döner, yoksa var=false. Yan etkisizdir."""
    dosya_no = str(request.args.get('dosyaNo') or '').strip()
    if not dosya_no:
        return jsonify({'success': True, 'var': False})

    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute('''
            SELECT navlun, sigorta, para_birimi, kaynak_dosya_no
            FROM navlun_bekleyen_tahsis
            WHERE dosya_no = %s AND kullanildi = FALSE
            ORDER BY created_at DESC LIMIT 1
        ''', (dosya_no,))
        r = cur.fetchone()
    finally:
        cur.close()
        conn.close()

    if not r:
        return jsonify({'success': True, 'var': False})
    return jsonify({
        'success': True, 'var': True,
        'navlun': float(r[0]), 'sigorta': float(r[1]),
        'paraBirimi': r[2], 'kaynakDosyaNo': r[3],
    })


# ══════════════════════════════════════════════════════════════════════════
# SEVKİYATLAR BESLEME (doğru para birimi kolonu) + OTOMATİK GRUPLAMA
# ══════════════════════════════════════════════════════════════════════════

def _sevkiyat_navlun_uygula(cur, dosya_no):
    """navlun_sevkiyat_hesap'taki (uygulanmamış) hesabı, ihracat_dosya_no'su
    eşleşen shipment(ler)e DOĞRU para birimi kolonuna yazar.

    - EUR ülkeler → navlun_eur / sigorta_eur
    - USD ülkeler (ge/kz) → navlun_usd / sigorta_usd (EUR kolonlarına DOKUNULMAZ;
      maliyet raporu yalnız *_eur kolonlarını topladığı için USD tutarı EUR
      kolonuna yazılırsa rapor şişer — bu yüzden ayrım kritik).

    Aynı cursor üzerinde çalışır (çağıran commit eder). Uygulanan satır sayısını döner.
    """
    cur.execute('''
        SELECT navlun, sigorta, para_birimi
        FROM navlun_sevkiyat_hesap
        WHERE dosya_no = %s AND uygulandi = FALSE
    ''', (dosya_no,))
    row = cur.fetchone()
    if not row:
        return 0

    navlun, sigorta, para = float(row[0]), float(row[1]), row[2]
    # Sıfır/boş override ile mevcut shipment değerini silme
    if navlun <= 0 and sigorta <= 0:
        return 0

    if para == 'USD':
        cur.execute('''
            UPDATE shipments SET navlun_usd = %s, sigorta_usd = %s
            WHERE ihracat_dosya_no = %s
        ''', (navlun, sigorta, dosya_no))
    else:  # EUR / TRY → EUR kolonları (kurumsal EUR ülkeleri)
        cur.execute('''
            UPDATE shipments SET navlun_eur = %s, sigorta_eur = %s
            WHERE ihracat_dosya_no = %s
        ''', (navlun, sigorta, dosya_no))
    etkilenen = cur.rowcount

    # Eşleşen shipment bulunduysa hesabı uygulandı işaretle
    if etkilenen > 0:
        cur.execute('UPDATE navlun_sevkiyat_hesap SET uygulandi = TRUE WHERE dosya_no = %s', (dosya_no,))
    return etkilenen


def _partner_dosyalari(cur, dosya_no):
    """Bir dosya no'nun gruplu partner(ler)ini navlun_bekleyen_tahsis'ten türetir.
    Dosya hem kaynak (ilk taslak) hem partner (ikinci taslak) olabilir."""
    cur.execute('''
        SELECT dosya_no FROM navlun_bekleyen_tahsis WHERE kaynak_dosya_no = %s
        UNION
        SELECT kaynak_dosya_no FROM navlun_bekleyen_tahsis WHERE dosya_no = %s
    ''', (dosya_no, dosya_no))
    return [r[0] for r in cur.fetchall() if r[0] and r[0] != dosya_no]


def _otomatik_grupla(cur, dosya_no):
    """Gruplu sevkin iki dosyasına ortak sefer_id atar (mevcut gruplama anahtarı).
    Partner shipment henüz yoksa no-op — partner oluşunca geriye dönük eşleşir.
    Aynı cursor üzerinde çalışır. Atanan sefer_id'yi ya da None döner."""
    partnerler = _partner_dosyalari(cur, dosya_no)
    if not partnerler:
        return None

    # İlgili tüm dosya no'ların (self + partnerler) shipment id + mevcut sefer_id'leri
    dosyalar = [dosya_no] + partnerler
    cur.execute('''
        SELECT id, sefer_id FROM shipments WHERE ihracat_dosya_no = ANY(%s)
    ''', (dosyalar,))
    kayitlar = cur.fetchall()
    if len(kayitlar) < 2:
        return None  # gruplamak için en az iki kayıt gerekir

    ids = [r[0] for r in kayitlar]
    mevcut_seferler = [r[1] for r in kayitlar if r[1] is not None]

    # Bir kayıt zaten gruplanmışsa onun sefer_id'sini kullan; yoksa yeni üret
    if mevcut_seferler:
        sefer_id = min(mevcut_seferler)
    else:
        cur.execute('SELECT COALESCE(MAX(sefer_id), 0) + 1 FROM shipments')
        sefer_id = cur.fetchone()[0]

    # Sefer_id'si farklı/boş olanları ortak değere çek
    cur.execute('''
        UPDATE shipments SET sefer_id = %s
        WHERE id = ANY(%s) AND (sefer_id IS DISTINCT FROM %s)
    ''', (sefer_id, ids, sefer_id))
    return sefer_id


def sevkiyat_olusturuldu(ihracat_dosya_no):
    """create_shipment içinden (try/except ile) çağrılır. İki iş yapar:
      1) Taslakta hesaplanan navlun/sigortayı doğru para birimi kolonuna yazar.
      2) Gruplu partner kaydı varsa ikisine ortak sefer_id atar.
    Kendi bağlantısını açar; hata shipment oluşturmayı ETKİLEMEZ (çağıran sarar)."""
    if not ihracat_dosya_no:
        return
    conn = get_conn()
    cur = conn.cursor()
    try:
        _sevkiyat_navlun_uygula(cur, ihracat_dosya_no)
        _otomatik_grupla(cur, ihracat_dosya_no)
        conn.commit()
    finally:
        cur.close()
        conn.close()


# ── TASLAK → SEVKİYAT BESLEME ENDPOINT ────────────────────────────────────────
def navlun_sevkiyat_yaz():
    """POST /api/navlun/sevkiyat — taslak indirilince çağrılır. Hesaplanan
    navlun/sigortayı dosya no bazında saklar; ilgili shipment varsa hemen yazar,
    yoksa create_shipment hook'u sonra uygular. Gruplamayı da tetikler."""
    body = request.get_json(silent=True) or {}
    ulke = str(body.get('ulkeKodu') or '').strip().lower()
    dosya_no = str(body.get('dosyaNo') or '').strip()

    if ulke not in KURUMSAL_ULKELER:
        return jsonify({'success': False, 'error': f'Geçersiz ülke: {ulke}'}), 400
    if not dosya_no:
        return jsonify({'success': False, 'error': 'Dosya no zorunlu'}), 400

    try:
        navlun = float(body.get('navlun') or 0)
        sigorta = float(body.get('sigorta') or 0)
    except (TypeError, ValueError):
        return jsonify({'success': False, 'error': 'Navlun/sigorta geçersiz'}), 400

    conn = get_conn()
    cur = conn.cursor()
    try:
        row = _tanim_getir(cur, ulke)
        para = row['para_birimi'] if row else 'EUR'

        # Hesabı sakla (dosya no bazında upsert; yeniden uygulanabilsin)
        cur.execute('''
            INSERT INTO navlun_sevkiyat_hesap (dosya_no, ulke_kodu, navlun, sigorta, para_birimi, uygulandi)
            VALUES (%s, %s, %s, %s, %s, FALSE)
            ON CONFLICT (dosya_no) DO UPDATE SET
                ulke_kodu = EXCLUDED.ulke_kodu,
                navlun = EXCLUDED.navlun,
                sigorta = EXCLUDED.sigorta,
                para_birimi = EXCLUDED.para_birimi,
                uygulandi = FALSE,
                created_at = now()
        ''', (dosya_no, ulke, navlun, sigorta, para))

        # Shipment zaten varsa hemen besle + gruplamayı dene
        etkilenen = _sevkiyat_navlun_uygula(cur, dosya_no)
        _otomatik_grupla(cur, dosya_no)
        conn.commit()

        return jsonify({'success': True, 'uygulandi': etkilenen > 0, 'paraBirimi': para})
    finally:
        cur.close()
        conn.close()


# ── PARTNER TASLAK KAYDEDİLDİ: TAHSİSİ KULLANILDI İŞARETLE ────────────────────
def navlun_tahsis_kullan():
    """POST /api/navlun/tahsis-kullan — partner taslağı indirilince/kaydedilince
    bekleyen tahsisi kullanıldı olarak işaretler (tekrar otomatik dolmasın)."""
    body = request.get_json(silent=True) or {}
    dosya_no = str(body.get('dosyaNo') or '').strip()
    if not dosya_no:
        return jsonify({'success': False, 'error': 'Dosya no zorunlu'}), 400

    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute('''
            UPDATE navlun_bekleyen_tahsis
            SET kullanildi = TRUE
            WHERE dosya_no = %s AND kullanildi = FALSE
        ''', (dosya_no,))
        conn.commit()
        return jsonify({'success': True, 'guncellenen': cur.rowcount})
    finally:
        cur.close()
        conn.close()

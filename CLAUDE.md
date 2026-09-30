# Fatura Araci - AI Gelistirme Notlari

Bu proje VDS uzerinde calisan Python Flask uygulamasidir. Vercel/serverless kullanilmaz.

Detayli mimari harita icin once `PROJECT_CONTEXT.md` dosyasini oku. Bu dosya daha kisa, operasyonel kurallar icindir.

## Altin Kurallar

- Ana giris noktasi `app.py`.
- Yeni API gerekiyorsa Flask route'u `app.py` icine eklenir.
- `BaseHTTPRequestHandler`, `class handler`, `vercel.json`, serverless function yapisi ekleme.
- Calisan akislari bozma; ozellikle Sirbistan fatura uretimi ve shipment kayitlari hassastir.
- Buyuk refactor yerine hedefli ve geri alinabilir degisiklik yap.
- Template/config tabanli ulke akislari birlikte guncellenmelidir.
- Veritabani degisikliklerinde mevcut veri korunmalidir.

## Calistirma

```bash
python3 app.py
```

- Port `config.json` icinden okunur; yoksa `8080`.
- Flask `0.0.0.0` uzerinden calisir.
- PostgreSQL varsayilan olarak localhost bekler.

## Dogrulama

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m py_compile app.py api/generate.py api/taslak.py api/evrak.py
```

Vercel kalintisi kontrolu:

```bash
rg -n "vercel|BaseHTTPRequestHandler|from http.server|class handler" -g '!cleanup_backups/**' -g '!venv/**' .
```

## Mimari Ozet

### app.py

Flask uygulamasinin merkezidir.

- Statik dosyalari servis eder.
- Tum `/api/...` route'larini tanimlar.
- CORS header'larini uygular.
- Backend islerini `api/*` modullerine dagitir.
- `init_db()` ile temel PostgreSQL tablolarini hazirlar.

Ana route gruplari:

- `/api/generate`: INV/PL/master uretimi.
- `/api/taslak`: taslak Excel doldurma.
- `/api/evrak`: PDF ek evrak uretimi.
- `/api/auth`, `/api/users`: auth ve kullanici yonetimi.
- `/api/storage`: uretilen dosya kayitlari.
- `/api/shipments`: shipment kayitlari, parserlar, bulk islemler.
- `/api/landed-cost`: landed cost raporlari.
- `/api/kur`: TCMB kur verisi.
- `/api/taslak-store/*`: taslak kaydetme/indirme.

### api/generate.py

HTTP handler degildir. Dispatcher moduludur.

`app.py` buradan sunlari kullanir:

- `EXCEPTION_SKUS`
- `parse_pdf`
- `dispatch(...)`

`dispatch()` ulke koduna gore ilgili engine'i cagirir:

- TRY: `api/invoice/try_engine.py`
- EUR: `api/invoice/eur_engine.py`
- USD: `api/invoice/usd_engine.py`
- Kibris: `api/invoice/cy_engine.py`, `app.py` icinde ozel akista kullanilir.

### api/invoice/*

Fatura uretim motorlari:

- `constants.py`: sabitler ve ortak listeler.
- `helpers.py`: parse/stil/Excel yardimcilari.
- `weights.py`: brut/net dagitim ve master Excel.
- `templates.py`: sablon bulma.
- `try_engine.py`: rs, ba, ge, kz, ru.
- `eur_engine.py`: xk, mk, be, de, nl.
- `usd_engine.py`: iq, ly, lr, lb, uz, abh, jo, mu.
- `cy_engine.py`: Kibris ozel akisi.
- `price_list.py`: Kazakistan price list PDF.

### api/taslak.py

Taslak Excel doldurma motorudur.

- `config/taslak_xx.json` okur.
- `templates/taslak_xx.xlsx` doldurur.
- PDF'ten alan parse edebilir.
- Standart taslak ve Kibris ozel taslak mantigini icerir.

HTTP route burada degil, `app.py` icindedir.

### api/evrak.py

PDF sablon uzerine overlay basar.

- `config/evrak_xx.json` koordinatlarini okur.
- `templates/*.pdf` sablonunu kullanir.
- ReportLab ile overlay, pypdf ile merge yapar.
- Ana fonksiyon: `generate_evrak_pdf(...)`.

### api/shipments.py

Shipment/fatura kayitlari icin en yogun is moduludur.

- CRUD
- bulk import/update/delete
- export
- freight/insurance repair
- shipment gruplama
- ulke/evrak bazli PDF parse

Degisiklik yapmadan once `app.py` icindeki ilgili route'u ve frontend `js/shipments.js` cagrisini kontrol et.

## Frontend

Build sistemi yoktur; statik HTML/CSS/JS kullanilir.

- `index.html`: ana iskelet.
- `js/shell.js`: uygulama kabugu ve navigasyon.
- `js/wizard.js`: fatura sonrasi ana wizard.
- `js/countries.js`: ulke tanimlari.
- `js/processor.js`: Excel okuma/hazirlama.
- `js/taslak.js`: taslak ekrani.
- `js/evrak.js`: ek evrak ekrani.
- `js/shipments.js`: shipment ekranlari.
- `js/landed-cost.js`: landed cost.
- `js/gtip.js`: GTIP kontrolu, backend kullanmaz.

## Sablon ve Config

- `templates/ref_*.xlsx`: INV/PL sablonlari.
- `templates/taslak_*.xlsx`: taslak sablonlari.
- `templates/*.pdf`: ek evrak sablonlari.
- `config/taslak_*.json`: taslak hucre mappingleri.
- `config/evrak_*.json`: PDF overlay koordinatlari.
- `config/countries.json`: ulke tanimlari.

## Yeni Ulke Eklerken

Fatura uretimi icin:

1. `templates/ref_xx.xlsx` ekle.
2. Para birimine gore engine sec: TRY/EUR/USD.
3. `api/invoice/*_engine.py` icinde fonksiyon ekle veya mevcut ortak fonksiyonu genislet.
4. `api/generate.py` icindeki `dispatch()` fonksiyonuna ulke kodunu ekle.
5. `js/countries.js` ve gerekiyorsa `config/countries.json` guncelle.
6. Kur gerekiyorsa `js/wizard.js` EUR/USD kontrollerini guncelle.

Taslak icin:

1. `templates/taslak_xx.xlsx` ekle.
2. `config/taslak_xx.json` ekle.
3. `js/taslak.js` ulke listesini kontrol et.

Ek evrak icin:

1. PDF sablonu `templates/` altina ekle.
2. `config/evrak_xx.json` koordinatlarini ekle.
3. `js/evrak.js` ulke/evrak tipi listesini guncelle.

Shipment parser icin:

1. Parser fonksiyonunu `api/shipments.py` icine ekle.
2. Route'u `app.py` icine ekle.
3. UI cagrisini `js/shipments.js` icine bagla.
4. Veritabani kolonlariyla uyumu kontrol et.

## Veritabani

PostgreSQL kullanilir.

Varsayilan env:

- `DB_HOST=localhost`
- `DB_PORT=5432`
- `DB_NAME=fatura_db`
- `DB_USER=fatura_user`
- `DB_PASS=`

Dosya saklama:

- Varsayilan `STORAGE_DIR=/var/fatura-storage`
- Metadata `storage_records` tablosunda.
- Varsayilan TTL 36 saat.

## Navlun Otomatik Hesaplama (2026-07)

Taslak ekraninda navlun/sigorta, palet/kap oranina gore otomatik hesaplanir.

- ANT/IHR ayrimi mevcut `depoTipi` ile yapilir: `serbest`=IHR, `antrepo`=ANT (yeni secici EKLENMEDI).
- Formul (33 = kamyon palet kapasitesi): IHR carpan = ham kap; ANT carpan = ceil(kap/30) palet.
  navlun = ceil((ulke_navlun/33)*carpan/100)*100; sigorta = ceil((sigorta_baz/33)*carpan).
- Navlun senaryosu: gruplu → navlun_ant_ihr (iki taslak da), degilse ANT→navlun_ant, IHR→navlun_ihr.
- Gruplu akis (2026-09): ANT taslaginda sadece "Gruplu Sevkiyat" isaretlenir, partner SORULMAZ; indirince
  `navlun_gruplu_ant` tablosuna (nihai navlun/sigorta) yazilir (tabloyu `init_db()` olusturur; ayrica `navlun_tanim_004.sql`).
  IHR taslaginda "Gruplu Sevkiyat" acilinca ayni ulkenin eslesmemis gruplu ANT'lari listelenir
  (`GET /api/navlun/gruplu-ant?ulke=xx`); secilen ANT'in kalani (toplam − ANT nihai) forma dolar (formul kilitli).
  IHR indirilince `POST /api/navlun/gruplu-eslestir` ANT'i eslesti isaretler ve `navlun_bekleyen_tahsis`
  satirini (dosya=IHR, kaynak=ANT, kullanildi=TRUE) yazar → mevcut `_otomatik_grupla` sefer_id atar.
  Eski akis (partner dosya no elle) UI'dan kalkti; eski bekleyen tahsis satirlari ref no blur'unda hala okunur.
- Backend: `api/navlun.py` + `/api/navlun/*` route'lari. Tablolar: `ulke_navlun`, `navlun_bekleyen_tahsis`
  (migration: `migrations/navlun_tanim_001.sql`). Admin ekrani: `js/navlun.js` → sidebar "Navlun Tanimlari".
- Tum otomatik doldurmalar override edilebilir (alanlar kilitlenmez).
- Not: taslak formundaki tek `navlun`/`sigorta` alanina yazilir; para birimi `ulke_navlun`'dan okunur.

### Taslak → Sevkiyatlar besleme + otomatik gruplama (2026-07)

- **Besleme (para birimi dogru):** Taslak indirilince `/api/navlun/sevkiyat` cagrilir; hesaplanan
  navlun/sigorta `navlun_sevkiyat_hesap` (dosya_no bazli cache) tablosuna yazilir. Shipment varsa hemen,
  yoksa `create_shipment` hook'u (`sevkiyat_olusturuldu`) sonradan uygular. Yazim para birimine gore:
  EUR ulkeler → `navlun_eur`/`sigorta_eur`; **ge/kz → `navlun_usd`/`sigorta_usd` (navlun_eur'a DOKUNMAZ)**.
  KRITIK: landed_cost raporu yalniz `*_eur` kolonlarini toplar; USD tutari `navlun_eur`'a yazilirsa rapor
  siser. Bu yuzden USD ulkelerde sadece USD kolonlari beslenir (migration: `navlun_tanim_002.sql`).
- **Otomatik gruplama:** Mevcut `sefer_id` anahtari kullanilir (yeni kolon YOK). Gruplu partner esleşmesi
  `navlun_bekleyen_tahsis` (kaynak_dosya_no ↔ dosya_no) uzerinden turetilir; `create_shipment` hook'u iki
  kaydi bulunca ortak `sefer_id` atar (ilk kayit once oluştuysa partner baglaninca geriye donuk esleşir).
  Sevkiyatlar UI'daki mevcut "Grup N" pill'i otomatik gruplari da gosterir (ek UI yok).
- Backend: `api/navlun.py` (`sevkiyat_olusturuldu`, `_sevkiyat_navlun_uygula`, `_otomatik_grupla`),
  hook cagrisi `api/shipments.py::create_shipment` sonunda (try/except ile sarili — shipment olusturmayi bozmaz).

### Navlun tanimi revizyon arsivi + degisim grafigi (2026-07)

- Navlun Tanimlari ekraninda her satirda **Kaydet** butonu var. Deger degisip kaydedilince eski deger
  `ulke_navlun_gecmis` tablosuna arsivlenir (migration: `navlun_tanim_003.sql`). Degisim yoksa arsiv YOK ve
  `guncelleme_tarihi` bumped edilmez (grafik zaman ekseni bozulmasin diye).
- `GET /api/navlun/gecmis?ulke=xx` arsiv + guncel satiri tarih artan sirada, ardisik versiyonlar arasi
  yuzde degisim (navlun_ant_ihr baz) ile doner. `js/navlun.js` bunu Chart.js line chart olarak cizer
  (3 senaryo serisi) + son revizyon degisim oranini ozetler. Chart.js `js/vendor/chart.umd.js`'ten gelir.

## Konum Raporu → Varis Gumruk (2026-09)

- Sevkiyatlar "Konum Raporu" butonu → surukle-birak penceresi → nakliyeci Excel(ler)i (Balkanlar,
  Kosova-Makedonya, Kazakistan) → `POST /api/shipments/konum-raporu/onizle` (HICBIR SEY YAZMAZ) →
  kullanicinin isaretledikleri `POST /api/shipments/konum-raporu/uygula` ile yazilir.
- KURAL: Kendiliginden yazma YOK. Onizlemede hic satir isaretli gelmez; tarih elle duzeltilebilir
  (belirsiz/okunamayan satirlar tarihi bos gelir). `uygula`: `durum='Varış Gümrük'`, `varis_tarihi`.
  Tarih bugunden ileri veya yuklemeden once olamaz; yalniz hala Yuklenecek/YOLDA olan kayit guncellenir.
- Bosna/Sirbistan (`VARIS_TESLIM_ULKELER`): varis gumruk = teslim. `uygula` ve toplu durum 'Varış Gümrük'
  bu ulkelerde dogrudan `TESLİM EDİLDİ` yazar; `varis_tarihi` = `gumrukleme_bitis` (ayni tarih).
- Konum gecmisi/hafizasi tutulmaz (denendi, kullanici istemedi).
- Varis hucresi bos ama arac varmis gorunuyorsa tarih TAHMIN edilir (`_konum_tahmini_varis`, onizlemede notla):
  "Boşaltıldı"/bosaltma tarihi → bosaltma tarihi, yoksa Excel'in son kaydedilme tarihi (`wb.properties.modified`,
  UTC+3). "Gümrükte"/"Varış gümrük(te)" (TR gumruk/depo adlari haric, `_KONUM_TR_YERLER`) → Excel kayit tarihi;
  yuklemeden bu yana `KONUM_MIN_YOL_GUN` (Balkan 3, KZ 10) gecmediyse cikis gumrugu olabilir → tarih bos gelir.
  Yuklemeden en fazla `KONUM_CIKIS_GUMRUK_GUN` (2) gun sonraysa kesin cikis gumrugu → onizlemede HIC gosterilmez.
- Belcika raporu: varis hucresinde "ETA 06.10" tahmindir → varis/hatali SAYILMAZ; baska tarih (varis/bosaltma)
  yoksa kayit yolda kalir, aciklamadan da tahmin yapilmaz. Yilsiz "06.07" gercek tarih sayilir (yil yuklemeden,
  yoksa rapor tarihinden). Bosaltma tarihi aciklama TR yer diyorsa / yuklemeden once / rapordan ileride ise tarih
  bos gelir (kontrol notu). `KONUM_MIN_YOL_GUN` Belcika 5.
- Gruplu sevkiyat (ayni `sefer_id`) ayni aractir: onizleme acik grup eslerini ayni tarihle ekler (grup esi zaten
  ilerlemisse onun varis tarihiyle), UI eslerini birlikte isaretler, `uygula` acik grup eslerini de gunceller.
- Sutunlar baslik adindan bulunur (Kazakistan'da ETA yuzunden varis I sutununda). Dosya no sutunu
  basliksiz oldugu icin "20xx-nnn" deseninin en cok gectigi sutun secilir.
- Eslestirme: once dosya no; yoksa plaka + ulke, bizdeki yukleme tarihine EN YAKIN satir (±7 gun,
  `KONUM_TARIH_TOLERANS_GUN`). Baska dosya no tasiyan satir plaka ile eslesmez. Esit yakin aday → belirsiz.
- Kod: `api/shipments.py` (`parse_konum_raporu`, `konum_raporu_onizle`, `konum_raporu_uygula`), UI `js/shipments.js`.

## Kazakistan Sigorta Police Talimati (2026-09)

- KZ INV+PL uretiminde Price List gibi ek evrak olarak `sigorta poliçe talimatı-Kazakistan - {ref}.xlsx` iner
  (ref = dosya no'lar, ANT once). Sablon `templates/sigorta_kz.xlsx`, kod `api/kz_sigorta.py`, cagri `app.py::api_generate`.
- Doldurulan: C14 urun gruplari (`Ürün Ara Grubu - EN` tekil), C20 "Bonded Warehouse/Warehouse N packages X BRÜT KG",
  E20 hareket = en gec yukleme tarihi, I24 plaka, C28 "fatura // dosya no", I32 sigorta bedeli = fatura TL toplami.
- Her fatura bilgisi `kz_sigorta_bilgi` tablosuna yazilir (`init_db()` + `migrations/kz_sigorta_001.sql`).
  Gruplu sevkte partner (`navlun_bekleyen_tahsis` veya ayni `sefer_id`) ayni forma eklenir; partner tabloda yoksa
  shipments'tan kap/fatura TL okunur (brut/grup bos kalir).

## Dokunurken Dikkat

- `api/generate.py` icine HTTP handler ekleme; sadece dispatcher olarak kalmali.
- `api/evrak.py` ve `api/taslak.py` sadece motor fonksiyonlari barindirir.
- `app.py` route giris noktasi olmaya devam etmeli.
- `cleanup_backups/` yedektir, runtime'a dahil edilmez.
- `venv/` icindeki dosyalari proje kodu gibi degistirme.

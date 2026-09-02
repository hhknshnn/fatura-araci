# Fatura Araci - Proje Baglami ve Mimari

Bu proje VDS uzerinde calisan Python Flask uygulamasidir. Vercel, serverless function veya `BaseHTTPRequestHandler` tabanli API yapisi kullanilmaz.

AI araclari ve yeni gelistiriciler icin en onemli bilgi: ana giris noktasi `app.py` dosyasidir. Backend route'lari Flask ile burada tanimlanir, `api/*.py` dosyalari ise Flask tarafindan import edilen yardimci moduller ve is motorlaridir.

## Calisma Sekli

- Uygulama `python3 app.py` ile baslar.
- Port `config.json` icindeki `port` alanindan okunur; yoksa `8080` kullanilir.
- Flask `0.0.0.0` uzerinden dinler, bu nedenle VDS disindan reverse proxy veya dogrudan port ile erisilebilir.
- Frontend statik dosyalari ayni Flask uygulamasi tarafindan servis edilir.
- PostgreSQL ana veritabani olarak kullanilir.
- Uretilen dosyalar local diske, metadata PostgreSQL'e yazilir.

## Kullanilmayan Deploy Modelleri

Bu projede asagidakiler kullanilmaz:

- Vercel
- Next.js
- Node.js backend
- Serverless function handler
- `vercel.json`
- `BaseHTTPRequestHandler`
- Cloudflare Worker

Bu yapilari geri eklemeyin. Yeni endpoint gerekiyorsa `app.py` icinde Flask route olarak ekleyin.

## Kok Dizin

- `app.py`: Flask uygulamasi, route tanimlari, CORS ve statik dosya servisi.
- `index.html`: Ana frontend giris dosyasi.
- `config.json`: Varsayilan yil, istisna SKU ve bazi UI ayarlari.
- `requirements.txt`: Python bagimliliklari.
- `CLAUDE.md`: AI araclari icin kisa operasyon notlari.
- `PROJECT_CONTEXT.md`: Bu ayrintili mimari dokumani.
- `cleanup_backups/`: Temizlik oncesi alinmis yedekler. Runtime tarafindan kullanilmaz.

## Ana Backend Girisi: app.py

`app.py` uygulamanin merkezi yonlendiricisidir.

Yaptiklari:

- Flask app olusturur.
- `init_db()` ile gerekli tablolarin varligini kontrol eder/olusturur.
- CORS header'larini tum cevaplara ekler.
- `/`, `/config.json`, `css`, `js`, `templates`, `fonts`, `assets`, `config` gibi statik dosyalari servis eder.
- API route'larini tanimlar.
- Is mantigini `api/*` modullerine dagitir.

Onemli route gruplari:

- `/api/generate`: INV, PL, master ve bazi ek PDF uretimleri.
- `/api/taslak`: Fatura oncesi taslak Excel doldurma ve PDF alan parse.
- `/api/evrak`: PDF sablon uzerine ek evrak uretimi.
- `/api/auth`: Giris, cikis, oturum ve sifre islemleri.
- `/api/users`: Kullanici yonetimi.
- `/api/storage`: Uretilen dosya kayitlarini listeleme, indirme, silme.
- `/api/shipments`: Sevkiyat/fatura kayitlari CRUD ve toplu islemler.
- `/api/landed-cost`: Landed cost raporlari.
- `/api/kur`: TCMB kur verisi.
- `/api/taslak-store/*`: Taslak kaydetme/listeleme/indirme/silme.
- `/api/shipments/parse-*`: Ulkeye/evraka ozel PDF parse endpointleri.

## Backend Modulleri

### api/generate.py

Bu dosya HTTP handler degildir. Flask tarafindan import edilen dispatcher moduludur.

Kullanim:

- `app.py` icindeki `/api/generate` route'u bu modulden `parse_pdf`, `EXCEPTION_SKUS` ve `dispatch()` kullanir.
- `dispatch()` ulke koduna gore dogru invoice engine fonksiyonunu cagirir.

Donus formati:

```python
(excel_bytes, fatura_no, master_bytes, price_list_bytes_or_none, mill_test_bytes_or_none)
```

Ulke yonlendirmesi:

- TRY grubu: `rs`, `ba`, `ge`, `kz`, `ru`
- EUR grubu: `xk`, `mk`, `de`, `nl`, `be`
- USD grubu: `iq`, `ly`, `lr`, `lb`, `uz`, `abh`, `jo`, `mu`
- Kibris: `cy` akisi `app.py` icinde ozel ele alinir ve `api/invoice/cy_engine.py` kullanilir.

### api/invoice/*

Fatura uretim motorlari burada moduler halde durur.

- `constants.py`: Ortak sabitler, renkler, kolon ayarlari, exception SKU listesi.
- `helpers.py`: PDF parse, sayi parse, stil ve Excel yardimcilari.
- `weights.py`: Brut/net agirlik dagitimi ve master Excel uretimi.
- `templates.py`: Sablon dosyalarini bulma ve template yardimcilari.
- `try_engine.py`: TRY bazli ulkeler: Sirbistan, Bosna, Gurcistan, Kazakistan, Rusya.
- `eur_engine.py`: EUR bazli ulkeler: Kosova, Makedonya, Belcika, Almanya, Hollanda.
- `usd_engine.py`: USD bazli ulkeler: Irak, Libya, Liberya, Lubnan, Ozbekistan, Abhazya, Urdun, Mauritius.
- `cy_engine.py`: Kibris ozel PL/master akisi.
- `price_list.py`: Kazakistan price list PDF uretimi.

Yeni fatura ulkesi eklerken asil degisiklik genellikle `api/invoice/*` icinde yapilir, sonra `api/generate.py` dispatcher'ina ulke kodu eklenir.

### api/taslak.py

Fatura oncesi taslak Excel doldurma motorudur.

Yaptiklari:

- `config/taslak_xx.json` dosyasini okur.
- `templates/taslak_xx.xlsx` sablonuna form verilerini yazar.
- `parse_pdf_fields()` ile PDF'ten kap, brut, net, navlun, sigorta gibi alanlari okuyabilir.
- `doldur_taslak()` standart taslaklari doldurur.
- `doldur_kibris()` Kibris'a ozel cok gruplu taslak mantigini uygular.

HTTP request alma isi bu dosyada degildir; `/api/taslak` route'u `app.py` icindedir.

### api/evrak.py

PDF sablon uzerine yazili overlay basan ek evrak motorudur.

Yaptiklari:

- `config/evrak_xx.json` dosyasindan alan koordinatlarini okur.
- `templates/*.pdf` icindeki PDF sablonunu bulur.
- ReportLab ile overlay PDF olusturur.
- pypdf ile overlay'i sablonun ilk sayfasina merge eder.
- `generate_evrak_pdf()` byte olarak PDF ve dosya adi dondurur.

Ornek kullanim: Belcika `mill_test.pdf`.

### api/shipments.py

Sevkiyat/fatura kayitlari icin ana is moduludur.

Yaptiklari:

- Shipment listeleme, ekleme, guncelleme, silme.
- Bulk import, bulk update, bulk delete.
- Shipment export.
- Ulke/evrak bazli PDF parse islemleri.
- Freight/insurance repair islemleri.
- Shipment gruplama ve gruptan cikarma.
- KZ, GE, BA, KO, AKSU, FR gibi ozel PDF parse akislari.

Bu dosya veritabani ile yogun calisir. Degisiklik yapmadan once ilgili tablo kolonlarini ve mevcut parser davranisini kontrol edin.

### api/db.py

PostgreSQL baglantisi ve minimum tablo olusturma islerinden sorumludur.

Varsayilan ortam degiskenleri:

- `DB_HOST`, varsayilan `localhost`
- `DB_PORT`, varsayilan `5432`
- `DB_NAME`, varsayilan `fatura_db`
- `DB_USER`, varsayilan `fatura_user`
- `DB_PASS`, varsayilan bos

`init_db()` kullanici, session, storage tablolarini olusturur ve shipments tablosuna bazi kolonlari ekler.

### api/storage.py

Uretilen dosyalarin kisa sureli saklanmasini yonetir.

- Dosya byte'larini local diske yazar.
- Varsayilan klasor: `/var/fatura-storage`
- `STORAGE_DIR` ortam degiskeni ile degistirilebilir.
- Metadata `storage_records` tablosuna yazilir.
- Varsayilan TTL: 36 saat.

### api/auth.py ve api/users.py

Kullanici ve oturum yonetimidir.

- Sifreler bcrypt ile hashlenir.
- Session token veritabaninda tutulur.
- Kullanici CRUD islemleri `api/users.py` uzerindedir.

### api/landed_cost.py

Landed cost ekraninin backend sorgularini ve export islemlerini tasir.

### api/kur.py

TCMB kur verilerini cekmek icin kullanilir. `/api/kur` route'u `app.py` icindedir.

### api/taslak_store.py

Taslak kaydetme, listeleme, indirme ve silme islemlerini yonetir.

### api/price_list_pdf.py

Eski/ayri Kazakistan price list PDF uretici dosyasidir. Aktif akisin `api/invoice/price_list.py` ile baglantisini kontrol etmeden degistirmeyin.

## Frontend Yapisi

Frontend saf HTML, CSS ve JavaScript agirliklidir. Build step yoktur.

- `index.html`: Ana sayfa ve ekran iskeleti.
- `css/style.css`: Genel stil.
- `css/auth.css`: Giris/kullanici ekranlari.
- `js/shell.js`: Genel uygulama kabugu, navigasyon ve ekran gecisleri.
- `js/wizard.js`: Fatura sonrasi ana wizard akisi.
- `js/processor.js`: Frontend Excel okuma/hazirlama yardimcilari.
- `js/countries.js`: Ulke tanimlari, mapping ve UI bilgileri.
- `js/sku.js`: Exception SKU yonetimi.
- `js/taslak.js`: Taslak doldurma ekrani.
- `js/evrak.js`: Ek evrak ekrani.
- `js/gtip.js`: GTIP kontrolu. Backend yoktur, referans Excel frontend'de okunur.
- `js/shipments.js`: Shipment kayitlari ve parser ekranlari.
- `js/landed-cost.js`: Landed cost UI.
- `js/gecmis.js`: Gecmis/kayit ekranlari.
- `js/auth.js`: Login/session UI.
- `js/users.js`: Kullanici yonetimi UI.
- `js/import.js`: Import yardimci akislari.
- `js/mense.js`: Mense hesaplama akislari.

## Frontend Akislari

### Fatura Sonrasi

1. Kullanici depo tipini secer.
2. Ulke secer.
3. Excel ve gerekiyorsa PDF yukler.
4. Frontend dosyayi okur, gruplari ve kilolari hazirlar.
5. `/api/generate` endpoint'ine base64 Excel/PDF ve parametreleri gonderir.
6. Flask `app.py`, `api/generate.py` dispatcher'ini kullanarak ilgili engine'i calistirir.
7. INV/PL Excel, master Excel ve varsa price list/mill test geri doner.

### Taslak

1. Kullanici ulke ve taslak dosyasi/PDF bilgilerini girer.
2. Frontend `/api/taslak` endpoint'ine gider.
3. `app.py`, `api/taslak.py` fonksiyonlarini cagirir.
4. Doldurulmus taslak Excel geri doner.

### Ek Evrak

1. Kullanici ulke, evrak tipi ve form alanlarini girer.
2. Frontend `/api/evrak` endpoint'ine gider.
3. `app.py`, `api/evrak.py` icindeki `generate_evrak_pdf()` fonksiyonunu cagirir.
4. Overlay basimli PDF geri doner.

### Shipment Kayitlari

1. Frontend `js/shipments.js` ile `/api/shipments` ve parse endpointlerini kullanir.
2. `api/shipments.py` PostgreSQL uzerinde CRUD, parser ve toplu islemleri yapar.
3. Ulkeye ozel PDF parse endpointleri `app.py` icinden yine `api/shipments.py` fonksiyonlarina dagitilir.

## Template ve Config Mantigi

### templates/

Excel/PDF sablonlari burada durur.

- `ref_*.xlsx`: INV/PL uretimi icin ulke sablonlari.
- `taslak_*.xlsx`: Fatura oncesi taslak sablonlari.
- `price_list_kz.xlsx`: Kazakistan price list sablonu.
- `mill_test.pdf`: Ek evrak PDF sablonu.
- `gtip_ref.xlsx`: Frontend GTIP kontrol referansi.

### config/

JSON tabanli ulke/ekran ayarlari burada durur.

- `countries.json`: Ulke tanimlari.
- `taslak_*.json`: Taslak Excel hucre mappingleri.
- `evrak_*.json`: PDF overlay koordinatlari ve format ayarlari.

## Veritabani ve Dosya Saklama

Ana veritabani PostgreSQL'dir. Kod varsayilan olarak lokal PostgreSQL bekler.

Onemli tablolar:

- `users`: kullanicilar.
- `sessions`: oturum tokenlari.
- `storage_records`: uretilen dosya metadata kayitlari.
- `shipments`: shipment/fatura kayitlari. Kolonlari zamanla genislemistir.

Dosya saklama:

- Dosya icerigi varsayilan olarak `/var/fatura-storage` altina yazilir.
- Metadata PostgreSQL'de tutulur.
- Kayitlar 36 saat TTL ile tasarlanmistir.

## Yeni Endpoint Eklerken

1. Route'u `app.py` icine ekleyin.
2. Is mantigi buyukse `api/<modul>.py` icinde fonksiyon olarak tutun.
3. Frontend tarafinda ilgili `js/*.js` dosyasindan `fetch('/api/...')` ile cagirin.
4. CORS icin ek islem genellikle gerekmez; `app.after_request(_cors)` tum cevaplara uygular.
5. Serverless handler, `vercel.json` veya `BaseHTTPRequestHandler` eklemeyin.

## Yeni Ulke Ekleme

Fatura sonrasi INV/PL ulkesi icin genel yol:

1. `templates/ref_xx.xlsx` sablonunu ekleyin.
2. Gerekirse `api/invoice/templates.py` icinde sablon bulma/mapping davranisini kontrol edin.
3. Para birimine gore uygun engine dosyasinda fonksiyon ekleyin:
   - TRY: `api/invoice/try_engine.py`
   - EUR: `api/invoice/eur_engine.py`
   - USD: `api/invoice/usd_engine.py`
   - Ozel: ayri engine veya mevcut engine icinde ozel fonksiyon
4. `api/generate.py` icindeki `dispatch()` fonksiyonuna ulke kodunu ekleyin.
5. `js/countries.js` ve gerekiyorsa `config/countries.json` icinde ulkeyi tanimlayin.
6. `index.html` veya mevcut UI ulke listesini kullanan kisimlari kontrol edin.
7. Kur gerekiyorsa `js/wizard.js` icindeki EUR/USD kontrol listelerini kontrol edin.
8. Test: ilgili ulke icin Excel/PDF yukleyip `/api/generate` akisini deneyin.

Taslak ulkesi icin:

1. `templates/taslak_xx.xlsx` ekleyin.
2. `config/taslak_xx.json` ekleyin.
3. `js/taslak.js` icindeki ulke listelerini kontrol edin.
4. `/api/taslak` akisini deneyin.

Ek evrak icin:

1. `templates/<evrak>.pdf` ekleyin.
2. `config/evrak_xx.json` icine field koordinatlarini ekleyin.
3. `js/evrak.js` icindeki ulke/evrak tipi listelerini kontrol edin.
4. `/api/evrak` akisini deneyin.

Shipment parser icin:

1. Parser fonksiyonunu `api/shipments.py` icinde ekleyin.
2. Route'u `app.py` icinde `/api/shipments/parse-...` olarak ekleyin.
3. Frontend cagrisini `js/shipments.js` icinde baglayin.
4. Parsed alanlarin `shipments` tablo kolonlari ile uyumlu oldugunu kontrol edin.

## Gelistirme Kurallari

- Calisan ana akislari bozmayin; ozellikle Sirbistan ve mevcut shipment kayitlari hassastir.
- Buyuk refactor yerine hedefli degisiklik tercih edin.
- Yeni bagimlilik eklemeden once gercekten gerekli mi kontrol edin.
- Template/config tabanli yapilarda sablon ve JSON mapping birlikte guncellenmelidir.
- Veritabani kolon degisikliklerinde mevcut veriyi bozmayacak `ADD COLUMN IF NOT EXISTS` gibi geriye uyumlu yaklasim kullanin.
- Eski yedek klasorleri runtime'a dahil edilmemelidir.

## Hatalari Ayiklama

- Flask baslangici: `python3 app.py`
- Syntax/import kontrolu: `PYTHONDONTWRITEBYTECODE=1 python3 -m py_compile app.py api/generate.py api/taslak.py api/evrak.py`
- Vercel kalintisi kontrolu: `rg -n "vercel|BaseHTTPRequestHandler|from http.server|class handler" -g '!cleanup_backups/**' -g '!venv/**' .`
- API route kontrolu: `rg -n "@app\\.route" app.py`
- Frontend endpoint kontrolu: `rg -n "fetch\\('/api|fetch\\(\"/api" js`

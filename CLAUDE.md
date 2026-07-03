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

## Dokunurken Dikkat

- `api/generate.py` icine HTTP handler ekleme; sadece dispatcher olarak kalmali.
- `api/evrak.py` ve `api/taslak.py` sadece motor fonksiyonlari barindirir.
- `app.py` route giris noktasi olmaya devam etmeli.
- `cleanup_backups/` yedektir, runtime'a dahil edilmez.
- `venv/` icindeki dosyalari proje kodu gibi degistirme.

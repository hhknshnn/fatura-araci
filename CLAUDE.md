# Proje: Excel Fatura ve Evrak Hazırlama Uygulaması (fatura-araci)

## Genel Kurallar
- Mevcut çalışan kodu **ASLA bozma** (özellikle Sırbistan akışı)
- Minimum değişiklik ile ilerle
- Gereksiz refactor / optimizasyon yapma
- Yeni bağımlılık ekleme
- Büyük değişiklik öncesi plan sun, onay al
- Template tabanlı ülkelerde yeni çıktı için **şablon (`ref_xx.xlsx`) tercih edilir**
- Her ülke için backend, frontend ve config ayrı ayrı tutarlı tutulmalı

---

## Dosya Yapısı

```
fatura-araci/
├── api/
│   ├── generate.py          # Ana INV+PL üretimi — tüm ülkeler
│   ├── taslak.py            # Fatura öncesi taslak doldurma
│   ├── evrak.py             # Ek evrak (PDF) üretimi
│   └── price_list_pdf.py    # KZ Price List PDF üretici
├── js/
│   ├── countries.js         # Ülke tanımları + kolon mapping
│   ├── wizard.js            # Adım adım kullanıcı akışı
│   ├── processor.js         # Frontend Excel işleme
│   ├── sku.js               # İstisna SKU yönetimi
│   ├── taslak.js            # Taslak doldurma akışı
│   ├── evrak.js             # Ek evrak akışı
│   └── gtip.js              # GTİP doğrulama akışı
├── templates/
│   ├── ref_ba.xlsx          # Bosna
│   ├── ref_ge.xlsx          # Gürcistan
│   ├── ref_ko.xlsx          # Kosova
│   ├── ref_mk.xlsx          # Makedonya
│   ├── ref_be.xlsx          # Belçika
│   ├── ref_de.xlsx          # Almanya
│   ├── ref_nl.xlsx          # Hollanda
│   ├── ref_kz.xlsx          # Kazakistan
│   ├── ref_ru.xlsx          # Rusya
│   ├── ref_uz.xlsx          # Özbekistan
│   ├── ref_iq.xlsx          # Irak
│   ├── ref_ly.xlsx          # Libya
│   ├── ref_lr.xlsx          # Liberya
│   ├── ref_lb.xlsx          # Lübnan
│   ├── ref_cy.xlsx          # Kıbrıs (PL only)
│   ├── price_list_kz.xlsx   # KZ Price List şablonu
│   ├── taslak_*.xlsx        # Ülkeye özel taslaklar
│   ├── mill_test.pdf        # Ek evrak şablonları
│   └── gtip_ref.xlsx        # GTİP referans listesi (~17K satır)
├── config/
│   ├── taslak_*.json        # Her ülkenin taslak alanları
│   └── evrak_*.json         # Her ülkenin ek evrak tanımları
├── fonts/
│   ├── DejaVuSans.ttf       # Price List PDF için (TR + Cyrillic)
│   └── DejaVuSans-Bold.ttf
├── assets/
│   └── kase.png             # Price List PDF kaşesi
├── css/
├── config.json              # Default group weights + exception SKUs
├── index.html
└── CLAUDE.md
```

---

## Mimari — 3 Katman

### 1. Frontend (wizard.js + diğerleri)
- **5 adımlık wizard:** Mod → Depo → Ülke → Dosya → Hesaplama
- Modlar: `taslak` (öncesi), `oncesi` (menşe), `sonrasi` (INV+PL), `gtip`, `evrak`
- Bağımsız paneller: `stepTaslak`, `stepGtip`, `stepEvrak`
- `ulkeKodu`, `hedefBrut`, `hedefNet`, `depoTipi`, `grupKilolari`, `exceptionSkus`, `eurKuru`, `usdKuru` backend'e gönderilir

### 2. Ortak Backend Motoru (`generate.py`)
**DOKUNMA — herkes kullanıyor:**
- `calculate_weights()` — brüt/net dağıtımı (son satır remainder absorbe eder)
- `parse_pdf()` — PDF'den kap/navlun/sigorta/kur (son 2 sayfa, IGNORECASE)
- `parse_num()`, `brd()`, `hdr()`, `dat()` — yardımcılar
- `_sku_grupla()` — SKU bazında gruplandırma (Miktar sum, diğerleri first)
- `generate_master_excel()` — stilize master çıktısı (header mavi, zebra, freeze, filter)
- `set_print()` — yazdırma ayarları
- `build_header()` — template'siz ülkeler için (Sırbistan)

**Yardımcı motorlar (DRY):**
- `_generate_excel_eur()` — EUR bazlı INV+PL (Kosova, Makedonya, Belçika, Almanya, Hollanda)
- `_generate_excel_usd()` — USD bazlı INV+PL, freight/insurance YOK (Irak, Libya, Liberya, Lübnan)

### 3. Ülkeye Özel Üreticiler

| Ülke | Kod | Fonksiyon | Şablon | Para Birimi | F/I | Notlar |
|---|---|---|---|---|---|---|
| Sırbistan | rs | `generate_excel()` | yok (kod ile) | TRY | ✓ | Default, **dokunma** |
| Bosna | ba | `generate_excel_ba()` | `ref_ba.xlsx` | TRY | ✗ | F/I yok, GRAND TOTAL TRY |
| Gürcistan | ge | `generate_excel_ge()` | `ref_ge.xlsx` | TRY | ✓ | Standart |
| Kosova | xk | `generate_excel_ko()` | `ref_ko.xlsx` | EUR | ✓ | Kur lazım |
| Makedonya | mk | `generate_excel_mk()` | `ref_mk.xlsx` | EUR | ✓ | Kur lazım |
| Belçika | be | `generate_excel_be()` | `ref_be.xlsx` | EUR | ✓ | Kur lazım |
| Almanya | de | `generate_excel_de()` | `ref_de.xlsx` | EUR | ✓ | BE_COLS kullanır |
| Hollanda | nl | `generate_excel_nl()` | `ref_nl.xlsx` | EUR | ✓ | BE_COLS kullanır |
| Kazakistan | kz | `generate_excel_kz()` | `ref_kz.xlsx` | TRY | ✓ | RU sütunları + Price List PDF |
| Rusya | ru | `generate_excel_ru()` | `ref_ru.xlsx` | TRY | ✗ | KZ_COLS kullanır, F/I yok |
| Özbekistan | uz | `generate_excel_uz()` | `ref_uz.xlsx` | TRY | ✗ | KZ_COLS kullanır, F/I yok |
| Irak | iq | `generate_excel_iq()` | `ref_iq.xlsx` | USD | ✗ | GENEL_COLS |
| Libya | ly | `generate_excel_ly()` | `ref_ly.xlsx` | USD | ✗ | GENEL_COLS |
| Liberya | lr | `generate_excel_lr()` | `ref_lr.xlsx` | USD | ✗ | GENEL_COLS |
| Lübnan | lb | `generate_excel_lb()` | `ref_lb.xlsx` | USD | ✗ | GENEL_COLS |
| Kıbrıs | cy | `generate_excel_cy()` | `ref_cy.xlsx` | — | — | **PL only**, 1-3 fatura birleştirir |

**Handler routing (`generate.py` içinde):**
```python
if ulke_kodu == 'cy':   → generate_excel_cy(faturalar, ...)  # özel: çoklu fatura
elif ulke_kodu == 'ba': → generate_excel_ba(...)
elif ulke_kodu == 'ge': → generate_excel_ge(...)
elif ulke_kodu == 'xk': → generate_excel_ko(eur_kuru, ...)
elif ulke_kodu == 'mk': → generate_excel_mk(eur_kuru, ...)
elif ulke_kodu == 'kz': → generate_excel_kz(...)  # + price_list_pdf
elif ulke_kodu == 'ru': → generate_excel_ru(...)
elif ulke_kodu == 'uz': → generate_excel_uz(...)
elif ulke_kodu == 'be': → generate_excel_be(eur_kuru, ...)
elif ulke_kodu == 'de': → generate_excel_de(eur_kuru, ...)
elif ulke_kodu == 'nl': → generate_excel_nl(eur_kuru, ...)
elif ulke_kodu == 'iq': → generate_excel_iq(usd_kuru, ...)
elif ulke_kodu == 'ly': → generate_excel_ly(usd_kuru, ...)
elif ulke_kodu == 'lr': → generate_excel_lr(usd_kuru, ...)
elif ulke_kodu == 'lb': → generate_excel_lb(usd_kuru, ...)
else:                   → generate_excel(...)  # Sırbistan
```

---

## Yeni Ülke Ekleme Adımları

### Backend (`api/generate.py`)
1. `templates/ref_xx.xlsx` referans şablonunu ekle
2. Sütun mapping tanımla:
   ```python
   XX_INV_COLS = [('out_name', 'src_col'), ...]
   XX_PL_COLS  = [...]
   ```
3. Şablon path bulucu ekle:
   ```python
   def find_xx_template_path(): ...
   ```
4. Header doldurucu ekle (sabit hücreler — A2, H3-H5 gibi):
   ```python
   def apply_xx_template_header(ws, sheet_title, fatura_no, fatura_date, packages=''): ...
   ```
5. Üretici fonksiyon ekle:
   - Standart EUR ülkesi → `_generate_excel_eur()` çağır
   - Standart USD ülkesi → `_generate_excel_usd()` çağır
   - Özel mantık varsa → kendi fonksiyonunu yaz
6. Handler'da `elif ulke_kodu == 'xx':` routing ekle

### Frontend
1. `js/countries.js` → `COUNTRIES` ve `SIMPLE_MAPS`'e ülke ekle
2. `index.html` → `country-grid` içine `country-xx` butonu ekle
3. `js/wizard.js` → `backendUlkeler` listesine `'xx'` ekle (2 yerde: `selectCountry`, `buildAndDownloadReady`, `downloadResult`, `downloadRS`)
4. EUR ülkesi ise → `['be','de','nl','xk','mk']` listesine ekle (kur kontrolü için)

### Taslak (opsiyonel)
1. `templates/taslak_xx.xlsx` taslak Excel ekle
2. `config/taslak_xx.json` config ekle
3. `js/taslak.js` → `TASLAK_ULKELER` ekle

### Ek Evrak (opsiyonel)
1. `templates/<evrak>.pdf` PDF şablonu ekle
2. `config/evrak_xx.json` config ekle (overlay koordinatları)
3. `js/evrak.js` → `EVRAK_ULKELER` + `EVRAK_TIPLERI` ekle

---

## Kolon Mapping Formatı

```python
XX_INV_COLS = [
    ('Excel başlık adı', 'Kaynak kolon adı'),
    ('QTY',              'Miktar'),
    ('UNIT PRICE',       'Fiyat (D)'),
    ('GROSS WEIGHT',     '__BRUT__'),       # hesaplanan
    ('NET WEIGHT',       '__NET__'),        # hesaplanan
    ('TOTAL AMOUNT TRY', '__CALC__'),       # Miktar × Fiyat (TRY)
    ('UNIT PRICE EUR',   '__EUR__'),        # Fiyat / eur_kuru
    ('TOTAL AMOUNT EUR', '__EUR_CALC__'),   # Miktar × (Fiyat/kur)
    ('UNIT PRICE USD',   '__USD__'),        # Fiyat (zaten USD)
    ('TOTAL AMOUNT USD', '__USD_CALC__'),   # Miktar × Fiyat
]
```

---

## Sabitler (`generate.py`)

```python
DARK_BLUE  = '1F3864'   # Kolon başlığı
MID_BLUE   = '2F5496'   # Header etiket arkaplanı
LIGHT_BLUE = 'D6E4F0'   # Header değer arkaplanı
GOLD       = 'C9A84C'   # GRAND TOTAL
LIGHT_GRAY = 'F2F2F2'   # Exporter/Importer kutusu
ZEBRA      = 'EBF3FB'   # Çift satır arkaplanı
TL_FMT     = '₺#,##0.00'
EUR_FMT    = '#,##0.00 "EUR"'
USD_FMT    = '#,##0.00 "USD"'
TRY_FMT    = '#,##0.00 "TRY"'
```

---

## Önemli Mimari Kurallar

### Ağırlık Hesaplama
- `calculate_weights()` her satır için BRÜT hesaplar, son satır kalanı absorbe eder (yuvarlama farkı sıfır olsun diye)
- `df_original` → master Excel için (gruplandırma öncesi)
- `df` (gruplandırılmış) → INV+PL için
- **Antrepo**: net listesi BRÜT oranına göre hedef NET'e dağıtılır
- **Serbest**: NET = BRÜT × 0.9

### SKU Gruplandırma
- `_sku_grupla()` → `Miktar` sum, diğerleri `first`
- Bosna ek olarak `Net Tutar (D)` de sum'lar (yuvarlama farkını önlemek için)
- Her ülke fonksiyonu önce `df_original`'i kopyalar, sonra `_sku_grupla()` yapar

### PDF Parse
- Son 2 sayfa okunur
- KAP: `* KAP ADETİ:` ve `* KAP:` iki format desteklenir
- Insurance regex: `re.IGNORECASE` ve geniş pattern eşleştirme
- Kur: `KUR BİLGİSİ:` pattern'i

### Header Hizalama Kuralı
- Header bilgi alanları (DATE, INV NO, PACKAGES, DESTINATION, INCOTERM) **UNIT PRICE ve TOTAL AMOUNT kolonlarının üstünde** hizalanır
- TOTAL / GRAND TOTAL satırları aynı kolonların altında hizalanır
- Her ülkenin INV_TOTAL_COL ve PL_GROSS_COL/PL_NET_COL sabitleri var

### Footer
- INV/PL sheet'lerinde Excel filter dropdown'a düşmemesi için footer satırları satırlar bitince eklenir
- Bosna FREIGHT/INSURANCE satırlarını **atlar** — sadece GRAND TOTAL var
- Rusya/Özbekistan F/I yok — sadece TOTAL + GRAND TOTAL
- USD ülkeleri (IQ/LY/LR/LB) F/I yok — sadece TOTAL + GRAND TOTAL

### Sabit Yapı
- `DS = 9` → kolon başlığı satırı
- Veri `DS+1`'den başlar
- Template tabanlı ülkelerde önce `delete_rows(DS+1, ...)` ile eski veri temizlenir
- Data satır yüksekliği: `23pt`
- Header satırları: R1=27, R2=28, R3-R8=22, R4=32, R7=32, R9=35
- Zebra: çift satır `FFFFFF`, tek satır `EBF3FB`

---

## Modüller (Ana INV+PL dışı)

### Taslak Doldurma (`api/taslak.py` + `js/taslak.js`)
- Fatura öncesi: kap, BRÜT, NET, navlun, sigorta, referans no
- Config sürücülü: `config/taslak_xx.json` → hücre haritası
- Kıbrıs özel: 3 grup (tekstil, tekstil dışı, kozmetik) yan yana
- Menşe taslağı: BRÜT/NET ayrımı + TR/Yabancı KG dağılımı
- PDF parse desteği: PDF'ten alanları otomatik doldurmak için `action=parsePdf`

### Ek Evrak (`api/evrak.py` + `js/evrak.js`)
- ReportLab + pypdf ile şablon PDF üzerine overlay
- Şu an: **Belçika MILL TEST** (Rus menşeli ürün beyanı)
- Config: `config/evrak_xx.json` → field, x, y, format, font, size
- Tarih formatı: `tr_date` → `2026-04-22` → `22.04.2026`

### GTİP Kontrol (`js/gtip.js`)
- **Tamamen frontend** — backend yok
- `templates/gtip_ref.xlsx` → ~17K normalize GTİP
- Master Excel yüklenir, GTİP'ler normalize edilip Set'e karşı kontrol
- Hatalı + boş GTİP'ler grup grup gösterilir

### Price List PDF (`api/price_list_pdf.py`)
- **Sadece Kazakistan**
- ReportLab ile A4 PDF
- 2 geçişli: önce sayfa sayısını say, sonra son sayfaya kaşe bas
- DejaVu Sans font (TR + Cyrillic desteği için zorunlu)
- `assets/kase.png` opsiyonel — yoksa placeholder çerçeve

---

## Frontend Wizard Akışı

```
Adım 1: Mod Seçimi
├── Taslak Doldur     → stepTaslak paneli (bağımsız)
├── Menşe Hesapla     → adım 4'e atla (depo+ülke skip)
├── GTİP Kontrol      → stepGtip paneli (bağımsız)
├── Ek Evrak          → stepEvrak paneli (bağımsız)
└── Fatura Sonrası    → adım 2'ye geç

Adım 2: Depo Tipi (sadece "sonrasi" modunda)
├── Serbest Depo      → NET = BRÜT × 0.9
└── Antrepo           → NET elle / PDF'ten

Adım 3: Ülke Seçimi
└── Corporate / Franchise gruplaması

Adım 4: Dosya Yükleme
├── Excel (master)
├── PDF (fatura)      → otomatik parse: kap, navlun, sigorta, kur
└── EUR/USD kur (gerekiyorsa, PDF'ten okunmadıysa)

Adım 5: KG Hesaplama
├── Grup kiloları tablosu (eksikleri vurgular)
├── İstisna SKU yönetimi (localStorage'a kaydedilir)
├── Hedef BRÜT girişi → satırlara dağıtılır
├── Antrepo ise → Hedef NET girişi
├── Menşe modunda → TR/Yabancı ayrımı + taslak indir
└── Sonrası modunda → INV+PL+Master indir
```

### State (`js/wizard.js`)
- `currentStep`, `selectedMod`, `selectedDepo`, `currentCountry`, `currentMode`
- `lastFileData` (Excel binary), `lastPdfData` (PDF binary)
- `masterRows`, `workingRows`, `processedWB`
- `groupWeights`, `exceptionSkus` → localStorage'da
- Kıbrıs özel: `cyExcelFiles`, `cyPdfFiles`, `cyMasterRows`

---

## Ülke Grupları (Frontend)

**Corporate (15):** Sırbistan, Bosna, Gürcistan, Kosova, Makedonya, Belçika, Almanya, Hollanda, Kazakistan
**Franchise (7):** Kıbrıs, Irak, Libya, Liberya, Lübnan, Özbekistan, Rusya

EUR ülkeleri (kur lazım): `be`, `de`, `nl`, `xk`, `mk`
USD ülkeleri (fatura zaten USD): `iq`, `ly`, `lr`, `lb`
TRY ülkeleri (kur yok): `rs`, `ba`, `ge`, `kz`, `ru`, `uz`
PL only: `cy` (Kıbrıs)

---

## Deploy
- Vercel — GitHub push → otomatik deploy
- Python runtime: `requirements.txt`
- Network limit: yalnızca whitelist domain'lere erişim
- Filesystem read-only — `templates/`, `config/`, `assets/`, `fonts/` repo'ya commit edilir
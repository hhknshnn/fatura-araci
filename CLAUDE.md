# Proje: Excel Fatura ve Evrak Hazırlama Uygulaması (fatura-araci)

## Genel Kurallar
- Mevcut çalışan kodu ASLA bozma
- Minimum değişiklik ile ilerle
- Gereksiz refactor / optimizasyon yapma
- Yeni bağımlılık ekleme
- Büyük değişiklik öncesi plan sun, onay al

---

## Dosya Yapısı

```
fatura-araci/
├── api/
│   └── generate.py        # Ana backend — tüm Excel üretimi burada
├── js/
│   ├── countries.js       # Ülke tanımları ve kolon mapping
│   ├── wizard.js          # Kullanıcı akışı (adım adım seçim)
│   ├── processor.js       # Frontend işleme mantığı
│   └── sku.js             # İstisna SKU yönetimi
├── templates/
│   ├── ref_ba.xlsx        # Bosna referans şablonu
│   └── ref_ge.xlsx        # Gürcistan referans şablonu
├── css/
├── config/
├── index.html
└── CLAUDE.md
```

---

## Mimari — 3 Katman

### 1. Frontend (wizard.js, countries.js)
- Kullanıcı ülke seçer, Excel/PDF yükler
- `ulkeKodu`, `hedefBrut`, `grupKilolari`, `exceptionSkus` backend'e gönderilir

### 2. Ortak Backend Motoru (generate.py)
- `calculate_weights()` — brüt/net dağıtımı, DOKUNMA
- `parse_pdf()` — PDF'den kap/navlun/sigorta, DOKUNMA
- `parse_num()`, `brd()`, `hdr()`, `dat()` — yardımcılar, DOKUNMA
- `build_header()` — template tabanlı olmayan ülkeler için
- `set_print()` — yazdırma ayarları

### 3. Ülkeye Özel Üreticiler (generate.py içinde)
- `generate_excel()` → Sırbistan (varsayılan)
- `generate_excel_ba()` → Bosna (`ref_ba.xlsx` şablonu)
- `generate_excel_ge()` → Gürcistan (`ref_ge.xlsx` şablonu)

Handler routing:
```python
if ulke_kodu == 'ba':   → generate_excel_ba()
elif ulke_kodu == 'ge': → generate_excel_ge()
else:                   → generate_excel()
```

---

## Yeni Ülke Ekleme Adımları
1. `templates/ref_xx.xlsx` referans dosyasını al
2. `generate.py`'ye ekle:
   - `XX_INV_COLS`, `XX_PL_COLS` — kolon mapping listesi
   - `find_xx_template_path()` — şablon path bulucu
   - `apply_xx_template_header()` — değişken alanları doldur
   - `generate_excel_xx()` — üretici fonksiyon
3. Handler'a `elif ulke_kodu == 'xx':` routing ekle
4. `countries.js`'e ülke tanımı ekle

---

## Kolon Mapping Formatı
```python
XX_INV_COLS = [
    ('Excel başlık adı', 'Kaynak kolon adı'),
    ('QTY',              'Miktar'),
    ('UNIT PRICE',       'Fiyat (D)'),
    ('GROSS WEIGHT',     '__BRUT__'),   # hesaplanan
    ('NET WEIGHT',       '__NET__'),    # hesaplanan
    ('TOTAL AMOUNT TRY', '__CALC__'),   # hesaplanan
]
```

---

## Sabitler (generate.py)
```
DARK_BLUE  = '1F3864'   # Kolon başlığı
MID_BLUE   = '2F5496'   # Header etiket
LIGHT_BLUE = 'D6E4F0'   # Header değer
GOLD       = 'C9A84C'   # Grand Total
LIGHT_GRAY = 'F2F2F2'   # Exporter/Importer kutusu
```

---

## Önemli Notlar
- Data satır yüksekliği: `23pt` (sabit)
- Header satırları: R1=27, R2=28, R3-R8=22, R4=32, R7=32, R9=35
- Zebra: çift satır `FFFFFF`, tek satır `EBF3FB`
- Template tabanlı ülkelerde `delete_rows(DS+1, ...)` ile eski veri silinir
- `DS = 9` — kolon başlığı satırı, veri `DS+1`'den başlar
- Vercel deploy: GitHub push → otomatik
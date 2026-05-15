# ── Renkler ───────────────────────────────────────────────────────────────────
DARK_BLUE  = '1F3864'
MID_BLUE   = '2F5496'
LIGHT_BLUE = 'D6E4F0'
GOLD       = 'C9A84C'
LIGHT_GRAY = 'F2F2F2'

# ── Para birimi formatları ────────────────────────────────────────────────────
TRY_FMT = '#,##0.00 "TRY"'
EUR_FMT = '#,##0.00 "EUR"'
USD_FMT = '#,##0.00 "USD"'
TL_FMT  = '₺#,##0.00'          # Sırbistan INV (₺ sembolü)

# ── İstisna SKU'lar (ağırlık override) ───────────────────────────────────────
EXCEPTION_SKUS = {
    '1SPOCA0029197.': 0.01,
    '1SPOCA0030197.': 0.01,
    '1SSARF1507139.': 0.01,
    '1SPOCA0027197.': 0.01,
    '1SPOCA0028169.': 0.01,
    '1SPOCA0030169.': 0.01,
    '1SPOCA0028197.': 0.01,
}

# ── Ülke config → INV para birimi / engine eşlemesi ──────────────────────────
# inv_fmt   : Excel hücre number_format
# grand_total: GRAND TOTAL yazısındaki para birimi etiketi
# freight   : True = INV'de FREIGHT + INSURANCE satırı var
# excel_kur : 'try' | 'eur' | 'usd'  — Excel Fiyat kolonu hangi para birimi
ULKE_CONFIG = {
    'rs': dict(inv_fmt=TL_FMT,  grand_total='GRAND TOTAL',     freight=True,  excel_kur='try', engine='try_engine'),
    'kz': dict(inv_fmt=TRY_FMT, grand_total='GRAND TOTAL TRY', freight=True,  excel_kur='try', engine='try_engine'),
    'ba': dict(inv_fmt=TRY_FMT, grand_total='GRAND TOTAL TRY', freight=True,  excel_kur='try', engine='try_engine'),
    'ge': dict(inv_fmt=TRY_FMT, grand_total='GRAND TOTAL TRY', freight=True,  excel_kur='try', engine='try_engine'),
    'ru': dict(inv_fmt=TRY_FMT, grand_total='GRAND TOTAL TRY', freight=False, excel_kur='try', engine='try_engine'),
    'xk': dict(inv_fmt=EUR_FMT, grand_total='GRAND TOTAL EUR', freight=True,  excel_kur='try', engine='eur_engine'),
    'mk': dict(inv_fmt=EUR_FMT, grand_total='GRAND TOTAL EUR', freight=True,  excel_kur='try', engine='eur_engine'),
    'be': dict(inv_fmt=EUR_FMT, grand_total='GRAND TOTAL EUR', freight=True,  excel_kur='try', engine='eur_engine'),
    'de': dict(inv_fmt=EUR_FMT, grand_total='GRAND TOTAL EUR', freight=True,  excel_kur='try', engine='eur_engine'),
    'nl': dict(inv_fmt=EUR_FMT, grand_total='GRAND TOTAL EUR', freight=True,  excel_kur='try', engine='eur_engine'),
    'iq': dict(inv_fmt=USD_FMT, grand_total='GRAND TOTAL USD', freight=False, excel_kur='usd', engine='usd_engine'),
    'ly': dict(inv_fmt=USD_FMT, grand_total='GRAND TOTAL USD', freight=False, excel_kur='usd', engine='usd_engine'),
    'lr': dict(inv_fmt=USD_FMT, grand_total='GRAND TOTAL USD', freight=False, excel_kur='usd', engine='usd_engine'),
    'lb': dict(inv_fmt=USD_FMT, grand_total='GRAND TOTAL USD', freight=False, excel_kur='usd', engine='usd_engine'),
    'uz': dict(inv_fmt=USD_FMT, grand_total='GRAND TOTAL USD', freight=False, excel_kur='usd', engine='usd_engine'),
    'cy': dict(inv_fmt=None,    grand_total=None,               freight=False, excel_kur=None,  engine='cy_engine'),
}

# ── Kolon tanımları ───────────────────────────────────────────────────────────
# Her tuple: (başlık, kaynak_kolon)
# Özel kaynak kolonlar:
#   __CALC__     → miktar × fiyat (INV para birimi)
#   __EUR__      → fiyat / eur_kuru
#   __EUR_CALC__ → miktar × (fiyat / eur_kuru)
#   __USD__      → fiyat (direk USD)
#   __USD_CALC__ → miktar × fiyat (USD)
#   __BRUT__     → hesaplanan brüt kg
#   __NET__      → hesaplanan net kg

RS_INV_COLS = [
    ('COUNTRY OF ORIGIN', 'MENŞEİ -EN'),
    ('MASTER ITEM CODE',  'Asorti Barkodu'),
    ('ITEM CODE',         'SKU'),
    ('ITEM DESCRIPTION',  'ALT GRUBU -EN'),
    ('ITEM NAME',         'Ürün Açıklaması EN'),
    ('UNIT',              'Birim Cinsi (1)'),
    ('QTY',               'Miktar'),
    ('UNIT PRICE',        'Fiyat'),
    ('TOTAL AMOUNT TRY',  '__CALC__'),
    ('HS CODE',           'GTİP'),
    ('MATERIAL',          'MATERYAL -EN'),
    ('ITEM NAME-Serb',    'Ürün Açıklaması XS'),
    ('COLOR SERB',        'Renk Açıkmalası XS'),
    ('MATERIAL SERB',     'MATERYAL -XS'),
    ('DIMENSION',         'EBAT Açıklama'),
]

RS_PL_COLS = [
    ('COUNTRY OF ORIGIN', 'MENŞEİ -EN'),
    ('MASTER ITEM CODE',  'Asorti Barkodu'),
    ('ITEM CODE',         'SKU'),
    ('ITEM DESCRIPTION',  'ALT GRUBU -EN'),
    ('ITEM NAME',         'Ürün Açıklaması EN'),
    ('UNIT',              'Birim Cinsi (1)'),
    ('QTY',               'Miktar'),
    ('GROSS WEIGHT',      '__BRUT__'),
    ('NET WEIGHT',        '__NET__'),
]

BA_INV_COLS = [
    ('COUNTRY OF ORIGIN', 'MENŞEİ -EN'),
    ('MASTER ITEM CODE',  'Asorti Barkodu'),
    ('ITEM CODE',         'SKU'),
    ('ITEM DESCRIPTION',  'ALT GRUBU -EN'),
    ('ITEM NAME',         'Ürün Açıklaması EN'),
    ('QTY',               'Miktar'),
    ('UNIT PRICE',        'Fiyat (D)'),
    ('TOTAL AMOUNT TRY',  'Net Tutar (D)'),
    ('HS CODE',           'GTİP'),
    ('MATERIAL',          'MATERYAL -EN'),
    ('COLOR',             'Renk Açıkmalası EN'),
    ('DIMENSION',         'EBAT Açıklama'),
]

BA_PL_COLS = [
    ('COUNTRY OF ORIGIN', 'MENŞEİ -EN'),
    ('MASTER ITEM CODE',  'Asorti Barkodu'),
    ('ITEM CODE',         'SKU'),
    ('ITEM DESCRIPTION',  'ALT GRUBU -EN'),
    ('ITEM NAME',         'Ürün Açıklaması EN'),
    ('QTY',               'Miktar'),
    ('GROSS WEIGHT',      '__BRUT__'),
    ('NET WEIGHT',        '__NET__'),
]

GE_INV_COLS = [
    ('COUNTRY OF ORIGIN', 'MENŞEİ -EN'),
    ('MASTER ITEM CODE',  'Asorti Barkodu'),
    ('ITEM CODE',         'SKU'),
    ('HS CODE',           'GTİP'),
    ('ITEM NAME',         'Ürün Açıklaması EN'),
    ('QTY',               'Miktar'),
    ('UNIT PRICE',        'Fiyat'),
    ('TOTAL AMOUNT TRY',  '__CALC__'),
    ('ITEM DESCRIPTION',  'ALT GRUBU -EN'),
    ('BARCODE',           'Asorti Barkodu'),
    ('MATERIAL',          'MATERYAL -EN'),
    ('DIMENSION',         'EBAT Açıklama'),
]

GE_PL_COLS = [
    ('COUNTRY OF ORIGIN', 'MENŞEİ -EN'),
    ('MASTER ITEM CODE',  'Asorti Barkodu'),
    ('ITEM CODE',         'SKU'),
    ('HS CODE',           'GTİP'),
    ('ITEM NAME',         'Ürün Açıklaması EN'),
    ('QTY',               'Miktar'),
    ('GROSS WEIGHT',      '__BRUT__'),
    ('NET WEIGHT',        '__NET__'),
]

KZ_INV_COLS = [
    ('COUNTRY OF ORIGIN',    'MENŞEİ -EN'),
    ('СТРАНА ПРОИСХОЖДЕНИЯ', 'MENŞEİ -RU'),
    ('Master Carton Code',   'Asorti Barkodu'),
    ('ITEM CODE',            'SKU'),
    ('COLOR NAME',           'Renk Açıkmalası EN'),
    ('HS CODE',              'GTİP'),
    ('ITEM DESCRIPTION - EN','ALT GRUBU -EN'),
    ('ITEM NAME - EN',       'Ürün Açıklaması EN'),
    ('описание товаров',     'Ürün Açıklaması RU'),
    ('UNIT',                 'Miktar'),
    ('UNIT PRICE',           'Fiyat'),
    ('TOTAL AMOUNT',         '__CALC__'),
    ('MATERIAL',             'MATERYAL -EN'),
    ('МАТЕРИАЛ',             'MATERYAL -RU'),
    ('ALT GRUBU Açıklama',   'ALT GRUBU Açıklama'),
    ('DIMENSION',            'EBAT Açıklama'),
]

KZ_PL_COLS = [
    ('COUNTRY OF ORIGIN',    'MENŞEİ -EN'),
    ('СТРАНА ПРОИСХОЖДЕНИЯ', 'MENŞEİ -RU'),
    ('Master Carton Code',   'Asorti Barkodu'),
    ('ITEM CODE',            'SKU'),
    ('COLOR NAME',           'Renk Açıkmalası EN'),
    ('HS CODE',              'GTİP'),
    ('ITEM DESCRIPTION - EN','ALT GRUBU -EN'),
    ('ITEM NAME - EN',       'Ürün Açıklaması EN'),
    ('описание товаров',     'Ürün Açıklaması RU'),
    ('UNIT',                 'Miktar'),
    ('GROSS WEIGHT',         '__BRUT__'),
    ('NET WEIGHT',           '__NET__'),
]

# Rusya ve Özbekistan KZ ile aynı yapı
RU_INV_COLS = KZ_INV_COLS
RU_PL_COLS  = KZ_PL_COLS
UZ_INV_COLS = KZ_INV_COLS
UZ_PL_COLS  = KZ_PL_COLS

EUR_INV_COLS = [
    ('COUNTRY OF ORIGIN', 'MENŞEİ -EN'),
    ('MASTER ITEM CODE',  'Asorti Barkodu'),
    ('ITEM CODE',         'SKU'),
    ('HS CODE',           'GTİP'),
    ('ITEM DESCRIPTION',  'ALT GRUBU -EN'),
    ('ITEM NAME',         'Ürün Açıklaması EN'),
    ('QTY',               'Miktar'),
    ('UNIT PRICE',        '__EUR__'),
    ('TOTAL AMOUNT EUR',  '__EUR_CALC__'),
    ('MATERIAL',          'MATERYAL -EN'),
    ('COLOR',             'Renk Açıkmalası EN'),
    ('DIMENSION',         'EBAT Açıklama'),
]

EUR_PL_COLS = [
    ('COUNTRY OF ORIGIN', 'MENŞEİ -EN'),
    ('MASTER ITEM CODE',  'Asorti Barkodu'),
    ('ITEM CODE',         'SKU'),
    ('HS CODE',           'GTİP'),
    ('ITEM DESCRIPTION',  'ALT GRUBU -EN'),
    ('ITEM NAME',         'Ürün Açıklaması EN'),
    ('QTY',               'Miktar'),
    ('GROSS WEIGHT',      '__BRUT__'),
    ('NET WEIGHT',        '__NET__'),
]

USD_INV_COLS = [
    ('COUNTRY OF ORIGIN', 'MENŞEİ -EN'),
    ('MASTER ITEM CODE',  'Asorti Barkodu'),
    ('ITEM CODE',         'SKU'),
    ('HS CODE',           'GTİP'),
    ('ITEM DESCRIPTION',  'ALT GRUBU -EN'),
    ('ITEM NAME',         'Ürün Açıklaması EN'),
    ('QTY',               'Miktar'),
    ('UNIT PRICE',        '__USD__'),
    ('TOTAL AMOUNT USD',  '__USD_CALC__'),
    ('MATERIAL',          'MATERYAL -EN'),
    ('COLOR',             'Renk Açıkmalası EN'),
    ('DIMENSION',         'EBAT Açıklama'),
]

USD_PL_COLS = [
    ('COUNTRY OF ORIGIN', 'MENŞEİ -EN'),
    ('MASTER ITEM CODE',  'Asorti Barkodu'),
    ('ITEM CODE',         'SKU'),
    ('HS CODE',           'GTİP'),
    ('ITEM DESCRIPTION',  'ALT GRUBU -EN'),
    ('ITEM NAME',         'Ürün Açıklaması EN'),
    ('QTY',               'Miktar'),
    ('GROSS WEIGHT',      '__BRUT__'),
    ('NET WEIGHT',        '__NET__'),
]

CY_PL_COLS = [
    ('MENŞEİ',                  'MENŞEİ Açıklama'),
    ('Asorti Barkodu',          'Asorti Barkodu'),
    ('ÜRÜN KODU',               'SKU'),
    ('ÜRÜN TANIMI ( ALT GRUP)', 'ALT GRUBU Açıklama'),
    ('ÜRÜN ADI',                'Madde Açıklaması'),
    ('TOPLAM ÜRÜN ADEDİ',       'Miktar'),
    ('TOPLAM BRÜT AĞIRLIK',     '__BRUT__'),
    ('TOPLAM NET AĞIRLIK',      '__NET__'),
    ('ANAGRUP',                 'ÜRÜN ANA GRUBU'),
    ('E-FAT SERİ NO',           'E-Fatura Seri Numarası'),
]

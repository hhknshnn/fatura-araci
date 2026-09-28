# api/maliyet/excel_aktar.py
# Lojistik maliyet Excel'ini Maliyet Takip'e aktarma.
# Desteklenen biçimler:
#   1) Tarife uzun liste  — Ülke / Kalem / Birim Fiyat / Para / Birim / Tarih
#   2) Tarife matrisi     — satır: kalem, sütun: ülke (export "Tarife Matrisi")
#   3) Hareket listesi    — Tarih / Kalem / Miktar [/ Ülke]
# Önizleme yazmaz; aktarım mevcut upsert kurallarını kullanır.

import base64
import datetime
import io
import re
import unicodedata

import pandas as pd
from flask import jsonify, request, g
from openpyxl.utils.datetime import from_excel

from api.audit import log_action
from api.db import get_conn
from api.maliyet.hareket import _upsert_hareket
from api.maliyet.meta import kurumsal_ulkeler, gecerli_ulke_kodlari
from api.maliyet.bosna_excel import parse_bosna_fatura_sheet, bosna_aylik_rapor, bosna_excel_aktarim

GECERLI_PARA = ('EUR', 'USD', 'TRY')
MAX_BYTES = 8 * 1024 * 1024

ULKE_ALIAS = {
    'rs': ('rs', 'sirbistan', 'sırbistan', 'serbia', 'srbija'),
    'ba': ('ba', 'bosna', 'bosnia', 'bosnia and herzegovina', 'bosna hersek'),
    'ge': ('ge', 'gurcistan', 'gürcistan', 'georgia'),
    'xk': ('xk', 'ko', 'kosova', 'kosovo'),
    'mk': ('mk', 'makedonya', 'macedonia', 'north macedonia', 'kuzey makedonya'),
    'be': ('be', 'belcika', 'belçika', 'belgium'),
    'de': ('de', 'almanya', 'germany', 'deutschland'),
    'nl': ('nl', 'hollanda', 'netherlands', 'holland', 'nederland'),
    'kz': ('kz', 'kazakistan', 'kazakhstan'),
}

BIRIM_ALIAS = {
    'palet': ('palet', 'pallet', 'pallets', 'plt', 'pal', 'eu palet', 'europallet'),
    'koli': ('koli', 'box', 'boxes', 'carton', 'karton', 'kutu'),
    'siparis': ('siparis', 'sipariş', 'order', 'orders', 'siparis', 'order processing'),
    'satir': ('satir', 'satır', 'line', 'lines', 'picking line'),
    'adet': ('adet', 'pcs', 'piece', 'pieces', 'qty', 'unit'),
    'konteyner': ('konteyner', 'container', 'cnt', 'teu', 'devanning'),
    'islem': ('islem', 'işlem', 'job', 'event', 'activity'),
    'ay': ('ay', 'month', 'monthly', 'aylik', 'aylık', 'per month'),
    'palet_gun': ('palet_gun', 'palet/gun', 'palet/gün', 'pallet/day', 'pallet day', 'per day', 'gunluk palet'),
    'palet_hafta': ('palet_hafta', 'palet/hafta', 'pallet/week', 'pallet week', 'weekly pallet'),
    'palet_ay': ('palet_ay', 'palet/ay', 'pallet/month', 'pallet month', 'monthly pallet'),
    'box_gun': ('box_gun', 'box/gun', 'box/gün', 'box/day', 'koli/gün', 'koli/gun'),
}

KALEM_ALIAS = {
    'pallet_in': ('pallet in', 'palet giris', 'palet giriş', 'inbound pallet', 'in palet', 'istovar', 'inbound'),
    'pallet_out': ('pallet out', 'palet cikis', 'palet çıkış', 'outbound pallet', 'out palet', 'utovar', 'outbound'),
    'box_in': ('box in', 'koli giris', 'koli giriş', 'inbound box'),
    'box_out': ('box out', 'koli cikis', 'koli çıkış', 'outbound box'),
    'handling': ('handling', 'ellecleme', 'elleçleme', 'handling fee'),
    'store_transfer': ('store transfer', 'store transfer per pallet', 'depo transfer', 'internal transfer'),
    'storage': ('storage', 'depolama', 'warehouse storage', 'opslag', 'skladistenje', 'skladistenje'),
    'order_processing': ('order processing', 'order processing fee', 'siparis isleme', 'sipariş işleme'),
    'picking_line': ('picking per line', 'picking', 'picking line', 'satir toplama'),
    'labeling': ('labeling', 'relabeling', 'etiketleme', 'label'),
    'repalletizing': ('repalletizing', 'shrink wrap', 'yeniden paletleme'),
    'pallet_exchange': ('pallet exchange', 'eur palet', 'europallet exchange'),
    'devanning': ('devanning', 'container unloading', 'konteyner bosaltma'),
    'returns_handling': ('returns handling', 'iade', 'return handling'),
    'waste_disposal': ('waste disposal', 'atik', 'atık'),
    'admin_fee': ('administration', 'documentation fee', 'admin fee', 'idari ucret'),
    'min_monthly_fee': ('minimum monthly fee', 'minimum fee', 'min ucret'),
    'transport': ('transport', 'delivery', 'nakliye', 'teslimat', 'freight', 'navlun', 'nakliyat'),
    'fuel_surcharge': ('fuel surcharge', 'yakit', 'yakıt', 'diesel', 'brandstof'),
    'taxes': ('taxes', 'customs', 'gumruk', 'gümrük', 'carinsko', 'taksa', 'zatezne', 'kamate'),
}


def _fold(value):
    s = str(value or '').strip().lower().replace('ı', 'i')
    tr = str.maketrans('çğıöşü', 'cgiosu')
    s = s.translate(tr)
    s = unicodedata.normalize('NFKD', s)
    s = ''.join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r'[^a-z0-9]+', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


def _header_key(value):
    return _fold(value).replace(' ', '_')


def _parse_date(value):
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    if isinstance(value, datetime.datetime):
        return value.date()
    if isinstance(value, datetime.date):
        return value
    if isinstance(value, (int, float)) and 20000 < float(value) < 80000:
        try:
            return from_excel(float(value)).date()
        except Exception:
            pass
    s = str(value).strip()
    if not s or s.lower() in ('nan', 'none', '-'):
        return None
    for fmt in ('%Y-%m-%d', '%d.%m.%Y', '%d/%m/%Y', '%d-%m-%Y', '%Y.%m.%d', '%m/%d/%Y'):
        try:
            return datetime.datetime.strptime(s[:10], fmt).date()
        except ValueError:
            continue
    try:
        return datetime.date.fromisoformat(s[:10])
    except ValueError:
        return None


def _parse_number(value):
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    s = str(value).strip()
    if not s or s in ('-', '—', '–'):
        return None
    s = re.sub(r'[€$₺]|EUR|USD|TRY', '', s, flags=re.I).strip()
    s = re.sub(r'[^\d,.\-]', '', s)
    if not s or s in ('-', '.'):
        return None
    if ',' in s and '.' in s:
        s = s.replace('.', '').replace(',', '.') if s.rfind(',') > s.rfind('.') else s.replace(',', '')
    elif ',' in s:
        s = s.replace('.', '').replace(',', '.')
    try:
        return float(s)
    except ValueError:
        return None


def _parse_price_cell(value):
    """Hücreden (fiyat, para, birim) çıkarır. '1,25 EUR / palet' destekler."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None, None, None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value), None, None
    s = str(value).strip()
    if not s or s in ('-', '—', '–'):
        return None, None, None
    para = None
    upper = s.upper()
    for kod, isaret in (('EUR', '€'), ('USD', '$'), ('TRY', '₺')):
        if kod in upper or isaret in s:
            para = kod
            break
    birim = None
    slash = re.search(r'[/]\s*([A-Za-zÇĞİÖŞÜçğıöşü_ /]+)$', s)
    if slash:
        birim = _esles_birim(slash.group(1))
        s = s[:slash.start()]
    fiyat = _parse_number(s)
    return fiyat, para, birim


def _esles_ulke(value, ulke_map):
    key = _fold(value)
    if not key:
        return None
    if key in ulke_map:
        return ulke_map[key]
    for kod, aliases in ULKE_ALIAS.items():
        if key in aliases or key == kod:
            return kod if kod in set(ulke_map.values()) else None
    return None


def _esles_birim(value):
    key = _fold(value).replace(' ', '_')
    if not key:
        return None
    for kod, aliases in BIRIM_ALIAS.items():
        folded = {_fold(a).replace(' ', '_') for a in aliases}
        if key == kod or key in folded:
            return kod
    return key if re.fullmatch(r'[a-z0-9_]+', key) else None


def _esles_kalem(value, kalem_map):
    key = _fold(value)
    if not key:
        return None
    if key in kalem_map:
        return kalem_map[key]
    for kod, aliases in KALEM_ALIAS.items():
        if key in {_fold(a) for a in aliases} or key == _fold(kod):
            if kod in kalem_map:
                return kalem_map[kod]
            # kod -> id map also keyed by ad; try kod directly
            for map_key, kid in kalem_map.items():
                if map_key == kod:
                    return kid
    return None


def _ulke_map(ulkeler):
    mapping = {}
    for u in ulkeler:
        mapping[_fold(u['kod'])] = u['kod']
        mapping[_fold(u['label'])] = u['kod']
        for alias in ULKE_ALIAS.get(u['kod'], ()):
            mapping[_fold(alias)] = u['kod']
    return mapping


def _kalem_map(kalemler):
    mapping = {}
    for k in kalemler:
        mapping[_fold(k['kod'])] = k
        mapping[_fold(k['ad'])] = k
        mapping[k['kod']] = k
        for alias in KALEM_ALIAS.get(k['kod'], ()):
            mapping[_fold(alias)] = k
    return mapping


def _dosya_oku():
    if request.files.get('dosya'):
        f = request.files['dosya']
        data = f.read()
        ad = f.filename or 'maliyet.xlsx'
        return data, ad, None
    body = request.get_json(silent=True) or {}
    b64 = body.get('excel') or body.get('file') or ''
    if not b64:
        return None, None, 'Excel dosyası yükleyin'
    try:
        if ',' in b64 and b64.strip().startswith('data:'):
            b64 = b64.split(',', 1)[1]
        data = base64.b64decode(b64)
    except Exception:
        return None, None, 'Excel verisi okunamadı'
    return data, str(body.get('dosya_adi') or 'maliyet.xlsx'), None


def _sheetleri_oku(data):
    bio = io.BytesIO(data)
    # OLE Compound (.xls) vs ZIP (.xlsx)
    if data[:8] == b'\xd0\xcf\x11\xe0':
        engines = ('xlrd', None)
    elif data[:2] == b'PK':
        engines = ('openpyxl', None)
    else:
        engines = ('openpyxl', 'xlrd', None)
    last = None
    for engine in engines:
        bio.seek(0)
        try:
            kwargs = dict(sheet_name=None, header=None, dtype=object)
            if engine:
                kwargs['engine'] = engine
            return pd.read_excel(bio, **kwargs)
        except Exception as exc:
            last = exc
    raise ValueError(f'Excel okunamadı: {last}') from last


def _satir_degerleri(row):
    vals = []
    for v in row:
        if v is None or (isinstance(v, float) and pd.isna(v)):
            vals.append('')
        else:
            vals.append(v)
    return vals


HEADER_TARIFE = {
    'ulke': {'ulke', 'country', 'depo', 'warehouse'},
    'kalem': {'maliyet_kalemi', 'kalem', 'kalem_adi', 'item', 'cost_item', 'service', 'hizmet'},
    'kod': {'kalem_kodu', 'kod', 'code', 'sku'},
    'fiyat': {'birim_fiyat', 'fiyat', 'unit_price', 'price', 'rate', 'tarif', 'ucret'},
    'para': {'para_birimi', 'para', 'currency', 'curr'},
    'birim': {'birim', 'unit', 'uom'},
    'baslangic': {'gecerlilik_baslangici', 'gecerli_baslangic', 'baslangic', 'valid_from', 'effective', 'tarih'},
    'notlar': {'notlar', 'not', 'notes', 'aciklama'},
}

HEADER_HAREKET = {
    'tarih': {'tarih', 'date', 'gun', 'gün'},
    'kalem': {'kalem', 'maliyet_kalemi', 'item', 'service'},
    'miktar': {'miktar', 'qty', 'quantity', 'adet', 'volume'},
    'ulke': {'ulke', 'country', 'depo'},
}

HEADER_FATURA = {
    'ulke': {'ulke', 'country', 'depo', 'warehouse'},
    'kalem': {'maliyet_kalemi', 'kalem', 'kalem_adi', 'item', 'cost_item', 'service', 'hizmet'},
    'tutar': {'tutar', 'amount', 'toplam', 'maliyet', 'cost', 'value', 'total'},
    'tarih': {'tarih', 'date', 'fatura_tarihi', 'invoice_date'},
    'donem': {'donem', 'ay', 'month', 'period', 'yil_ay'},
    'fatura_no': {'fatura_no', 'invoice', 'invoice_no', 'invoice_nr'},
    'miktar': {'miktar', 'qty', 'quantity', 'adet'},
    'aciklama': {'aciklama', 'description', 'aciklama', 'notes'},
}

SKIP_SHEETS = {
    'dashboard', 'ozet', 'özet', 'summary', 'cover', 'index',
    'icindekiler', 'contents', 'grafik', 'chart',
}

AY_ADLARI = {
    'oca': 1, 'ocak': 1, 'jan': 1, 'january': 1,
    'sub': 2, 'subat': 2, 'feb': 2, 'february': 2,
    'mar': 3, 'mart': 3, 'march': 3,
    'nis': 4, 'nisan': 4, 'apr': 4, 'april': 4,
    'may': 5, 'mayis': 5, 'mayıs': 5,
    'haz': 6, 'haziran': 6, 'jun': 6, 'june': 6,
    'tem': 7, 'temmuz': 7, 'jul': 7, 'july': 7,
    'agu': 8, 'agustos': 8, 'aug': 8, 'august': 8,
    'eyl': 9, 'eylul': 9, 'sep': 9, 'sept': 9, 'september': 9,
    'eki': 10, 'ekim': 10, 'oct': 10, 'october': 10,
    'kas': 11, 'kasim': 11, 'nov': 11, 'november': 11,
    'ara': 12, 'aralik': 12, 'dec': 12, 'december': 12,
}


def _ay_from_header(value, default_year):
    """Başlıktan (yıl, ay) çıkarır; tanınmazsa None."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    if isinstance(value, datetime.datetime):
        return value.year, value.month
    if isinstance(value, datetime.date):
        return value.year, value.month
    s = str(value).strip()
    if not s:
        return None
    m = re.search(r'(20\d{2})[./\-](\d{1,2})', s)
    if m:
        ay = int(m.group(2))
        if 1 <= ay <= 12:
            return int(m.group(1)), ay
    m = re.search(r'(\d{1,2})[./\-](20\d{2})', s)
    if m:
        ay = int(m.group(1))
        if 1 <= ay <= 12:
            return int(m.group(2)), ay
    key = _fold(s)
    yil = default_year
    ym = re.search(r'20\d{2}', key)
    if ym:
        yil = int(ym.group(0))
        key = key.replace(ym.group(0), ' ').strip()
    key = re.sub(r'\b(20\d{2}|ay|month)\b', '', key).strip()
    if key in AY_ADLARI:
        return yil, AY_ADLARI[key]
    m = re.match(r'^([a-z]+)\s+(\d{2})$', key)
    if m and m.group(1) in AY_ADLARI:
        yy = int(m.group(2))
        return 2000 + yy, AY_ADLARI[m.group(1)]
    return None


def _esles_header_map(headers, sozluk):
    mapping = {}
    folded = [_header_key(h) for h in headers]
    for alan, adaylar in sozluk.items():
        for i, h in enumerate(folded):
            if h in adaylar and alan not in mapping:
                mapping[alan] = i
    return mapping


def _baslik_satiri_bul(rows, ulke_map):
    """İlk 20 satırda tarife-uzun, tarife-matris veya hareket başlığını arar."""
    best = None
    for i, raw in enumerate(rows[:20]):
        headers = [str(v).strip() if v is not None and not (isinstance(v, float) and pd.isna(v)) else '' for v in raw]
        if sum(1 for h in headers if h) < 2:
            continue
        tarife_map = _esles_header_map(headers, HEADER_TARIFE)
        hareket_map = _esles_header_map(headers, HEADER_HAREKET)
        fatura_map = _esles_header_map(headers, HEADER_FATURA)
        ulke_sutunlari = []
        for idx, h in enumerate(headers):
            kod = _esles_ulke(h, ulke_map)
            if kod:
                ulke_sutunlari.append((idx, kod))
        skor_uzun = 10 * int('kalem' in tarife_map or 'kod' in tarife_map) + 8 * int('fiyat' in tarife_map) + 6 * int('ulke' in tarife_map)
        skor_matris = 0
        if ulke_sutunlari and all(idx != 0 for idx, _kod in ulke_sutunlari):
            skor_matris = 10 + 2 * len(ulke_sutunlari) + 4 * int(_fold(headers[0]) in (
                'maliyet_kalemi', 'kalem', 'item', 'service', 'hizmet', ''))
        skor_hareket = 10 * int('tarih' in hareket_map) + 8 * int('miktar' in hareket_map) + 6 * int('kalem' in hareket_map)
        skor_fatura = (
            12 * int('tutar' in fatura_map) + 6 * int('kalem' in fatura_map)
            + 4 * int('ulke' in fatura_map) + 3 * int('fatura_no' in fatura_map or 'donem' in fatura_map)
        )
        adaylar = [
            ('tarife_uzun', skor_uzun, tarife_map, ulke_sutunlari),
            ('tarife_matris', skor_matris, tarife_map, ulke_sutunlari),
            ('hareket', skor_hareket, hareket_map, ulke_sutunlari),
            ('fatura_uzun', skor_fatura, fatura_map, ulke_sutunlari),
        ]
        tip, skor, mapping, ulkeler = max(adaylar, key=lambda x: x[1])
        if skor >= 10 and (best is None or skor > best[0]):
            best = (skor, i, tip, mapping, ulkeler, headers)
    return best


def _parse_sheet(name, df, ulke_map, kalem_map, varsayilan_baslangic):
    rows = [_satir_degerleri(r) for r in df.itertuples(index=False, name=None)]
    found = _baslik_satiri_bul(rows, ulke_map)
    if not found:
        return None
    _skor, header_idx, tip, mapping, ulke_sutunlari, headers = found
    data_rows = rows[header_idx + 1:]
    satirlar, hatalar = [], []

    if tip == 'tarife_matris':
        kalem_col = mapping.get('kalem', 0)
        for i, row in enumerate(data_rows, header_idx + 2):
            kalem_ad = str(row[kalem_col] if kalem_col < len(row) else '').strip()
            if not kalem_ad:
                continue
            kalem = _esles_kalem(kalem_ad, kalem_map)
            if not kalem:
                hatalar.append(f'{name} satır {i}: kalem bulunamadı ({kalem_ad})')
                continue
            for col_idx, ulke in ulke_sutunlari:
                if col_idx >= len(row):
                    continue
                fiyat, para, birim = _parse_price_cell(row[col_idx])
                if fiyat is None:
                    continue
                satirlar.append(_tarife_satir(
                    ulke, kalem, fiyat, para, birim or (row[mapping['birim']] if 'birim' in mapping and mapping['birim'] < len(row) else None),
                    varsayilan_baslangic, None, f'{name}:{i}',
                ))
        return {'tip': 'tarife', 'sheet': name, 'satirlar': satirlar, 'hatalar': hatalar}

    if tip == 'tarife_uzun':
        if 'kalem' not in mapping and 'kod' not in mapping:
            return None
        if 'fiyat' not in mapping:
            return None
        for i, row in enumerate(data_rows, header_idx + 2):
            def col(alan):
                idx = mapping.get(alan)
                return row[idx] if idx is not None and idx < len(row) else ''
            kalem_ad = col('kalem') or col('kod')
            if not str(kalem_ad).strip():
                continue
            kalem = _esles_kalem(kalem_ad, kalem_map) or _esles_kalem(col('kod'), kalem_map)
            ulke = _esles_ulke(col('ulke'), ulke_map)
            fiyat, para_hucre, birim_hucre = _parse_price_cell(col('fiyat'))
            if not kalem:
                hatalar.append(f'{name} satır {i}: kalem bulunamadı ({kalem_ad})')
                continue
            if not ulke:
                hatalar.append(f'{name} satır {i}: ülke bulunamadı ({col("ulke")})')
                continue
            if fiyat is None:
                hatalar.append(f'{name} satır {i}: fiyat okunamadı')
                continue
            para = str(col('para') or para_hucre or '').strip().upper() or None
            if para in ('€',):
                para = 'EUR'
            birim = _esles_birim(col('birim')) or birim_hucre
            baslangic = _parse_date(col('baslangic')) or varsayilan_baslangic
            notlar = str(col('notlar') or '').strip() or None
            satirlar.append(_tarife_satir(ulke, kalem, fiyat, para, birim, baslangic, notlar, f'{name}:{i}'))
        return {'tip': 'tarife', 'sheet': name, 'satirlar': satirlar, 'hatalar': hatalar}

    if tip == 'hareket':
        if 'tarih' not in mapping or 'miktar' not in mapping or 'kalem' not in mapping:
            return None
        for i, row in enumerate(data_rows, header_idx + 2):
            def col(alan):
                idx = mapping.get(alan)
                return row[idx] if idx is not None and idx < len(row) else ''
            kalem_ad = col('kalem')
            if not str(kalem_ad).strip():
                continue
            kalem = _esles_kalem(kalem_ad, kalem_map)
            tarih = _parse_date(col('tarih'))
            miktar = _parse_number(col('miktar'))
            ulke = _esles_ulke(col('ulke'), ulke_map) if 'ulke' in mapping else None
            if not tarih:
                hatalar.append(f'{name} satır {i}: geçersiz tarih')
                continue
            if not kalem:
                hatalar.append(f'{name} satır {i}: kalem bulunamadı ({kalem_ad})')
                continue
            if miktar is None or miktar < 0:
                hatalar.append(f'{name} satır {i}: geçersiz miktar')
                continue
            satirlar.append({
                'ulke': ulke,
                'kalem_id': kalem['id'],
                'kalem_ad': kalem['ad'],
                'kalem_kod': kalem['kod'],
                'tarih': tarih.isoformat(),
                'miktar': miktar,
                'kaynak': f'{name}:{i}',
            })
        return {'tip': 'hareket', 'sheet': name, 'satirlar': satirlar, 'hatalar': hatalar}

    if tip == 'fatura_uzun':
        if 'tutar' not in mapping or 'kalem' not in mapping:
            return None
        yil = varsayilan_baslangic.year
        for i, row in enumerate(data_rows, header_idx + 2):
            def col(alan):
                idx = mapping.get(alan)
                return row[idx] if idx is not None and idx < len(row) else ''
            kalem_ad = str(col('kalem') or '').strip()
            if not kalem_ad:
                continue
            tutar, para, _birim = _parse_price_cell(col('tutar'))
            if tutar is None:
                continue
            kalem = _esles_kalem(kalem_ad, kalem_map)
            ulke = _esles_ulke(col('ulke'), ulke_map)
            tarih = _parse_date(col('tarih'))
            donem = None
            ay_h = _ay_from_header(col('donem'), yil)
            if ay_h:
                donem = f'{ay_h[0]:04d}-{ay_h[1]:02d}'
            elif tarih:
                donem = tarih.strftime('%Y-%m')
            miktar = _parse_number(col('miktar')) or 1
            satirlar.append({
                'ulke': ulke,
                'kalem_id': kalem['id'] if kalem else None,
                'kalem_ad': kalem['ad'] if kalem else kalem_ad,
                'kalem_kod': kalem['kod'] if kalem else None,
                'tutar': round(float(tutar), 2),
                'para_birimi': para,
                'miktar': miktar,
                'birim_fiyat': round(float(tutar) / miktar, 4) if miktar else round(float(tutar), 4),
                'tarih': tarih.isoformat() if tarih else None,
                'donem': donem,
                'fatura_no': str(col('fatura_no') or '').strip() or None,
                'aciklama': str(col('aciklama') or kalem_ad).strip(),
                'kaynak': f'{name}:{i}',
            })
        return {'tip': 'fatura', 'sheet': name, 'satirlar': satirlar, 'hatalar': hatalar}

    return None


def _parse_ulke_ay_sheet(name, df, ulke_map, kalem_map, varsayilan_baslangic):
    """Ülke adlı sekmede kalem satırları × ay sütunları (LOGISTICS COSTS stili)."""
    ulke = _esles_ulke(name, ulke_map)
    if not ulke:
        return None
    rows = [_satir_degerleri(r) for r in df.itertuples(index=False, name=None)]
    yil = varsayilan_baslangic.year
    header_idx = None
    ay_sutunlari = []
    for i, raw in enumerate(rows[:12]):
        headers = ['' if v is None or (isinstance(v, float) and pd.isna(v)) else v for v in raw]
        found = []
        for idx, h in enumerate(headers):
            if idx == 0:
                continue
            ay = _ay_from_header(h, yil)
            if ay:
                found.append((idx, ay))
        if len(found) >= 2:
            header_idx, ay_sutunlari = i, found
            break
    if header_idx is None:
        return None
    satirlar, hatalar = [], []
    for i, row in enumerate(rows[header_idx + 1:], header_idx + 2):
        kalem_ad = str(row[0] if row else '').strip()
        if not kalem_ad:
            continue
        folded = _fold(kalem_ad)
        if folded in ('toplam', 'total', 'genel toplam', 'subtotal', 'sum'):
            continue
        kalem = _esles_kalem(kalem_ad, kalem_map)
        if not kalem:
            hatalar.append(f'{name} satır {i}: kalem eşleşmedi ({kalem_ad})')
        for col_idx, (yil_ay, ay) in ay_sutunlari:
            if col_idx >= len(row):
                continue
            tutar, para, _b = _parse_price_cell(row[col_idx])
            if tutar is None or tutar == 0:
                continue
            donem = f'{yil_ay:04d}-{ay:02d}'
            satirlar.append({
                'ulke': ulke,
                'kalem_id': kalem['id'] if kalem else None,
                'kalem_ad': kalem['ad'] if kalem else kalem_ad,
                'kalem_kod': kalem['kod'] if kalem else None,
                'tutar': round(float(tutar), 2),
                'para_birimi': para,
                'miktar': 1,
                'birim_fiyat': round(float(tutar), 4),
                'tarih': f'{donem}-01',
                'donem': donem,
                'fatura_no': None,
                'aciklama': kalem_ad,
                'kaynak': f'{name}:{i}:{donem}',
            })
    if not satirlar:
        return None
    return {'tip': 'fatura', 'sheet': name, 'satirlar': satirlar, 'hatalar': hatalar}


def _tarife_satir(ulke, kalem, fiyat, para, birim, baslangic, notlar, kaynak):
    para = (para or '').upper()
    if para not in GECERLI_PARA:
        para = None
    birim = birim if birim in (kalem.get('birim_secenekleri') or []) else None
    if not birim:
        secenek = kalem.get('birim_secenekleri') or ['palet']
        birim = secenek[0]
    if isinstance(baslangic, datetime.date):
        baslangic = baslangic.isoformat()
    return {
        'ulke': ulke,
        'kalem_id': kalem['id'],
        'kalem_ad': kalem['ad'],
        'kalem_kod': kalem['kod'],
        'birim': birim,
        'birim_fiyat': round(float(fiyat), 4),
        'para_birimi': para,
        'gecerli_baslangic': baslangic,
        'notlar': notlar,
        'kaynak': kaynak,
    }


def _excel_coz(data):
    ulkeler = kurumsal_ulkeler()
    ulke_map = _ulke_map(ulkeler)
    gecerli = gecerli_ulke_kodlari()
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute('''
            SELECT id, kod, ad, birim_secenekleri, tip
            FROM maliyet_kalemleri WHERE aktif ORDER BY sira, id
        ''')
        kalemler = [
            {'id': r[0], 'kod': r[1], 'ad': r[2], 'birim_secenekleri': list(r[3] or []), 'tip': r[4]}
            for r in cur.fetchall()
        ]
        if not any(k['kod'] == 'taxes' for k in kalemler):
            cur.execute('''
                INSERT INTO maliyet_kalemleri (kod, ad, birim_secenekleri, tip, sira)
                VALUES ('taxes', 'Taxes / Customs', '{islem}', 'hareket', 200)
                ON CONFLICT (kod) DO NOTHING
            ''')
            conn.commit()
            cur.execute('''
                SELECT id, kod, ad, birim_secenekleri, tip
                FROM maliyet_kalemleri WHERE aktif ORDER BY sira, id
            ''')
            kalemler = [
                {'id': r[0], 'kod': r[1], 'ad': r[2], 'birim_secenekleri': list(r[3] or []), 'tip': r[4]}
                for r in cur.fetchall()
            ]
    finally:
        cur.close()
        conn.close()
    kalem_map = _kalem_map(kalemler)
    varsayilan_baslangic = datetime.date(datetime.date.today().year, 1, 1)

    sheets = _sheetleri_oku(data)
    sonuclar = []
    for name, df in sheets.items():
        if df is None or df.empty:
            continue
        if _fold(name) in SKIP_SHEETS:
            continue
        parsed = parse_bosna_fatura_sheet(str(name), df, kalem_map)
        if not parsed or not parsed['satirlar']:
            parsed = _parse_sheet(str(name), df, ulke_map, kalem_map, varsayilan_baslangic)
        if not parsed or not parsed['satirlar']:
            parsed = _parse_ulke_ay_sheet(str(name), df, ulke_map, kalem_map, varsayilan_baslangic)
        if parsed and parsed['satirlar']:
            sonuclar.append(parsed)

    if not sonuclar:
        return None, 'Excel içinde fatura, tarife veya hareket tablosu bulunamadı. Ülke sekmelerini veya sütun başlıklarını kontrol edin.'

    # En çok geçerli satır üreten tipi seç; fatura varsa (LOGISTICS COSTS) onu tercih et.
    by_tip = {}
    for s in sonuclar:
        bag = by_tip.setdefault(s['tip'], {'satirlar': [], 'hatalar': [], 'sheetler': [], 'kaynak': None})
        bag['satirlar'].extend(s['satirlar'])
        bag['hatalar'].extend(s['hatalar'])
        bag['sheetler'].append(s['sheet'])
        if s.get('kaynak'):
            bag['kaynak'] = s['kaynak']
    if by_tip.get('fatura', {}).get('satirlar'):
        tip = 'fatura'
    else:
        tip = max(by_tip.keys(), key=lambda t: len(by_tip[t]['satirlar']))
    secim = by_tip[tip]

    para_by_ulke = {u['kod']: (u.get('currency') or 'EUR') for u in ulkeler if u['kod'] in gecerli}
    if tip in ('tarife', 'fatura'):
        for row in secim['satirlar']:
            if not row.get('para_birimi'):
                row['para_birimi'] = para_by_ulke.get(row.get('ulke'), 'EUR')
            if row.get('para_birimi') not in GECERLI_PARA:
                row['para_birimi'] = 'EUR'

    out = {
        'tip': tip,
        'sheetler': secim['sheetler'],
        'satirlar': secim['satirlar'],
        'hatalar': secim['hatalar'][:40],
        'ozet': _ozet(tip, secim['satirlar']),
        'kaynak': secim.get('kaynak'),
    }
    if secim.get('kaynak') == 'bosna':
        aktarim, rapor = bosna_excel_aktarim(secim['satirlar'])
        out['bosna_rapor'] = rapor
        out['bosna_aktarim'] = aktarim
    return out, None


def _ozet(tip, satirlar):
    ulkeler = sorted({r.get('ulke') for r in satirlar if r.get('ulke')})
    kalemler = sorted({r.get('kalem_ad') for r in satirlar if r.get('kalem_ad')})
    ozet = {'satir': len(satirlar), 'ulke': len(ulkeler), 'kalem': len(kalemler), 'ulkeler': ulkeler, 'kalemler': kalemler}
    if tip == 'hareket':
        ozet['ulke_eksik'] = sum(1 for r in satirlar if not r.get('ulke'))
    if tip == 'fatura':
        ozet['donem'] = len({r.get('donem') for r in satirlar if r.get('donem')})
        ozet['eslesmeyen'] = sum(1 for r in satirlar if not r.get('kalem_id'))
    return ozet


def maliyet_excel_onizle_post():
    """POST /api/maliyet/excel-onizle — dosyayı çözer, yazmaz."""
    data, ad, err = _dosya_oku()
    if err:
        return jsonify({'success': False, 'error': err}), 400
    if not data:
        return jsonify({'success': False, 'error': 'Dosya boş'}), 400
    if len(data) > MAX_BYTES:
        return jsonify({'success': False, 'error': 'Dosya 8 MB sınırını aşıyor'}), 400
    try:
        sonuc, parse_err = _excel_coz(data)
    except ValueError as exc:
        return jsonify({'success': False, 'error': str(exc)}), 400
    if parse_err:
        return jsonify({'success': False, 'error': parse_err}), 400
    payload = {
        'success': True,
        'dosya_adi': ad,
        'tip': sonuc['tip'],
        'sheetler': sonuc['sheetler'],
        'ozet': sonuc['ozet'],
        'hatalar': sonuc['hatalar'],
        'satirlar': sonuc['satirlar'],
        'satir_sayisi': len(sonuc['satirlar']),
        'kaynak': sonuc.get('kaynak'),
        'excel': base64.b64encode(data).decode('ascii'),
    }
    if sonuc.get('bosna_rapor'):
        payload['bosna_rapor'] = sonuc['bosna_rapor']
    if sonuc.get('bosna_aktarim'):
        payload['bosna_aktarim'] = sonuc['bosna_aktarim']
    return jsonify(payload)


def _tarife_yaz(cur, satirlar):
    yazilan = 0
    for row in satirlar:
        cur.execute('''
            INSERT INTO maliyet_tarifeleri
                (ulke, kalem_id, birim, birim_fiyat, para_birimi, gecerli_baslangic, notlar)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (ulke, kalem_id, gecerli_baslangic) DO UPDATE SET
                birim = EXCLUDED.birim,
                birim_fiyat = EXCLUDED.birim_fiyat,
                para_birimi = EXCLUDED.para_birimi,
                notlar = COALESCE(EXCLUDED.notlar, maliyet_tarifeleri.notlar)
        ''', (row['ulke'], row['kalem_id'], row['birim'], row['birim_fiyat'],
              row['para_birimi'], row['gecerli_baslangic'], row.get('notlar')))
        yazilan += 1
    return yazilan


def _hareket_yaz(cur, satirlar, varsayilan_ulke):
    gecerli = gecerli_ulke_kodlari()
    cur.execute("SELECT id FROM maliyet_kalemleri WHERE aktif AND tip = 'hareket'")
    hareket_ids = {r[0] for r in cur.fetchall()}
    yazilan = 0
    hatalar = []
    for i, row in enumerate(satirlar, 1):
        ulke = (row.get('ulke') or varsayilan_ulke or '').strip().lower()
        if ulke not in gecerli:
            hatalar.append(f'satır {i}: ülke gerekli')
            continue
        kalem_id = int(row['kalem_id'])
        if kalem_id not in hareket_ids:
            hatalar.append(f'satır {i}: {row.get("kalem_ad") or kalem_id} hareket kalemi değil (storage/sabit atlandı)')
            continue
        tarih = _parse_date(row.get('tarih'))
        miktar = _parse_number(row.get('miktar'))
        if not tarih or miktar is None or miktar < 0:
            hatalar.append(f'satır {i}: tarih/miktar geçersiz')
            continue
        _upsert_hareket(cur, tarih, ulke, kalem_id, miktar)
        yazilan += 1
    return yazilan, hatalar


def maliyet_excel_aktar_post():
    """POST /api/maliyet/excel-aktar — önizlenen dosyayı tarifeye veya harekete yazar.
    Gövde: {excel: base64} veya multipart dosya. isteğe bağlı ulke (hareket için)."""
    data, ad, err = _dosya_oku()
    if err:
        return jsonify({'success': False, 'error': err}), 400
    if not data or len(data) > MAX_BYTES:
        return jsonify({'success': False, 'error': 'Geçerli bir Excel yükleyin'}), 400

    body = request.get_json(silent=True) or {}
    varsayilan_ulke = str(request.form.get('ulke') or body.get('ulke') or '').strip().lower() or None

    try:
        sonuc, parse_err = _excel_coz(data)
    except ValueError as exc:
        return jsonify({'success': False, 'error': str(exc)}), 400
    if parse_err:
        return jsonify({'success': False, 'error': parse_err}), 400
    if sonuc['tip'] == 'fatura':
        return jsonify({
            'success': False,
            'tip': 'fatura',
            'error': 'Bu dosya fatura kırılımı. Maliyet Takip 2 giriş ekranından kaydedin.',
            'ozet': sonuc['ozet'],
        }), 400

    conn = get_conn()
    cur = conn.cursor()
    try:
        if sonuc['tip'] == 'tarife':
            yazilan = _tarife_yaz(cur, sonuc['satirlar'])
            hatalar = sonuc['hatalar']
        else:
            yazilan, extra = _hareket_yaz(cur, sonuc['satirlar'], varsayilan_ulke)
            hatalar = sonuc['hatalar'] + extra
        if not yazilan:
            conn.rollback()
            return jsonify({
                'success': False,
                'error': 'Hiçbir satır aktarılamadı',
                'hatalar': hatalar[:30],
                'tip': sonuc['tip'],
            }), 400
        conn.commit()
        log_action(getattr(g, 'user', None), 'maliyet_excel',
                   f'Excel aktardı: {ad} / {sonuc["tip"]} ({yazilan} satır)')
        return jsonify({
            'success': True,
            'tip': sonuc['tip'],
            'yazilan': yazilan,
            'hatalar': hatalar[:30],
            'ozet': sonuc['ozet'],
            'dosya_adi': ad,
        })
    finally:
        cur.close()
        conn.close()

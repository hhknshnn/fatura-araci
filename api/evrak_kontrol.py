"""
Gümrük evrak kontrolü: ihracat beyannamesi, EUR.1 / menşe şahadetnamesi PDF'lerini
sistemdeki fatura (INV/PL) ile karşılaştırır. Yalnızca motor fonksiyonları barındırır;
HTTP route `app.py` içindedir. Hiçbir şey yazmaz.
"""
import io
import json
import os
import re

import openpyxl
from pypdf import PdfReader

from api.db import get_conn

# Ek evrak PDF'lerinin metin sırası (pypdf, içerik akışı sırası) form kutu sırasını izler.

ULKE_TR = {
    'ba': ['BOSNA HERSEK'], 'rs': ['SIRBISTAN'], 'xk': ['KOSOVA'],
    'mk': ['KUZEY MAKEDONYA', 'MAKEDONYA'], 'be': ['BELCIKA'], 'de': ['ALMANYA'],
    'nl': ['HOLLANDA'], 'ge': ['GURCISTAN'], 'kz': ['KAZAKISTAN'], 'iq': ['IRAK'],
    'ly': ['LIBYA'], 'lr': ['LIBERYA'], 'lb': ['LUBNAN'], 'uz': ['OZBEKISTAN'],
    'abh': ['ABHAZYA'], 'jo': ['URDUN'], 'mu': ['MORITIUS', 'MAURITIUS'],
    'ru': ['RUSYA', 'RUSYA FEDERASYONU'], 'cy': ['KIBRIS', 'KKTC'],
}
_CONFIG_YOLU = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'config', 'evrak_kontrol.json')


def _ulke_etiketleri():
    try:
        with open(os.path.join(os.path.dirname(_CONFIG_YOLU), 'countries.json'), encoding='utf-8') as f:
            return {k: v.get('label', '') for k, v in json.load(f).items()}
    except (OSError, ValueError):
        return {}


_ULKE_ETIKET = _ulke_etiketleri()


def _mense_ayrimi(ulke):
    """config/evrak_kontrol.json: True = ayrım yapılır, False = yapılmaz, None = bilinmiyor."""
    try:
        with open(_CONFIG_YOLU, encoding='utf-8') as f:
            return (json.load(f).get('mense_ayrimi') or {}).get(str(ulke or '').lower())
    except (OSError, ValueError):
        return None


_PARA = {'TL': 'TRY', 'TRY': 'TRY', 'EUR': 'EUR', 'USD': 'USD'}
_INCOTERMS = ('CIP', 'CIF', 'CFR', 'CPT', 'DAP', 'DDP', 'DAT', 'EXW', 'FCA', 'FOB', 'FAS')

_TR_MAP = str.maketrans('İıŞşĞğÜüÖöÇç', 'IiSsGgUuOoCc')


def _ascii_up(s):
    return str(s or '').translate(_TR_MAP).upper()


def _compact(s):
    return re.sub(r'[^A-Z0-9]', '', _ascii_up(s))


def _sayi(s):
    """'1.309.629,12' / '5770,00' / '5701,05' → float. Bulunamazsa None."""
    s = str(s or '').strip()
    if not s:
        return None
    if ',' in s:
        s = s.replace('.', '').replace(',', '.')
    try:
        return float(s)
    except ValueError:
        return None


def _pdf_sayfalar(pdf_bytes):
    reader = PdfReader(io.BytesIO(pdf_bytes))
    return [(p.extract_text() or '') for p in reader.pages]


# ── REFERANS (fatura INV/PL Excel) ───────────────────────────────────────────

def _satir_degeri(ws, row, col):
    """Etiket hücresinin sağındaki ilk dolu hücre."""
    for c in range(col + 1, ws.max_column + 1):
        v = ws.cell(row, c).value
        if v not in (None, ''):
            return v
    return None


def referans_oku(excel_path_or_bytes):
    """INV/PL Excel'inden karşılaştırma referansını çıkarır."""
    if isinstance(excel_path_or_bytes, (bytes, bytearray)):
        wb = openpyxl.load_workbook(io.BytesIO(excel_path_or_bytes), data_only=True)
    else:
        wb = openpyxl.load_workbook(excel_path_or_bytes, data_only=True)
    if 'INV' not in wb.sheetnames or 'PL' not in wb.sheetnames:
        raise ValueError('Excel içinde INV ve PL sayfaları bulunamadı')
    inv, pl = wb['INV'], wb['PL']
    ref = {'fatura_no': '', 'tarih': '', 'gonderici': '', 'alici': '', 'kap': None,
           'incoterm': '', 'para_birimi': '', 'toplam_tutar': 0.0,
           'brut_toplam': 0.0, 'net_toplam': 0.0,
           'brut_tr': 0.0, 'net_tr': 0.0, 'brut_yabanci': 0.0, 'net_yabanci': 0.0}

    hdr_row = None
    for r in range(1, min(inv.max_row, 40) + 1):
        for c in range(1, inv.max_column + 1):
            v = inv.cell(r, c).value
            if not isinstance(v, str):
                continue
            t = v.strip().upper()
            if t.startswith('EXPORTER'):
                ref['gonderici'] = str(inv.cell(r + 1, c).value or '').split('\n')[0].strip()
            elif t.startswith('IMPORTER'):
                ref['alici'] = str(inv.cell(r + 1, c).value or '').split('\n')[0].strip()
            elif t.startswith('INVOICE NO'):
                ref['fatura_no'] = str(_satir_degeri(inv, r, c) or '').strip()
            elif t.startswith('INVOICE DATE'):
                d = _satir_degeri(inv, r, c)
                ref['tarih'] = d.strftime('%Y-%m-%d') if hasattr(d, 'strftime') else str(d or '')[:10]
            elif t.startswith('PACKAGES'):
                m = re.match(r'\s*(\d+)', str(_satir_degeri(inv, r, c) or ''))
                if m:
                    ref['kap'] = int(m.group(1))
                ref['kap_aciklama'] = str(_satir_degeri(inv, r, c) or '').strip()
            elif t.startswith('INCOTERM'):
                ref['incoterm'] = str(_satir_degeri(inv, r, c) or '').strip().upper()
            elif t.startswith('TOTAL AMOUNT') and hdr_row is None:
                hdr_row = r
                ref['para_birimi'] = _PARA.get(t.split()[-1], t.split()[-1])

    # Satırlar: menşe (col A) + tutar (INV 'TOTAL AMOUNT' kolonu)
    tutar_col = None
    if hdr_row:
        for c in range(1, inv.max_column + 1):
            v = inv.cell(hdr_row, c).value
            if isinstance(v, str) and v.strip().upper().startswith('TOTAL AMOUNT'):
                tutar_col = c
                break
    toplam = 0.0
    if hdr_row and tutar_col:
        for r in range(hdr_row + 1, inv.max_row + 1):
            a = inv.cell(r, 1).value
            if a is None or str(a).strip().upper() == 'TOTAL':
                continue
            v = inv.cell(r, tutar_col).value
            if isinstance(v, (int, float)):
                toplam += float(v)
    ref['toplam_tutar'] = round(toplam, 2)

    pl_hdr = None
    for r in range(1, min(pl.max_row, 40) + 1):
        vals = [str(pl.cell(r, c).value or '').strip().upper() for c in range(1, pl.max_column + 1)]
        if 'GROSS WEIGHT' in vals and 'NET WEIGHT' in vals:
            pl_hdr, gcol, ncol = r, vals.index('GROSS WEIGHT') + 1, vals.index('NET WEIGHT') + 1
            break
    if pl_hdr:
        for r in range(pl_hdr + 1, pl.max_row + 1):
            a = pl.cell(r, 1).value
            if a is None or str(a).strip().upper().startswith('TOTAL'):
                continue
            g = pl.cell(r, gcol).value
            n = pl.cell(r, ncol).value
            g = float(g) if isinstance(g, (int, float)) else 0.0
            n = float(n) if isinstance(n, (int, float)) else 0.0
            ref['brut_toplam'] += g
            ref['net_toplam'] += n
            if _compact(a) in ('TURKIYE', 'TURKEY'):
                ref['brut_tr'] += g
                ref['net_tr'] += n
            else:
                ref['brut_yabanci'] += g
                ref['net_yabanci'] += n
    for k in ('brut_toplam', 'net_toplam', 'brut_tr', 'net_tr', 'brut_yabanci', 'net_yabanci'):
        ref[k] = round(ref[k], 2)
    return ref


def referans_bul(fatura_no, ulke=None):
    """storage_records'tan fatura no'ya ait en yeni INV/PL Excel'ini bulur → (ulke, excel_path) ya da (None, None).
    Aynı fatura no birden fazla ülkede kayıtlı olabilir; ulke verilirse o ülkenin kaydı tercih edilir."""
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute('SELECT ulke, file_paths FROM storage_records WHERE fatura_no = %s ORDER BY tarih DESC', (fatura_no,))
        satirlar = cur.fetchall()
    finally:
        cur.close()
        conn.close()
    adaylar = []
    for u, fp in satirlar:
        if isinstance(fp, str):
            try:
                fp = json.loads(fp)
            except Exception:
                fp = {}
        yol = (fp or {}).get('excel') or ''
        if yol and os.path.exists(yol):
            adaylar.append((u, yol))
    if ulke:
        for u, yol in adaylar:
            if str(u).lower() == str(ulke).lower():
                return u, yol
    return adaylar[0] if adaylar else (None, None)


def fatura_dip_toplami(fatura_no, ulke=None):
    """e-Fatura PDF'inin dip toplamı (navlun/sigorta dahil, 'Ödenecek Tutar') → (tutar, kaynak) ya da (None, '').
    INV Excel'indeki kalem toplamı navlun/sigortayı içermeyebilir; beyanname tutarı dip toplamla eşleşmelidir."""
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute('SELECT ulke, file_paths FROM storage_records WHERE fatura_no = %s ORDER BY tarih DESC', (fatura_no,))
        satirlar = cur.fetchall()
        sev_tutar = None
        cur.execute('SELECT ulke, fatura_bedeli_tl FROM shipments WHERE fatura_no = %s ORDER BY id DESC', (fatura_no,))
        sev = cur.fetchall()
    finally:
        cur.close()
        conn.close()
    sirali = sorted(satirlar, key=lambda r: 0 if ulke and str(r[0]).lower() == str(ulke).lower() else 1)
    for u, fp in sirali:
        if isinstance(fp, str):
            try:
                fp = json.loads(fp)
            except Exception:
                fp = {}
        yol = (fp or {}).get('pdf') or ''
        if yol and os.path.exists(yol):
            try:
                from api.invoice.helpers import parse_pdf
                with open(yol, 'rb') as f:
                    tl = float(parse_pdf(f.read()).get('fatura_tl') or 0)
                if tl > 0:
                    return tl, 'e-fatura PDF dip toplamı'
            except Exception:
                pass
            break
    etiket = _ULKE_ETIKET.get(str(ulke or '').lower())
    for u, tl in sev:
        if tl and float(tl) > 0 and (not etiket or _ascii_up(u) == _ascii_up(etiket)):
            return float(tl), 'sevkiyat kaydı fatura bedeli'
    return None, ''


def _inv_pl_anahtarlari(fatura_no, ulke=None):
    """Fatura no'ya ait inv_pl storage kayıt anahtarları; ulke verilirse yalnız o ülkeninkiler
    (aynı fatura no birden fazla ülkede kayıtlı olabilir)."""
    conn = get_conn()
    cur = conn.cursor()
    try:
        if ulke:
            cur.execute("SELECT key FROM storage_records WHERE fatura_no = %s AND dosya_turu = 'inv_pl' AND lower(ulke) = lower(%s)",
                        (fatura_no, ulke))
        else:
            cur.execute("SELECT key FROM storage_records WHERE fatura_no = %s AND dosya_turu = 'inv_pl'", (fatura_no,))
        return [r[0] for r in cur.fetchall()]
    finally:
        cur.close()
        conn.close()


def fatura_kayit_sayisi(fatura_no, ulke=None):
    """Silinebilecek (inv_pl) storage kaydı sayısı."""
    return len(_inv_pl_anahtarlari(fatura_no, ulke))


def fatura_temizle(fatura_no, ulke=None):
    """Kullanıcı onayladığında faturanın INV/PL storage kayıtlarını (dosyalarıyla) siler → silinen kayıt sayısı.
    Yalnızca dosya_turu='inv_pl'; shipment_report vb. kayıtlara dokunmaz. ulke verilirse yalnız o ülkenin kaydı."""
    from api.storage import cleanup_record
    keys = _inv_pl_anahtarlari(fatura_no, ulke)
    for k in keys:
        cleanup_record(k)
    return len(keys)


def sevkiyat_bul(fatura_no, ulke=None):
    """shipments kaydından dosya no (ve navlun/sigorta, kur) bilgisi. Aynı fatura no birden fazla ülkede
    olabileceği için ulke (kod) verilirse o ülkenin kaydı seçilir."""
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute('''SELECT ulke, ihracat_dosya_no, palet, navlun_eur, sigorta_eur, eur_kuru,
                              navlun_usd, sigorta_usd, usd_kuru
                       FROM shipments WHERE fatura_no = %s ORDER BY id DESC''', (fatura_no,))
        satirlar = cur.fetchall()
    finally:
        cur.close()
        conn.close()
    if not satirlar:
        return None
    if ulke:
        etiket = _ULKE_ETIKET.get(str(ulke).lower())
        if etiket:
            eslesen = [r for r in satirlar if _ascii_up(r[0]) == _ascii_up(etiket)]
            if eslesen:
                satirlar = eslesen
    r = satirlar[0]
    f = lambda v: float(v or 0)
    return {'dosya_no': r[1], 'palet': r[2], 'navlun_eur': f(r[3]), 'sigorta_eur': f(r[4]), 'eur_kuru': f(r[5]),
            'navlun_usd': f(r[6]), 'sigorta_usd': f(r[7]), 'usd_kuru': f(r[8])}


# ── BELGE PARSER'LARI ────────────────────────────────────────────────────────

def belge_turu_tahmin(ad, sayfalar):
    """Dosya adı + içerikten tür: 'beyanname' | 'eur1' | 'mense'."""
    a = _ascii_up(ad)
    metin = _ascii_up('\n'.join(sayfalar))
    if 'BEYANNAME' in a or 'TOPLAM FOB' in metin or 'GUMRUK BEYANNAMESI' in metin:
        return 'beyanname'
    if 'EUR' in a and '1' in a:
        return 'eur1'
    if 'MENSE' in a or 'SAHADET' in a or 'ORIGIN' in a:
        return 'mense'
    # İçerik: EUR.1'de çıkış gümrüğü + vize tarihi satırları bulunur, şahadetnamede yoktur
    return 'eur1' if 'GUMRUK MUDURLUGU' in metin else 'mense'


_FATURA_NO_RE = re.compile(r'\b(IHR|ANT)((?:\s*\d){13})(?!\d)')


def _fatura_no_bul(metin):
    """IHR/ANT + tam 13 rakam. Satır sonunda bölünmüş numaraları (IHR20260000⏎00353) birleştirir.
    Önce 'E FATURA SAYI VE TARİHİ' ifadesinden sonrasına bakar (beyannamede fatura no her zaman orada)."""
    metin = str(metin or '')
    i = _ascii_up(metin).find('FATURA SAYI')
    for parca in ((metin[i:i + 200], metin) if i >= 0 else (metin,)):
        m = _FATURA_NO_RE.search(parca)
        if m:
            return m.group(1) + re.sub(r'\s+', '', m.group(2))
    return ''


def parse_eur1_mense(sayfalar):
    """EUR.1 ve menşe şahadetnamesi aynı düzende: ihracatçı, belge no, alıcı, ADDR kap, KGR, fatura no."""
    satirlar = [s.strip() for s in '\n'.join(sayfalar).splitlines() if s.strip()]
    out = {'belge_no': '', 'gonderici': '', 'alici': '', 'kap': None, 'kg': None,
           'fatura_no': '', 'fatura_tarih': '', 'brut_kg': None, 'net_kg': None}
    vkn_idx = next((i for i, s in enumerate(satirlar) if re.fullmatch(r'\d{10,11}', s)), None)
    no_idx = next((i for i, s in enumerate(satirlar) if re.fullmatch(r'[A-Z]\d{7}', s)), None)
    if vkn_idx is not None:
        out['gonderici'] = ' '.join(satirlar[:vkn_idx])
    if no_idx is not None:
        out['belge_no'] = satirlar[no_idx]
        if no_idx + 1 < len(satirlar):
            out['alici'] = satirlar[no_idx + 1]
    metin = '\n'.join(satirlar)
    m = re.search(r'ADDR\s*:\s*(\d+)\s*UNIT', metin, re.I)
    if m:
        out['kap'] = int(m.group(1))
    m = re.search(r'\bB\.?\s*KG\s*:\s*([\d.]+(?:,\d+)?)', metin, re.I)
    if m:
        out['brut_kg'] = _sayi(m.group(1))
    m = re.search(r'\bN\.?\s*KG\s*:\s*([\d.]+(?:,\d+)?)', metin, re.I)
    if m:
        out['net_kg'] = _sayi(m.group(1))
    m = re.search(r'([\d.]+(?:,\d+)?)\s*KGR', metin, re.I)
    if m:
        out['kg'] = _sayi(m.group(1))
    m = re.search(r'INVOICE\s*NO\s*:\s*([A-Z0-9]+)\s+DATE\s*:\s*(\d{1,2})\s*-\s*(\d{1,2})\s*-\s*(\d{4})', metin, re.I)
    if m:
        out['fatura_no'] = _fatura_no_bul(m.group(1)) or m.group(1)
        out['fatura_tarih'] = f'{m.group(4)}-{int(m.group(3)):02d}-{int(m.group(2)):02d}'
    else:
        out['fatura_no'] = _fatura_no_bul(metin)
    return out


def parse_beyanname(sayfalar):
    """İhracat beyannamesi: kap, varış ülkesi, teslim şekli, para birimi, toplam tutar, brüt/net kg."""
    s1 = sayfalar[0] if sayfalar else ''
    tum = '\n'.join(sayfalar)
    out = {'kap': None, 'varis_ulkesi': [], 'teslim_sekli': '', 'para_birimi': '', 'kur': None,
           'toplam_tutar': None, 'ek_liste_tutar': None, 'fob': None,
           'brut': None, 'net': None, 'ust_brut': None, 'ust_net': None, 'fatura_no': ''}
    m = re.search(r'(\d+)\s+KAP\s+\d+\s+AD', s1)
    if m:
        out['kap'] = int(m.group(1))
    m = re.search(r'Toplam FOB\s*:\s*([\d.,]+)', tum)
    if m:
        out['fob'] = _sayi(m.group(1))
    m = re.search(r'Toplam Net\s*/\s*Brüt Kg\s*:\s*([\d.,]+)\s*/\s*([\d.,]+)', tum)
    if m:
        out['ust_net'], out['ust_brut'] = _sayi(m.group(1)), _sayi(m.group(2))
    # Ek liste alt toplamı: "Toplam: <miktar> [AD] <brüt> <net> <tutar>"
    ms = re.findall(r'Toplam:\s*([\d.,]+)\s*(?:AD\s*)?([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)', tum)
    if ms:
        _, brut, net, tutar = ms[-1]
        out['brut'], out['net'], out['ek_liste_tutar'] = _sayi(brut), _sayi(net), _sayi(tutar)
    m = re.search(r'\b(TL|TRY|USD|EUR)\s+(\d+,\d{5})\b', s1)
    if m:
        out['para_birimi'] = _PARA.get(m.group(1), m.group(1))
        out['kur'] = _sayi(m.group(2))
    tutarlar = [_sayi(x) for x in re.findall(r'\b\d{1,3}(?:\.\d{3})+,\d{2}\b', s1)]
    tutarlar = [t for t in tutarlar if t is not None]
    if tutarlar:
        out['toplam_tutar'] = max(tutarlar)   # kutu 22: kalem tutarlarından büyük, FOB biçimsiz yazılır
    s1_inc = re.sub(r'Toplam FOB', '', s1)
    m = re.search(r'\b(' + '|'.join(_INCOTERMS) + r')\b', s1_inc)
    if m:
        out['teslim_sekli'] = m.group(1)
    norm = _ascii_up(s1).replace('-', ' ')
    for kod, adlar in ULKE_TR.items():
        for a in adlar:
            if a in norm:
                out['varis_ulkesi'].append(a)
    out['varis_ulkesi'] = sorted(set(out['varis_ulkesi']))
    out['fatura_no'] = _fatura_no_bul(tum)
    return out


# ── KARŞILAŞTIRMA ────────────────────────────────────────────────────────────

def _k(alan, beklenen, bulunan, durum, not_=''):
    return {'alan': alan, 'beklenen': beklenen, 'bulunan': bulunan, 'durum': durum, 'not': not_}


def _esit_metin(alan, beklenen, bulunan, onek=False):
    if not bulunan:
        return _k(alan, beklenen, '—', 'hata', 'Belgede okunamadı')
    b, f = _compact(beklenen), _compact(bulunan)
    ok = f.startswith(b) if onek else f == b
    return _k(alan, beklenen, bulunan, 'ok' if ok else 'hata')


def _esit_sayi(alan, beklenen, bulunan, tol=0.01, tol_uyari=None, birim=''):
    if bulunan is None:
        return _k(alan, beklenen, '—', 'hata', 'Belgede okunamadı')
    if beklenen is None:
        return _k(alan, '—', bulunan, 'yok', 'Faturada referans yok')
    fark = abs(float(beklenen) - float(bulunan))
    if fark <= tol:
        d, n = 'ok', ''
    elif tol_uyari is not None and fark <= tol_uyari:
        d, n = 'uyari', f'{fark:.2f}{birim} fark (yuvarlama olabilir)'
    else:
        d, n = 'hata', f'{fark:.2f}{birim} fark'
    return _k(alan, beklenen, bulunan, d, n)


_TABAN_ADI = {'toplam': 'tüm kalemlerin toplamı', 'tr': 'Türkiye menşeli kalemlerin toplamı',
              'yabanci': 'Türkiye dışı menşeli kalemlerin toplamı'}


def _kg_taban(ref, kg, tur, ayrim):
    """Belgede beklenen fatura tabanı → (taban, brüt, net).
    ayrim=True : EUR.1 → Türkiye menşeli, menşe → yabancı menşeli.
    ayrim=False: ikisi de toplam.
    ayrim=None : ülke bilinmiyor; belgedeki kg'a en yakın taban seçilir."""
    toplam = ('toplam', ref['brut_toplam'], ref['net_toplam'])
    tr = ('tr', ref['brut_tr'], ref['net_tr'])
    yabanci = ('yabanci', ref['brut_yabanci'], ref['net_yabanci'])
    if ayrim is True:
        return tr if tur == 'eur1' else yabanci
    if ayrim is False:
        return toplam
    adaylar = [t for t in (toplam, tr, yabanci) if t[1] > 0]
    if kg is None or not adaylar:
        return toplam
    return min(adaylar, key=lambda t: abs(t[1] - kg))


def karsilastir_eur1_mense(tur, p, ref, ayrim=None):
    ks = [
        _esit_metin('Gönderici', ref['gonderici'], p['gonderici'], onek=True),
        _esit_metin('Alıcı', ref['alici'], p['alici']),
        _esit_sayi('Kap (ADDR … UNIT)', ref['kap'], p['kap'], tol=0),
    ]
    kg = p['brut_kg'] if p.get('brut_kg') is not None else p['kg']
    taban, brut_ref, net_ref = _kg_taban(ref, kg, tur, ayrim)
    brut = _esit_sayi('Brüt kg', brut_ref, kg, tol=0.05, tol_uyari=0.5, birim=' kg')
    brut['not'] = (brut['not'] + ' — ' if brut['not'] else '') + _TABAN_ADI[taban] + \
        ('' if ayrim is None else (' (menşe ayrımı yapılan ülke)' if ayrim else ' (menşe ayrımı yapılmayan ülke)'))
    ks.append(brut)
    if p.get('net_kg') is not None:
        net = _esit_sayi('Net kg', net_ref, p['net_kg'], tol=0.05, tol_uyari=0.5, birim=' kg')
        net['not'] = (net['not'] + ' — ' if net['not'] else '') + _TABAN_ADI[taban]
        ks.append(net)
    if p['fatura_no']:
        ks.append(_esit_metin('Fatura no', ref['fatura_no'], p['fatura_no']))
        if p['fatura_tarih'] and ref['tarih']:
            ks.append(_k('Fatura tarihi', ref['tarih'], p['fatura_tarih'],
                         'ok' if ref['tarih'] == p['fatura_tarih'] else 'hata'))
    else:
        ks.append(_k('Fatura no', ref['fatura_no'], '—', 'yok', 'Belgede fatura no yok'))
    return ks


def karsilastir_beyanname(p, ref, ulke):
    ks = [_esit_sayi('Kap sayısı', ref['kap'], p['kap'], tol=0)]
    beklenen_ulke = ULKE_TR.get(str(ulke or '').lower())
    if beklenen_ulke:
        bulundu = [a for a in p['varis_ulkesi'] if a in beklenen_ulke]
        ks.append(_k('Varış ülkesi', ' / '.join(beklenen_ulke), ', '.join(p['varis_ulkesi']) or '—',
                     'ok' if bulundu else 'hata'))
    else:
        ks.append(_k('Varış ülkesi', '—', ', '.join(p['varis_ulkesi']) or '—', 'yok', 'Ülke tanımı yok'))
    ks.append(_esit_metin('Teslim şekli', ref['incoterm'], p['teslim_sekli']))
    ks.append(_esit_metin('Para birimi', ref['para_birimi'], p['para_birimi']))
    tutar = _esit_sayi('Toplam tutar (kutu 22)', ref['toplam_tutar'], p['toplam_tutar'], tol=0.01)
    if ref.get('toplam_kaynak') and ref['toplam_kaynak'] != 'INV kalem toplamı':
        tutar['not'] = (tutar['not'] + ' — ' if tutar['not'] else '') + ref['toplam_kaynak']
    ks.append(tutar)
    if p['ek_liste_tutar'] is not None:
        ks.append(_esit_sayi('Toplam tutar (ek liste)', ref['toplam_tutar'], p['ek_liste_tutar'], tol=0.01))
    ks.append(_esit_sayi('Toplam brüt kg (alt toplam)', ref['brut_toplam'], p['brut'], tol=0.05, tol_uyari=0.5, birim=' kg'))
    ks.append(_esit_sayi('Toplam net kg (alt toplam)', ref['net_toplam'], p['net'], tol=0.05, tol_uyari=0.5, birim=' kg'))
    if p['fatura_no']:
        ks.append(_esit_metin('Fatura no', ref['fatura_no'], p['fatura_no']))
    return ks


def kontrol_et(belgeler, fatura_no_ipucu=''):
    """belgeler: [(ad, bytes)] — PDF'ler ve (isteğe bağlı) referans INV/PL .xlsx.
    Beyanname + menşe zorunlu, EUR.1 isteğe bağlı (ülkeden ülkeye değişir). Tüm yüklenen belgeler sorunsuzsa
    (hata ve uyarı yok) 'tamamlandi' True olur. Kontrol hiçbir şey silmez; silme kullanıcı onayıyla fatura_temizle'dir.
    Dönüş: {'faturaNo','ulke','referans','belgeler':[{ad,tur,kontroller,ozet}]}"""
    pdfler, ref_excel = [], None
    for ad, data in belgeler:
        if ad.lower().endswith('.xlsx'):
            ref_excel = data
        else:
            pdfler.append((ad, data, _pdf_sayfalar(data)))
    if not pdfler:
        raise ValueError('PDF belgesi yok')

    cozulen = []
    for ad, data, sayfalar in pdfler:
        tur = belge_turu_tahmin(ad, sayfalar)
        p = parse_beyanname(sayfalar) if tur == 'beyanname' else parse_eur1_mense(sayfalar)
        cozulen.append((ad, tur, p))

    fatura_nolar = {p['fatura_no'] for _, _, p in cozulen if p['fatura_no']}
    fatura_no = fatura_no_ipucu or (sorted(fatura_nolar)[0] if fatura_nolar else '')
    uyarilar = []
    if len(fatura_nolar) > 1:
        uyarilar.append('Belgelerde farklı fatura numaraları var: ' + ', '.join(sorted(fatura_nolar)))

    # Aynı fatura no birden fazla ülkede kayıtlı olabilir: ülkeyi beyannamedeki varış ülkesinden türet
    ulke = None
    for _ad, tur, p in cozulen:
        if tur == 'beyanname':
            ulke = next((k for k, adlar in ULKE_TR.items() if set(adlar) & set(p['varis_ulkesi'])), None)
    if ref_excel:
        ref = referans_oku(ref_excel)
        fatura_no = fatura_no or ref['fatura_no']
    else:
        if not fatura_no:
            raise ValueError('Belgelerde fatura no bulunamadı; INV/PL Excel\'ini de ekleyin')
        ulke_kayit, yol = referans_bul(fatura_no, ulke)
        if not yol:
            raise ValueError(f'{fatura_no} için kayıtlı INV/PL bulunamadı (kontrolü daha önce tamamlanıp silinmiş ya da hiç üretilmemiş olabilir). '
                             'INV/PL .xlsx dosyasını da yükleyin.')
        ulke = ulke_kayit or ulke
        ref = referans_oku(yol)
    if ref['fatura_no'] and fatura_no and _compact(ref['fatura_no']) != _compact(fatura_no):
        uyarilar.append(f"Referans fatura no ({ref['fatura_no']}) ile belge fatura no ({fatura_no}) farklı")

    sev = sevkiyat_bul(fatura_no, ulke) if fatura_no else None
    ref['toplam_inv_kalem'] = ref['toplam_tutar']
    ref['toplam_kaynak'] = 'INV kalem toplamı'
    if fatura_no and ref['para_birimi'] == 'TRY':   # dip toplam TL; USD/EUR faturalarda INV toplamı esas
        dip, kaynak = fatura_dip_toplami(fatura_no, ulke)
        if dip:
            ref['toplam_tutar'], ref['toplam_kaynak'] = round(dip, 2), kaynak
    sonuc = []
    for ad, tur, p in cozulen:
        ks = karsilastir_beyanname(p, ref, ulke) if tur == 'beyanname' else karsilastir_eur1_mense(tur, p, ref, _mense_ayrimi(ulke))
        ozet = {'ok': 0, 'uyari': 0, 'hata': 0, 'yok': 0}
        for k in ks:
            ozet[k['durum']] += 1
        sonuc.append({'ad': ad, 'tur': tur, 'kontroller': ks, 'ozet': ozet})
    turler = {b['tur'] for b in sonuc}
    eksik = [ad for t, ad in (('beyanname', 'İhracat beyannamesi'), ('mense', 'Menşe şahadetnamesi')) if t not in turler]
    sorunsuz = all(b['ozet']['hata'] == 0 and b['ozet']['uyari'] == 0 for b in sonuc)
    tamam = bool(not eksik and sorunsuz and not uyarilar)
    kayit_var = fatura_kayit_sayisi(fatura_no, ulke) if fatura_no else 0
    return {'faturaNo': fatura_no, 'ulke': ulke, 'dosyaNo': (sev or {}).get('dosya_no', ''),
            'referans': ref, 'uyarilar': uyarilar, 'belgeler': sonuc,
            'eksikBelgeler': eksik, 'tamamlandi': tamam, 'kayitSayisi': kayit_var}

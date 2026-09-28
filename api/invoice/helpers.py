import io
import re

from pypdf import PdfReader
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

from .constants import DARK_BLUE, MID_BLUE, LIGHT_BLUE, LIGHT_GRAY

# ── Stil cache'leri (tekrar tekrar obje üretmemek için) ───────────────────────
_FONT_CACHE   = {}
_FILL_CACHE   = {}
_BORDER_CACHE = {}
_ALIGN_CACHE  = {}


def brd(c='BFBFBF'):
    """İnce kenarlık — tüm kenarlar."""
    s = Side(style='thin', color=c)
    return Border(left=s, right=s, top=s, bottom=s)


def hdr(ws, r, col, val,
        bg=DARK_BLUE, fg='FFFFFF', bold=True, align='center', size=9):
    """Header hücresi yaz."""
    cell = ws.cell(row=r, column=col, value=val)

    fkey = (bold, fg, size)
    if fkey not in _FONT_CACHE:
        _FONT_CACHE[fkey] = Font(name='Arial', bold=bold, color=fg, size=size)
    cell.font = _FONT_CACHE[fkey]

    if bg not in _FILL_CACHE:
        _FILL_CACHE[bg] = PatternFill('solid', fgColor=bg)
    cell.fill = _FILL_CACHE[bg]

    if align not in _ALIGN_CACHE:
        _ALIGN_CACHE[align] = Alignment(
            horizontal=align, vertical='center', wrap_text=True)
    cell.alignment = _ALIGN_CACHE[align]

    if 'default' not in _BORDER_CACHE:
        _BORDER_CACHE['default'] = brd()
    cell.border = _BORDER_CACHE['default']

    return cell


def dat(ws, r, col, val,
        bg='FFFFFF', bold=False, align='left', fmt=None):
    """Data hücresi yaz."""
    cell = ws.cell(row=r, column=col, value=val)

    fkey = (bold,)
    if fkey not in _FONT_CACHE:
        _FONT_CACHE[fkey] = Font(name='Arial', bold=bold, color='000000', size=9)
    cell.font = _FONT_CACHE[fkey]

    if bg not in _FILL_CACHE:
        _FILL_CACHE[bg] = PatternFill('solid', fgColor=bg)
    cell.fill = _FILL_CACHE[bg]

    if align not in _ALIGN_CACHE:
        _ALIGN_CACHE[align] = Alignment(
            horizontal=align, vertical='center', wrap_text=True)
    cell.alignment = _ALIGN_CACHE[align]

    if 'default' not in _BORDER_CACHE:
        _BORDER_CACHE['default'] = brd()
    cell.border = _BORDER_CACHE['default']

    if fmt:
        cell.number_format = fmt

    return cell


def parse_num(v):
    """Herhangi bir değeri float'a çevir. Hata durumunda 0.0 döner."""
    if v is None or v == '':
        return 0.0
    if isinstance(v, (int, float)):
        return float(v) if str(v) not in ['nan', 'inf'] else 0.0
    s = str(v).strip().replace(' ', '').replace('\u00a0', '')
    if '.' in s and ',' in s:
        s = s.replace('.', '').replace(',', '.')
    elif ',' in s:
        s = s.replace(',', '.')
    try:
        return float(s)
    except Exception:
        return 0.0


# ── PDF parse yardımcıları ────────────────────────────────────────────────────

def _normalize_pdf_text(text):
    return re.sub(r'\s+', ' ', (text or '').replace('\u00a0', ' ')).strip()


def _parse_pdf_amount(value):
    s = str(value).strip().replace(' ', '').replace('\u00a0', '')
    if '.' in s and ',' in s:
        if s.rfind(',') > s.rfind('.'):
            s = s.replace('.', '').replace(',', '.')
        else:
            s = s.replace(',', '')
    elif ',' in s:
        s = s.replace(',', '.')
    try:
        return float(s)
    except Exception:
        return parse_num(value)


def _extract_pdf_amount(text, patterns):
    for pattern in patterns:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            return _parse_pdf_amount(m.group(1))
    return 0.0


def _extract_pdf_invoice_total_tl(text):
    """PDF dip toplamını çıkar; mal/hizmet ara toplamını sadece son çare kullan."""
    priority_patterns = [
        r'\bNet\s+Tutar\s*(?:\([^)]*\))?\s*[:.]?\s*(?:TRY|TL|₺)?\s*([\d.,]+)\s*(?:TRY|TL|₺)?',
        r'\b[ÖO]DENECEK\s+TUTAR\s*(?:\([^)]*\))?\s*[:.]?\s*(?:TRY|TL|₺)?\s*([\d.,]+)\s*(?:TRY|TL|₺)?',
        r'\bVERG[İI]LER\s+DAH[İI]L\s+TOPLAM\s+TUTAR\s*(?:\([^)]*\))?\s*[:.]?\s*(?:TRY|TL|₺)?\s*([\d.,]+)\s*(?:TRY|TL|₺)?',
        r'\bGENEL\s+TOPLAM\s*(?:\([^)]*\))?\s*[:.]?\s*(?:TRY|TL|₺)?\s*([\d.,]+)\s*(?:TRY|TL|₺)?',
    ]
    fallback_patterns = [
        r'\bMAL\s+(?:VE\s+)?H[İI]ZMET\s+TOPLAM\s+TUTAR[İI]?\s*(?:\([^)]*\))?\s*[:.]?\s*(?:TRY|TL|₺)?\s*([\d.,]+)\s*(?:TRY|TL|₺)?',
    ]
    return (
        _extract_pdf_amount(text, priority_patterns) or
        _extract_pdf_amount(text, fallback_patterns)
    )


def _extract_amount_near_keywords(text, keywords, window=140):
    money_re = re.compile(
        r'(?:TRY|TL|₺)?\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2,4})|[0-9]+[.,][0-9]{2,4})\s*(?:TRY|TL|₺)?',
        re.IGNORECASE,
    )
    for keyword in keywords:
        for match in re.finditer(keyword, text, re.IGNORECASE):
            snippet = text[match.start():match.end() + window]
            amounts = [
                _parse_pdf_amount(m.group(1))
                for m in money_re.finditer(snippet)
            ]
            amounts = [n for n in amounts if n > 0]
            if amounts:
                return amounts[0]
    return 0.0


# B.KG: 5600,00 — PDF extract bazen "B. KG" / "B.\nKG" / "5 600,00" üretir.
_BRUT_KG_PATTERNS = [
    r'\bB\s*\.\s*KG\s*[:.]?\s*([\d.\s]+,\d{2}|[\d.,]+)',
    r'\bBRUT\s*\.?\s*KG\s*[:.]?\s*([\d.\s]+,\d{2}|[\d.,]+)',
    r'\bGROSS\s*WEIGHT\s*[:.]?\s*(?:KG)?\s*([\d.\s]+,\d{2}|[\d.,]+)',
    r'\bBR[ÜU]T\s*(?:KG|A[ĞG]IRLIK)\s*[:.]?\s*([\d.\s]+,\d{2}|[\d.,]+)',
]
_NET_KG_PATTERNS = [
    r'\bN\s*\.\s*KG\s*[:.]?\s*([\d.\s]+,\d{2}|[\d.,]+)',
    r'\bNET\s*\.?\s*KG\s*[:.]?\s*([\d.\s]+,\d{2}|[\d.,]+)',
    r'\bNET\s*WEIGHT\s*[:.]?\s*(?:KG)?\s*([\d.\s]+,\d{2}|[\d.,]+)',
    r'\bNET\s*A[ĞG]IRLIK\s*[:.]?\s*([\d.\s]+,\d{2}|[\d.,]+)',
]


def extract_pdf_brut_net_kg(text):
    """PDF metninden (B.KG / N.KG) brüt ve net kiloyu okur."""
    brut = _extract_pdf_amount(text, _BRUT_KG_PATTERNS)
    net = _extract_pdf_amount(text, _NET_KG_PATTERNS)
    return brut, net


def _extract_pdf_packages(text):
    patterns = [
        r'[*\-]?\s*KAP\s+ADET[İI]\s*:\s*(\d+(?:\s*\([^)]*\))?)',
        r'[*\-]?\s*KAP\s+SAYISI\s*:\s*(\d+(?:\s*\([^)]*\))?)',
        r'[*\-]?\s*KAP\s+ADEDI\s*:\s*(\d+(?:\s*\([^)]*\))?)',
        r'[*\-]?\s*KAP\s*:\s*(\d+(?:\s*\([^)]*\))?)',
        r'\bPACKAGES?\s*:\s*(\d+(?:\s*\([^)]*\))?)',
        r'\bCOLL[Iİ]\s*:\s*(\d+(?:\s*\([^)]*\))?)',
    ]
    for pattern in patterns:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            return m.group(1).strip()
    return ''


_FATURA_NO_LABEL_RE = re.compile(
    r'(?:e-?\s*)?Fatura\s*No\s*:?\s*([A-Z]{2,6}\d{10,})',
    re.IGNORECASE,
)
_INVOICE_NO_LABEL_RE = re.compile(
    r'(?:Invoice|INV)\s*(?:No\.?|Number|#)\s*:?\s*([A-Z]{2,6}\d{10,})',
    re.IGNORECASE,
)
_IHR_ANT_FATURA_RE = re.compile(r'\b((?:IHR|ANT)\d{10,})\b', re.IGNORECASE)
_BLANK_FATURA_NO = frozenset(('none', 'nan', 'null', 'nat', '<na>'))


def _extract_pdf_fatura_no(text):
    """E-fatura PDF metninden fatura seri no çıkarır (örn. IHR2026000000317)."""
    if not text:
        return ''
    for pattern in (_FATURA_NO_LABEL_RE, _INVOICE_NO_LABEL_RE):
        m = pattern.search(text)
        if m:
            return m.group(1).strip().upper()
    m = _IHR_ANT_FATURA_RE.search(text)
    if m:
        return m.group(1).strip().upper()
    return ''


def extract_fatura_no_from_pdf(pdf_bytes):
    """PDF'in ilk sayfalarından fatura no okur. Yoksa boş string."""
    if not pdf_bytes:
        return ''
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        for i in range(min(2, len(reader.pages))):
            no = _extract_pdf_fatura_no(
                _normalize_pdf_text(reader.pages[i].extract_text() or ''))
            if no:
                return no
    except Exception:
        pass
    return ''


def is_blank_fatura_no(value):
    """Excel'deki boş / None / nan fatura no değerlerini ayırır."""
    if value is None:
        return True
    try:
        if isinstance(value, float) and value != value:  # NaN
            return True
    except Exception:
        pass
    s = str(value).strip()
    return (not s) or s.lower() in _BLANK_FATURA_NO


def resolve_fatura_no(df, pdf_fields=None):
    """Excel'den fatura no okur; boş/None ise PDF'den gelen değere düşer."""
    col = 'E-Fatura Seri Numarası'
    excel_no = ''
    if df is not None and col in getattr(df, 'columns', []) and len(df) > 0:
        raw = df[col].iloc[0]
        if not is_blank_fatura_no(raw):
            excel_no = str(raw).strip()
    if excel_no:
        return excel_no
    return str((pdf_fields or {}).get('fatura_no') or '').strip()


def apply_pdf_fatura_fallback(df, pdf_fields=None):
    """Excel fatura no boş/None ise PDF'dekini tüm satırlara yazar (master dahil)."""
    pdf_no = str((pdf_fields or {}).get('fatura_no') or '').strip()
    if not pdf_no or df is None:
        return False
    col = 'E-Fatura Seri Numarası'
    if col not in getattr(df, 'columns', []) or df.empty or is_blank_fatura_no(df[col].iloc[0]):
        df[col] = pdf_no
        return True
    return False


def parse_pdf(pdf_bytes):
    """
    PDF'ten navlun, sigorta, kur, kap, kg, toplam TL ve fatura no bilgisini çıkarır.
    Dönen dict: {'navlun': float, 'sigorta': float, 'kur': float, 'kap': str,
                 'fatura_tl': float, 'fatura_no': str, 'brutKg': float, 'netKg': float}
    Navlun ve sigorta PDF'te yazdığı tutar olarak döner; para birimi ülke akışında yorumlanır.
    """
    result = {
        'navlun': 0.0, 'sigorta': 0.0, 'kur': 0.0,
        'kap': '', 'fatura_tl': 0.0, 'fatura_no': '',
        'brutKg': 0.0, 'netKg': 0.0,
    }
    try:
        result['fatura_no'] = extract_fatura_no_from_pdf(pdf_bytes)
        reader = PdfReader(io.BytesIO(pdf_bytes))
        page_count = len(reader.pages)
        # B.KG çoğu faturada son sayfa dipnotunda; bazen bir önceki sayfada
        # veya ilk sayfada kalır. Önce son 4, gerekirse geriye doğru tara.
        preferred_indexes = list(range(max(0, page_count - 4), page_count))

        def _page_text(i):
            return _normalize_pdf_text(reader.pages[i].extract_text() or '')

        def _apply_kg(text):
            if not text:
                return
            brut, net = extract_pdf_brut_net_kg(text)
            if result['brutKg'] <= 0 and brut > 0:
                result['brutKg'] = brut
            if result['netKg'] <= 0 and net > 0:
                result['netKg'] = net

        for indexes in (preferred_indexes,):
            texts = []
            for i in indexes:
                texts.append(_page_text(i))
            text = ' '.join(t for t in texts if t).strip()
            if not text:
                continue
            _apply_kg(text)
            if result['navlun'] <= 0:
                result['navlun'] = _extract_pdf_amount(text, [
                    r'\bNAVLUN(?:\s+(?:BEDEL[İI]|BEDELI|TUTAR[İI]|TUTARI|ÜCRET[İI]|UCRETI))?(?:\s*\([^)]*\))?\s*[:.]?\s*(?:TRY|TL|₺)?\s*([\d.,]+)',
                    r'\bFREIGHT(?:\s+(?:AMOUNT|COST|CHARGE|VALUE))?(?:\s*\([^)]*\))?\s*[:.]?\s*(?:TRY|TL|₺)?\s*([\d.,]+)',
                ]) or _extract_amount_near_keywords(text, [
                    r'\bNAVLUN\b',
                    r'\bFREIGHT\b',
                    r'\bTA[SŞ]IMA\b',
                ])
            if result['sigorta'] <= 0:
                result['sigorta'] = _extract_pdf_amount(text, [
                    r'\bS[İI]G(?:ORTA)?(?:\s+(?:BEDEL[İI]|BEDELI|TUTAR[İI]|TUTARI|ÜCRET[İI]|UCRETI))?\.?(?:\s*\([^)]*\))?\s*[:.]?\s*(?:TRY|TL|₺)?\s*([\d.,]+)',
                    r'\bINSURANCE(?:\s+(?:AMOUNT|COST|CHARGE|VALUE))?(?:\s*\([^)]*\))?\s*[:.]?\s*(?:TRY|TL|₺)?\s*([\d.,]+)',
                ]) or _extract_amount_near_keywords(text, [
                    r'\bS[İI]GORTA\b',
                    r'\bSIGORTA\b',
                    r'\bINSURANCE\b',
                ])
            if result['kur'] <= 0:
                result['kur'] = _extract_pdf_amount(text, [
                    r'[*\-]?\s*KUR\s+B[İI]LG[İI]S[İI]\s*[:.]?\s*(?:TRY|EUR|USD)?\s*([\d.,]+)',
                    r'\bD[ÖO]V[İI]Z\s+KURU\s*[:.]?\s*(?:TRY|EUR|USD)?\s*([\d.,]+)',
                ])
            if result['fatura_tl'] <= 0:
                result['fatura_tl'] = _extract_pdf_invoice_total_tl(text)
            if not result['kap']:
                result['kap'] = _extract_pdf_packages(text)
            if result['navlun'] > 0 and result['sigorta'] > 0:
                break

        if result['brutKg'] <= 0 or result['netKg'] <= 0:
            extra = list(range(max(0, page_count - 8), max(0, page_count - 4)))
            if 0 not in preferred_indexes:
                extra.append(0)
            seen = set(preferred_indexes)
            for i in extra:
                if i in seen:
                    continue
                _apply_kg(_page_text(i))
                if result['brutKg'] > 0 and result['netKg'] > 0:
                    break
    except Exception:
        pass
    return result


def sku_grupla(df):
    """
    SKU bazında gruplandırma — INV ve PL için tekil satır üretir.
    Miktar toplanır, diğer kolonlar ilk değeri alır.

    Aynı SKU farklı satırlarda farklı birim fiyatla geldiyse (nadir ama mümkün),
    gruplanmış 'Fiyat' kolonu sadece ilk satırın fiyatını taşır — bu yüzden
    "Miktar(toplam) × Fiyat(ilk)" formülüyle hesaplanan tutar yanlış olabilir.
    Burada gruplama öncesi her satırın gerçek tutarı (Miktar × Fiyat) hesaplanıp
    '__LINE_TOTAL__' kolonunda toplanıyor; çağıran kod TOPLAM için bunu
    kullanmalı, gruplanmış Miktar/Fiyat'ı tekrar çarpmamalı.
    """
    has_tutar = 'Miktar' in df.columns and 'Fiyat' in df.columns
    if has_tutar:
        df = df.copy()
        df['__LINE_TOTAL__'] = (
            df['Miktar'].apply(parse_num) * df['Fiyat'].apply(parse_num)
        )

    agg_dict = {col: 'first' for col in df.columns if col != 'SKU'}
    agg_dict['Miktar'] = 'sum'
    if has_tutar:
        agg_dict['__LINE_TOTAL__'] = 'sum'
    return df.groupby('SKU', sort=False).agg(agg_dict).reset_index()


def set_print(ws, print_area):
    """Yazdırma alanı ve sayfa düzenini ayarla."""
    from openpyxl.worksheet.page import PageMargins
    from openpyxl.worksheet.properties import PageSetupProperties

    ws.print_area = print_area
    ws.page_setup.paperSize   = ws.PAPERSIZE_A4
    ws.page_setup.orientation = ws.ORIENTATION_PORTRAIT
    ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
    ws.page_setup.fitToWidth  = 1
    ws.page_setup.fitToHeight = 0
    ws.page_margins = PageMargins(
        left=0.5, right=0.5, top=0.75, bottom=0.75,
        header=0.3, footer=0.3)
    ws.print_title_rows = '1:2'

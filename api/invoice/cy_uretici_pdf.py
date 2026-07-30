"""
Kıbrıs Tekstil Dışı fatura PDF'ine Üretici sütunu ekleyen modül.

Yüklenen orijinal e-Fatura PDF'i satır/sütun bazında pdfplumber ile taranır.
Hem 13 sütunlu ihracat şablonu hem de 6 sütunlu e-Arşiv şablonu desteklenir;
mevcut sütunlar daraltılarak açılan alana Excel'deki YURT DIŞI/İÇİ TEDARİKÇİ
Açıklama değeri (SKU eşleşmesiyle) "Üretici" adıyla eklenir. Satır yüksekliği
ve sayfa sayısı değişmez.
"""
import io
import os

import pdfplumber
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader

FONT_NAME = 'DejaVuSansCY'
_FONT_REGISTERED = False

_SIGNATURE_READER = None
SIGNATURE_W = 70
SIGNATURE_H = 70 * 116 / 220  # imza görselinin oranı (220x116)


def _load_signature():
    """İmza görselini bir kez okuyup önbelleğe alır."""
    global _SIGNATURE_READER
    if _SIGNATURE_READER is None:
        current_dir = os.path.dirname(os.path.abspath(__file__))
        root_dir = os.path.dirname(os.path.dirname(current_dir))
        path = os.path.join(root_dir, 'templates', 'imza_cy.png')
        _SIGNATURE_READER = ImageReader(path)
    return _SIGNATURE_READER


def _build_signature_overlay(page_w, page_h):
    """Her sayfanın sağ alt köşesine imza basan overlay üretir."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(page_w, page_h))
    sig = _load_signature()
    x = page_w - SIGNATURE_W - 8
    y = 6
    c.drawImage(sig, x, y, width=SIGNATURE_W, height=SIGNATURE_H,
                mask='auto', preserveAspectRatio=True)
    c.save()
    buf.seek(0)
    return buf


def _find_font():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    root_dir = os.path.dirname(os.path.dirname(current_dir))
    candidates = [
        os.path.join(root_dir, 'fonts', 'DejaVuSans.ttf'),
        os.path.join(current_dir, 'fonts', 'DejaVuSans.ttf'),
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    raise FileNotFoundError('DejaVuSans.ttf bulunamadı')


def _ensure_font():
    global _FONT_REGISTERED
    if not _FONT_REGISTERED:
        pdfmetrics.registerFont(TTFont(FONT_NAME, _find_font()))
        _FONT_REGISTERED = True


# 13 sütunlu ihracat şablonunun sütun sırası:
# idx: 0 Sıra No, 1 Ürün Kodu, 2 Renk Kodu, 3 Renk, 4 Mal Hizmet, 5 Menşei,
#      6 Miktar, 7 Birim Fiyat, 8 Mal Hizmet Tutarı, 9 Teslim/Bedel Ödeme Yeri,
#      10 Gönderilme Şekli, 11 Teslim Şartı, 12 GTİP
# Sadece bilgi yoğunluğu düşük/kısa sütunlar daraltılır; Mal Hizmet, Menşei,
# Miktar, Fiyat, Tutar ve Teslim/Bedel Ödeme Yeri'ne dokunulmaz.
SHRINK_13_COL = {0: -1.5, 1: -4.2, 2: -1.4, 3: -20.2, 10: -4.2, 11: -2.7}

# 6 sütunlu e-Arşiv şablonu:
# idx: 0 Ürün Kodu, 1 Ürün Adı, 2 Miktar, 3 Birim Fiyat,
#      4 Brüt Tutar, 5 Ürün Tutarı
# İlk iki geniş metin sütunundan yer açılır; sayısal sütunlar korunur.
SHRINK_6_COL = {0: -32.0, 1: -38.0}

LEFT_ALIGN_PAD = 2.7
LINE_H = 7.6
LINE_H_URETICI = 6.4
DATA_FONT_SIZE = 5.4
URETICI_FONT_SIZE = 5.0
HEADER_FONT_SIZE = 5.8
MAX_LINES_URETICI = 6
EARCHIVE_DATA_FONT_SIZE = 7.2
EARCHIVE_HEADER_FONT_SIZE = 7.2
EARCHIVE_LINE_H = 8.4

HEADER_KEYWORDS = {'Sıra', 'Ürün', 'Kodu', 'Renk', 'Mal', 'Hizmet', 'Menşei', 'Miktar',
                   'Birim', 'Fiyat', 'Tutarı', 'Teslim', 'Bedel', 'Ödeme', 'Yeri',
                   'Gönderilme', 'Şekli', 'Şartı', 'GTİP'}


def _table_cell_groups(page):
    """Aynı yatay bantta duran dolu hücre dikdörtgenlerini döndürür.

    e-Arşiv PDF'lerinde satırlar 26-29 pt, ihracat şablonunda ise 30-55 pt
    yüksekliğindedir. Sabit bir yükseklik aralığı yerine, aynı üst/alt
    koordinatları ve birbirine bitişik 6/13 hücreyi tablo sinyali sayarız.
    """
    grouped = {}
    for r in page.rects:
        h = r['bottom'] - r['top']
        if (not r.get('fill') or r.get('stroke') or r.get('width', 0) <= 4
                or not 15 < h < 80):
            continue
        key = (round(r['top'], 2), round(r['bottom'], 2))
        grouped.setdefault(key, []).append(r)

    result = []
    for (top, bottom), rects in grouped.items():
        # Aynı x0'da üst üste çizilmiş olabilecek hücreleri tekilleştir.
        by_x0 = {}
        for r in rects:
            by_x0.setdefault(round(r['x0'], 1), r)
        cells = sorted(by_x0.values(), key=lambda r: r['x0'])
        if len(cells) not in (6, 13):
            continue
        if cells[-1]['x1'] - cells[0]['x0'] < page.width * 0.70:
            continue
        if any(abs(cells[i + 1]['x0'] - cells[i]['x1']) > 2
               for i in range(len(cells) - 1)):
            continue
        result.append((top, bottom, cells))
    return result


def _detect_cols_and_row_height(pdf):
    """Desteklenen tablonun sütun sınırlarını ve tipik satır yüksekliğini bulur."""
    candidates = {}
    for page in pdf.pages[:3]:
        words = page.extract_words()
        for top, bottom, cells in _table_cell_groups(page):
            signature = tuple(round(r['x0'], 1) for r in cells) + (
                round(cells[-1]['x1'], 1),
            )
            band_words = [w for w in words if top - 0.5 <= w['top'] < bottom - 0.5]
            header_hits = len({w['text'] for w in band_words} & HEADER_KEYWORDS)
            item = candidates.setdefault(signature, {
                'cells': cells, 'heights': [], 'bands': 0, 'header_hits': 0,
            })
            item['heights'].append(bottom - top)
            item['bands'] += 1
            item['header_hits'] = max(item['header_hits'], header_hits)

    if not candidates:
        raise ValueError('PDF tablo satır yapısı tanınamadı (satır yüksekliği bulunamadı)')

    # Başlık kelimeleri en güçlü sinyaldir; ardından tekrar eden bant ve sütun
    # sayısı gelir. Böylece faturadaki özet tablolar ürün tablosuyla karışmaz.
    best = max(candidates.values(), key=lambda x: (
        x['header_hits'], x['bands'], len(x['cells']),
    ))
    cells = best['cells']
    old_cols = [(round(r['x0'], 1), round(r['x1'], 1)) for r in cells]
    heights = sorted(best['heights'])
    row_h = heights[len(heights) // 2]
    return old_cols, row_h


def _build_new_cols(old_cols):
    if len(old_cols) == 13:
        shrink = SHRINK_13_COL
    elif len(old_cols) == 6:
        shrink = SHRINK_6_COL
    else:
        raise ValueError(f'Desteklenmeyen PDF tablo sütun sayısı: {len(old_cols)}')

    new_cols = []
    x = old_cols[0][0]
    total_shrink = 0.0
    for idx, (x0, x1) in enumerate(old_cols):
        w = (x1 - x0) + shrink.get(idx, 0)
        new_cols.append((x, x + w))
        total_shrink += -shrink.get(idx, 0)
        x += w
    uretici_col = (x, x + total_shrink)
    return new_cols, uretici_col


def _get_row_bands(page, old_cols):
    """Her satırın kendi hücre dikdörtgeninden gerçek üst/alt sınırını alır.
    Bir sonraki satırın üstünü tahmin etmeye veya son satırda row_h ekleyip
    tahmin yapmaya gerek yok — bu, son satırın alt sınırını yanlış hesaplayıp
    hemen altındaki toplam/footer kutusunun metnini satıra karıştırmayı önler."""
    expected = [x0 for x0, _x1 in old_cols]
    bands = []
    for top, bottom, cells in _table_cell_groups(page):
        if len(cells) != len(old_cols):
            continue
        actual = [round(r['x0'], 1) for r in cells]
        if all(abs(a - b) <= 1.5 for a, b in zip(actual, expected)):
            bands.append((top, bottom))
    return sorted(bands)


def _assign_col(x0, old_cols):
    for idx, (a, b) in enumerate(old_cols):
        if a - 1 <= x0 < b + 1:
            return idx
    return min(range(len(old_cols)), key=lambda i: abs(old_cols[i][0] - x0))


def _get_row_bg_color(page, band):
    top, _bottom = band
    for r in page.rects:
        if not r.get('fill') or r.get('stroke') or r.get('width', 0) <= 4:
            continue
        h = r['bottom'] - r['top']
        if 15 < h < 80 and abs(r['top'] - top) < 1:
            return r['non_stroking_color']
    return (1, 1, 1)


def _normalize_sku(value):
    """PDF'deki görsel son nokta/boşluk farklarını eşleştirmeden çıkarır."""
    return ''.join(str(value or '').split()).rstrip('.').upper()


def _split_long_token(token, max_width, font_size, font_name):
    """Boşluksuz uzun bir kelimeyi karakter bazında satırlara böler."""
    parts = []
    cur = ''
    for ch in token:
        trial = cur + ch
        if pdfmetrics.stringWidth(trial, font_name, font_size) <= max_width or not cur:
            cur = trial
        else:
            parts.append(cur)
            cur = ch
    if cur:
        parts.append(cur)
    return parts


def _split_oversized_word(word, max_width, font_size):
    """Boşluksuz uzun bir kelimeyi önce '/' sınırlarında böler (ör.
    'Lacivert/Beyaz' -> 'Lacivert/' + 'Beyaz'), sadece bir parça hâlâ sığmıyorsa
    karakter bazında böler. '/' bölmesi çirkin harf harf bölmeden daha temiz görünür."""
    if '/' in word:
        chunks = []
        rest = word
        while '/' in rest:
            i = rest.index('/')
            chunks.append(rest[:i + 1])
            rest = rest[i + 1:]
        if rest:
            chunks.append(rest)

        parts = []
        cur = ''
        for chunk in chunks:
            trial = cur + chunk
            if pdfmetrics.stringWidth(trial, FONT_NAME, font_size) <= max_width:
                cur = trial
            else:
                if cur:
                    parts.append(cur)
                if pdfmetrics.stringWidth(chunk, FONT_NAME, font_size) <= max_width:
                    cur = chunk
                else:
                    sub = _split_long_token(chunk, max_width, font_size, FONT_NAME)
                    parts.extend(sub[:-1])
                    cur = sub[-1] if sub else ''
        if cur:
            parts.append(cur)
        return parts

    return _split_long_token(word, max_width, font_size, FONT_NAME)


def _wrap_text(text, max_width, font_size, max_lines=6):
    words = text.split()
    if not words:
        return []
    lines = []
    cur = ''
    for w in words:
        trial = (cur + ' ' + w).strip()
        if pdfmetrics.stringWidth(trial, FONT_NAME, font_size) <= max_width:
            cur = trial
            continue
        if cur:
            lines.append(cur)
            cur = ''
        if pdfmetrics.stringWidth(w, FONT_NAME, font_size) <= max_width:
            cur = w
        else:
            parts = _split_oversized_word(w, max_width, font_size)
            lines.extend(parts[:-1])
            cur = parts[-1] if parts else ''
        if len(lines) >= max_lines:
            break
    if cur:
        lines.append(cur)
    return lines[:max_lines]


def _is_header_band(band_words):
    texts = {w['text'] for w in band_words}
    return len(texts & HEADER_KEYWORDS) >= 4


def _get_band_sku(page, band, old_cols):
    """Bir tablo bandındaki Ürün Kodu/SKU değerini normalize ederek döndürür."""
    top, bottom = band
    sku_col_idx = 1 if len(old_cols) == 13 else 0
    sku_words = [
        w for w in page.extract_words()
        if top - 0.5 <= w['top'] < bottom - 0.5
        and _assign_col(w['x0'], old_cols) == sku_col_idx
    ]
    sku_words.sort(key=lambda w: (w['top'], w['x0']))
    return _normalize_sku(''.join(w['text'] for w in sku_words))


def _get_pdf_skus(pdf, old_cols):
    """PDF ürün tablosundaki başlık dışı tüm SKU'ları sırasıyla döndürür."""
    result = []
    for page in pdf.pages:
        words = page.extract_words()
        for band in _get_row_bands(page, old_cols):
            top, bottom = band
            band_words = [
                w for w in words if top - 0.5 <= w['top'] < bottom - 0.5
            ]
            if not band_words or _is_header_band(band_words):
                continue
            sku = _get_band_sku(page, band, old_cols)
            if sku:
                result.append(sku)
    return result


def _build_overlay_for_page(page, old_cols, new_cols, uretici_col,
                             sku_to_uretici, page_w, page_h):
    words = page.extract_words()
    bands = _get_row_bands(page, old_cols)
    sku_col_idx = 1 if len(old_cols) == 13 else 0
    is_earchive = len(old_cols) == 6
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(page_w, page_h))
    any_drawn = False

    for top, bottom in bands:
        band_words = [w for w in words if top - 0.5 <= w['top'] < bottom - 0.5]
        if not band_words:
            continue
        cols_words = {i: [] for i in range(len(old_cols))}
        for w in band_words:
            idx = _assign_col(w['x0'], old_cols)
            cols_words[idx].append(w)

        is_header = _is_header_band(band_words)
        sku_words = sorted(cols_words.get(sku_col_idx, []),
                           key=lambda w: (w['top'], w['x0']))
        sku_text = _normalize_sku(''.join(w['text'] for w in sku_words))

        any_drawn = True
        bg_color = _get_row_bg_color(page, (top, bottom))

        old_x0 = old_cols[0][0]
        old_x1 = old_cols[-1][1]
        y_top_pdf = page_h - top
        y_bottom_pdf = page_h - bottom

        c.setFillColorRGB(1, 1, 1)
        c.rect(old_x0 - 1, y_bottom_pdf - 1, (old_x1 - old_x0) + 2, (bottom - top) + 2, fill=1, stroke=0)

        c.setFillColorRGB(*bg_color)
        for x0, x1 in new_cols + [uretici_col]:
            c.rect(x0, y_bottom_pdf, x1 - x0, bottom - top, fill=1, stroke=0)

        c.setStrokeColorRGB(0.8, 0.8, 0.8)
        c.setLineWidth(0.4)
        c.line(old_x0, y_top_pdf, uretici_col[1], y_top_pdf)
        c.line(old_x0, y_bottom_pdf, uretici_col[1], y_bottom_pdf)
        for x0, _ in new_cols + [uretici_col]:
            c.line(x0, y_top_pdf, x0, y_bottom_pdf)
        c.line(uretici_col[1], y_top_pdf, uretici_col[1], y_bottom_pdf)

        c.setFillColorRGB(0, 0, 0)
        for idx in range(len(old_cols)):
            cw = cols_words.get(idx, [])
            if not cw:
                continue
            cw.sort(key=lambda w: (round(w['top'], 1), w['x0']))
            lines_map = {}
            for w in cw:
                lines_map.setdefault(round(w['top'], 1), []).append(w)
            orig_lines = []
            for key in sorted(lines_map.keys()):
                ws = sorted(lines_map[key], key=lambda w: w['x0'])
                orig_lines.append(' '.join(w['text'] for w in ws))
            full_text = ' '.join(orig_lines)

            new_x0, new_x1 = new_cols[idx]
            max_w = (new_x1 - new_x0) - 2 * LEFT_ALIGN_PAD
            if is_earchive:
                font_size = (EARCHIVE_HEADER_FONT_SIZE if is_header
                             else EARCHIVE_DATA_FONT_SIZE)
                text_line_h = EARCHIVE_LINE_H
            else:
                font_size = HEADER_FONT_SIZE if is_header else DATA_FONT_SIZE
                text_line_h = LINE_H
            new_lines = _wrap_text(full_text, max_w, font_size)
            n = len(new_lines)
            offset = max(2.0, ((bottom - top) - n * text_line_h) / 2)
            c.setFont(FONT_NAME, font_size)
            for li, line in enumerate(new_lines):
                line_top = top + offset + li * text_line_h
                baseline_y = page_h - (line_top + font_size * 0.83)
                c.drawString(new_x0 + LEFT_ALIGN_PAD, baseline_y, line)

        if is_header:
            uretici_text = 'Üretici'
            font_size = EARCHIVE_HEADER_FONT_SIZE if is_earchive else HEADER_FONT_SIZE
            line_h = EARCHIVE_LINE_H if is_earchive else LINE_H
            max_lines = 4
        else:
            uretici_text = sku_to_uretici.get(sku_text, '')
            font_size = URETICI_FONT_SIZE
            line_h = LINE_H_URETICI
            max_lines = MAX_LINES_URETICI

        if uretici_text:
            max_w = (uretici_col[1] - uretici_col[0]) - 2 * LEFT_ALIGN_PAD
            u_lines = _wrap_text(str(uretici_text), max_w, font_size, max_lines=max_lines)
            n = len(u_lines)
            offset = max(2.0, ((bottom - top) - n * line_h) / 2)
            c.setFont(FONT_NAME, font_size)
            for li, line in enumerate(u_lines):
                line_top = top + offset + li * line_h
                baseline_y = page_h - (line_top + font_size * 0.83)
                c.drawString(uretici_col[0] + LEFT_ALIGN_PAD, baseline_y, line)

    c.save()
    buf.seek(0)
    return buf, any_drawn


def generate_uretici_pdf(pdf_bytes, sku_to_uretici):
    """
    Kıbrıs Tekstil Dışı fatura PDF'ine SKU eşleşmeli 'Üretici' sütunu ekler.

    pdf_bytes: kullanıcının yüklediği orijinal e-Fatura PDF'i
    sku_to_uretici: {SKU: üretici/tedarikçi metni} eşlemesi (raw Excel'den)

    Dönüş: değiştirilmiş PDF bytes. Her sayfaya imza eklenir; SKU eşleşmesi
    varsa ayrıca Üretici sütunu da eklenir.
    """
    _ensure_font()

    base_reader = PdfReader(io.BytesIO(pdf_bytes))
    page0 = base_reader.pages[0]
    page_w = float(page0.mediabox.width)
    page_h = float(page0.mediabox.height)

    normalized_sku_to_uretici = {
        _normalize_sku(sku): value
        for sku, value in sku_to_uretici.items()
        if _normalize_sku(sku)
    }

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        old_cols, _row_h = _detect_cols_and_row_height(pdf)
        new_cols, uretici_col = _build_new_cols(old_cols)

        pdf_skus = _get_pdf_skus(pdf, old_cols)
        if not pdf_skus:
            raise ValueError('PDF ürün tablosunda eşleştirilecek Ürün Kodu bulunamadı')

        missing_skus = sorted({
            sku for sku in pdf_skus if sku not in normalized_sku_to_uretici
        })
        if missing_skus:
            sample = ', '.join(missing_skus[:8])
            suffix = ' ...' if len(missing_skus) > 8 else ''
            raise ValueError(
                f'{len(missing_skus)} ürün için üretici bilgisi bulunamadı: '
                f'{sample}{suffix}'
            )

        sig_reader = PdfReader(_build_signature_overlay(page_w, page_h))

        writer = PdfWriter()
        for i, page in enumerate(pdf.pages):
            overlay_buf, any_drawn = _build_overlay_for_page(
                page, old_cols, new_cols, uretici_col,
                normalized_sku_to_uretici, page_w, page_h)
            base_page = base_reader.pages[i]
            if any_drawn:
                overlay_reader = PdfReader(overlay_buf)
                base_page.merge_page(overlay_reader.pages[0])

            base_page.merge_page(sig_reader.pages[0])
            writer.add_page(base_page)

        writer.compress_identical_objects(remove_orphans=True)

        out = io.BytesIO()
        writer.write(out)
        out.seek(0)
        return out.getvalue()

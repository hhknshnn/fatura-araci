import json
import io
import os
import re

from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4

_ULKE_KODU_RE = re.compile(r'^[a-z]{2,4}$')


# ── CONFIG YÜKLE ──────────────────────────────────────────────────────────────
def load_evrak_config(ulke_kodu):
    """Ülkeye göre ek evrak config dosyasını yükler."""
    if not _ULKE_KODU_RE.match(str(ulke_kodu or '')):
        raise ValueError(f'Geçersiz ülke kodu: {ulke_kodu}')
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    config_path = os.path.join(base_dir, 'config', f'evrak_{ulke_kodu}.json')
    with open(config_path, 'r', encoding='utf-8') as f:
        return json.load(f)


# ── TEMPLATE PDF YOLU ─────────────────────────────────────────────────────────
def find_evrak_template(template_name):
    """templates/ klasöründe PDF template'i bulur."""
    current_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(os.path.dirname(current_dir), 'templates', template_name),
        os.path.join(current_dir, 'templates', template_name),
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    raise FileNotFoundError(f'Template bulunamadı: {template_name}')


# ── TARİH FORMATLAMA ──────────────────────────────────────────────────────────
def format_tarih_tr(deger):
    """2026-04-22 → 22.04.2026. Parse edemezse olduğu gibi döndürür."""
    if not deger:
        return ''
    s = str(deger).strip()
    # ISO format: YYYY-MM-DD
    if len(s) >= 10 and s[4] == '-' and s[7] == '-':
        try:
            return f'{s[8:10]}.{s[5:7]}.{s[0:4]}'
        except Exception:
            return s
    return s


# ── OVERLAY PDF OLUŞTUR ───────────────────────────────────────────────────────
def build_overlay(overlay_cfg, form_data, page_size):
    """Verilen koordinatlara değerleri yazan overlay PDF üretir."""
    page_w, page_h = page_size
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(page_w, page_h))

    for item in overlay_cfg:
        field_id = item.get('field')
        x        = float(item.get('x', 0))
        # y: pdfplumber "top" koordinatı — PDF baseline'a çevir
        y_top    = float(item.get('y', 0))
        fmt      = item.get('format', '')
        font     = item.get('font', 'Helvetica')
        size     = int(item.get('size', 12))

        deger = form_data.get(field_id, '')
        if deger is None or deger == '':
            continue

        # Format dönüşümleri
        if fmt == 'tr_date':
            deger = format_tarih_tr(deger)

        c.setFont(font, size)
        # PDF baseline: alt = 0. Text'i "top" koordinatı altına yaz
        # Test sonucu: y=top + font_size * 0.83 civarı baseline oluyor
        baseline_y = page_h - (y_top + size * 0.83)
        c.drawString(x, baseline_y, str(deger))

    c.save()
    buf.seek(0)
    return buf


# ── EVRAK PDF ÜRETİCİ ─────────────────────────────────────────────────────────
def generate_evrak_pdf(ulke_kodu, evrak_tipi, form_data):
    """Ülke + evrak tipi + form verisi → doldurulmuş PDF bytes."""
    config = load_evrak_config(ulke_kodu)
    evraklar = config.get('evraklar', {})

    if evrak_tipi not in evraklar:
        raise ValueError(f'Evrak tipi bulunamadı: {evrak_tipi}')

    evrak_cfg   = evraklar[evrak_tipi]
    template    = evrak_cfg['template']
    overlay_cfg = evrak_cfg.get('overlay', [])
    dosya_adi   = evrak_cfg.get('dosyaAdi', f'{evrak_tipi}.pdf')

    # Template PDF'i yükle
    template_path = find_evrak_template(template)
    base_reader   = PdfReader(template_path)

    # Sayfa boyutunu al
    first_page = base_reader.pages[0]
    page_w = float(first_page.mediabox.width)
    page_h = float(first_page.mediabox.height)

    # Overlay PDF oluştur
    overlay_buf = build_overlay(overlay_cfg, form_data, (page_w, page_h))
    overlay_reader = PdfReader(overlay_buf)

    # Birleştir — sadece ilk sayfaya overlay, diğer sayfalar olduğu gibi
    writer = PdfWriter()
    for i, page in enumerate(base_reader.pages):
        if i == 0:
            page.merge_page(overlay_reader.pages[0])
        writer.add_page(page)

    out_buf = io.BytesIO()
    writer.write(out_buf)
    out_buf.seek(0)

    # Dosya adı placeholder'larını doldur
    try:
        dosya_adi = dosya_adi.format(**form_data)
    except Exception:
        pass

    return out_buf.getvalue(), dosya_adi

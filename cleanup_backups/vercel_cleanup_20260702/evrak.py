from http.server import BaseHTTPRequestHandler
import json
import base64
import io
import os
import traceback

from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4


# ── CONFIG YÜKLE ──────────────────────────────────────────────────────────────
def load_evrak_config(ulke_kodu):
    """Ülkeye göre ek evrak config dosyasını yükler."""
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


# ── VERCEL HANDLER ────────────────────────────────────────────────────────────
class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS, GET')
        self.end_headers()

    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps({'status': 'ok', 'service': 'evrak'}).encode())

    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body   = json.loads(self.rfile.read(length))

            ulke_kodu  = body.get('ulkeKodu', '')
            evrak_tipi = body.get('evrakTipi', '')
            form_data  = body.get('formData', {})

            if not ulke_kodu:
                raise ValueError('Ülke kodu boş')
            if not evrak_tipi:
                raise ValueError('Evrak tipi boş')

            pdf_bytes, dosya_adi = generate_evrak_pdf(ulke_kodu, evrak_tipi, form_data)

            result = json.dumps({
                'success':  True,
                'pdf':      base64.b64encode(pdf_bytes).decode('utf-8'),
                'dosyaAdi': dosya_adi,
            })

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(result.encode('utf-8'))

        except Exception as e:
            err = json.dumps({
                'success': False,
                'error':   str(e),
                'trace':   traceback.format_exc(),
            })
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(err.encode('utf-8'))

    def log_message(self, format, *args):
        pass

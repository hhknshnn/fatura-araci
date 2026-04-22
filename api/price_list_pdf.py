# api/price_list_pdf.py
# ─────────────────────────────────────────────────────────────────────────────
# Kazakistan için Price List PDF üretimi.
# İki geçişli:
#   1. Geçiş: sayfa sayısını bul (kaşe yok, dummy buffer)
#   2. Geçiş: gerçek PDF, sadece SON sayfaya kaşe bas
# Her sayfa header'da INVOICE bilgisi tekrar eder (Platypus repeatRows).
# ─────────────────────────────────────────────────────────────────────────────
import io
import os

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame,
    Table, TableStyle, Paragraph, Spacer
)


# ── RENK PALETİ (generate.py ile aynı) ───────────────────────────────────────
DARK_BLUE_PDF  = colors.HexColor('#1F3864')
MID_BLUE_PDF   = colors.HexColor('#2F5496')
LIGHT_BLUE_PDF = colors.HexColor('#D6E4F0')
LIGHT_GRAY_PDF = colors.HexColor('#F2F2F2')
ZEBRA_BLUE     = colors.HexColor('#EBF3FB')


# ── SABİT METİNLER ───────────────────────────────────────────────────────────
FIRMA_ADI = 'DEHA MAGAZACILIK EV TEKSTILI URUNLERI SAN. VE TIC. A.S.'
FIRMA_ADRES = (
    'Mecidiyeköy Mah. Oğuz Sok Rönesans Biz İş Merkezi '
    'No:4/14 K:4 34387 Şişli/İstanbul'
)
IMPORTER_KZ = (
    'TOO"Deha" ("Deha"LTD) - 200740021346\n'
    'AL-FARABİ AVE 7, BC"NURLU TAU", UNİT 4A, 8TH FL, '
    'OFFICE 32, ALMATY, KAZAKHSTAN 050059'
)


# ── FONT KAYIT (uygulama başlatılırken bir kez) ──────────────────────────────
_FONTS_READY = False

def _register_fonts():
    """DejaVu Sans'ı kaydet. TR + Cyrillic Unicode desteği için zorunlu."""
    global _FONTS_READY
    if _FONTS_READY:
        return

    # Aday font yolları — sırayla dene. Repo'ya fonts/ klasörü eklersek
    # Vercel'de de çalışır; Linux sistem font'u yedek.
    here = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        # 1) Repo içindeki fonts/ klasörü (Vercel için en güvenlisi)
        (os.path.join(os.path.dirname(here), 'fonts', 'DejaVuSans.ttf'),
         os.path.join(os.path.dirname(here), 'fonts', 'DejaVuSans-Bold.ttf'),
         os.path.join(os.path.dirname(here), 'fonts', 'DejaVuSans-Oblique.ttf')),
        # 2) Linux sistem fontları (lokal geliştirme)
        ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
         '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
         '/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf'),
    ]
    for reg, bold, obl in candidates:
        if os.path.exists(reg) and os.path.exists(bold):
            pdfmetrics.registerFont(TTFont('DejaVu', reg))
            pdfmetrics.registerFont(TTFont('DejaVu-Bold', bold))
            if os.path.exists(obl):
                pdfmetrics.registerFont(TTFont('DejaVu-Oblique', obl))
                registerFontFamily('DejaVu',
                                   normal='DejaVu', bold='DejaVu-Bold', italic='DejaVu-Oblique')
            else:
                registerFontFamily('DejaVu', normal='DejaVu', bold='DejaVu-Bold')
            _FONTS_READY = True
            return
    raise FileNotFoundError(
        'DejaVu Sans font bulunamadı. Repo\'ya fonts/DejaVuSans.ttf ve '
        'fonts/DejaVuSans-Bold.ttf ekleyin.'
    )


# ── KAŞE PATH ────────────────────────────────────────────────────────────────
def _find_kase_path():
    """kase.png dosyasını bul. Yoksa None döner — PDF yine üretilir, kaşe olmaz."""
    here = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(os.path.dirname(here), 'assets', 'kase.png'),
        os.path.join(os.path.dirname(here), 'kase.png'),
        os.path.join(here, 'kase.png'),
    ]
    for p in candidates:
        if os.path.exists(p):
            return p
    return None


# ── STİLLER ──────────────────────────────────────────────────────────────────
def _styles():
    F, FB = 'DejaVu', 'DejaVu-Bold'
    return {
        'firma':      ParagraphStyle('firma',      fontName=FB, fontSize=9,  leading=11),
        'firma_addr': ParagraphStyle('firma_addr', fontName=F,  fontSize=8,  leading=10),
        'title':      ParagraphStyle('title',      fontName=FB, fontSize=18, leading=22,
                                     textColor=colors.white, alignment=1),
        'imp_label':  ParagraphStyle('imp_label',  fontName=FB, fontSize=9,  leading=11,
                                     textColor=colors.white),
        'imp_val':    ParagraphStyle('imp_val',    fontName=F,  fontSize=8,  leading=10),
        'cell':       ParagraphStyle('cell',       fontName=F,  fontSize=8,  leading=10,
                                     alignment=1),
        'cell_l':     ParagraphStyle('cell_l',     fontName=F,  fontSize=8,  leading=10,
                                     alignment=0),
    }


# ── ELEMANLAR ────────────────────────────────────────────────────────────────
def _build_elements(rows, fatura_no, S):
    """
    rows: list[dict] — her dict {sku, name_en, name_ru, price}
    fatura_no: str — tüm satırlarda Invoice No kolonuna yazılır
    """
    elems = []

    # Firma adı + adres (gri kutu)
    firma_tbl = Table([
        [Paragraph(FIRMA_ADI, S['firma'])],
        [Paragraph(FIRMA_ADRES, S['firma_addr'])],
    ], colWidths=[180 * mm])
    firma_tbl.setStyle(TableStyle([
        ('BACKGROUND',   (0, 0), (-1, -1), LIGHT_GRAY_PDF),
        ('BOX',          (0, 0), (-1, -1), 0.5, colors.grey),
        ('LEFTPADDING',  (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING',   (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING',(0, 0), (-1, -1), 4),
    ]))
    elems.append(firma_tbl)
    elems.append(Spacer(1, 3))

    # PRICE LIST başlık bandı
    title_tbl = Table([[Paragraph('PRICE LIST', S['title'])]],
                      colWidths=[180 * mm], rowHeights=[28])
    title_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), DARK_BLUE_PDF),
        ('VALIGN',     (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    elems.append(title_tbl)
    elems.append(Spacer(1, 3))

    # IMPORTER kutusu
    imp_tbl = Table([[
        Paragraph('IMPORTER / ИМПОРТЕР:', S['imp_label']),
        Paragraph(IMPORTER_KZ.replace('\n', '<br/>'), S['imp_val']),
    ]], colWidths=[45 * mm, 135 * mm])
    imp_tbl.setStyle(TableStyle([
        ('BACKGROUND',   (0, 0), (0, 0), MID_BLUE_PDF),
        ('BACKGROUND',   (1, 0), (1, 0), LIGHT_BLUE_PDF),
        ('VALIGN',       (0, 0), (-1, -1), 'MIDDLE'),
        ('BOX',          (0, 0), (-1, -1), 0.5, colors.grey),
        ('LEFTPADDING',  (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING',   (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING',(0, 0), (-1, -1), 6),
    ]))
    elems.append(imp_tbl)
    elems.append(Spacer(1, 6))

    # Data tablosu
    data = [[
        Paragraph('<b>Invoice No</b>',                     S['cell']),
        Paragraph('<b>ITEM CODE<br/>КОД ПОЗИЦИИ</b>',      S['cell']),
        Paragraph('<b>ITEM NAME - EN</b>',                 S['cell']),
        Paragraph('<b>Наименование</b>',                   S['cell']),
        Paragraph('<b>UNIT PRICE<br/>ЦЕНА ЗА ЕДИНИЦУ</b>', S['cell']),
    ]]
    for r in rows:
        data.append([
            Paragraph(str(fatura_no),                       S['cell']),
            Paragraph(str(r.get('sku', '') or ''),           S['cell']),
            Paragraph(str(r.get('name_en', '') or ''),       S['cell_l']),
            Paragraph(str(r.get('name_ru', '') or ''),       S['cell_l']),
            Paragraph(f"{float(r.get('price', 0) or 0):,.2f} TRY", S['cell']),
        ])

    tbl = Table(data, colWidths=[28 * mm, 26 * mm, 52 * mm, 52 * mm, 22 * mm],
                repeatRows=1)
    tbl.setStyle(TableStyle([
        ('BACKGROUND',      (0, 0), (-1, 0),  DARK_BLUE_PDF),
        ('TEXTCOLOR',       (0, 0), (-1, 0),  colors.white),
        ('GRID',            (0, 0), (-1, -1), 0.4, colors.grey),
        ('VALIGN',          (0, 0), (-1, -1), 'MIDDLE'),
        ('ROWBACKGROUNDS',  (0, 1), (-1, -1), [colors.white, ZEBRA_BLUE]),
        ('TOPPADDING',      (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING',   (0, 0), (-1, -1), 3),
    ]))
    elems.append(tbl)
    return elems


# ── ANA FONKSİYON ────────────────────────────────────────────────────────────
def generate_price_list_pdf_kz(rows, fatura_no):
    """
    Kazakistan Price List PDF üret.

    Args:
        rows: list[dict] — [{sku, name_en, name_ru, price}, ...]
        fatura_no: str — tüm satırlarda Invoice No olarak kullanılır

    Returns:
        bytes — PDF içeriği
    """
    _register_fonts()
    S = _styles()
    kase_path = _find_kase_path()

    # ── GEÇİŞ 1: sayfa sayısını say ──────────────────────────────────────────
    class _CountDoc(BaseDocTemplate):
        def __init__(self, *a, **kw):
            super().__init__(*a, **kw)
            self.total_pages = 0
        def afterPage(self):
            self.total_pages = self.page

    null_buf = io.BytesIO()
    counter = _CountDoc(
        null_buf, pagesize=A4,
        leftMargin=15 * mm, rightMargin=15 * mm,
        topMargin=10 * mm, bottomMargin=40 * mm,
    )
    count_frame = Frame(
        15 * mm, 40 * mm, A4[0] - 30 * mm, A4[1] - 50 * mm, id='n',
        leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
    )
    counter.addPageTemplates([PageTemplate(id='count', frames=[count_frame])])
    counter.build(_build_elements(rows, fatura_no, S))
    total_pages = max(counter.total_pages, 1)

    # ── GEÇİŞ 2: gerçek PDF — son sayfaya kaşe ───────────────────────────────
    def _on_page(canv, doc):
        canv.saveState()
        # Sayfa numarası — alt orta
        canv.setFont('DejaVu', 8)
        canv.setFillColor(colors.grey)
        canv.drawCentredString(
            A4[0] / 2, 15 * mm,
            f'Sayfa {doc.page} / {total_pages}',
        )
        # Kaşe — yalnızca son sayfada
        if doc.page == total_pages:
            if kase_path:
                try:
                    # Sağ alt köşe, ~45mm x 45mm
                    kase_w = 45 * mm
                    kase_h = 45 * mm
                    x = A4[0] - kase_w - 15 * mm
                    y = 8 * mm
                    canv.drawImage(
                        kase_path, x, y,
                        width=kase_w, height=kase_h,
                        mask='auto', preserveAspectRatio=True,
                    )
                except Exception:
                    # Resim yüklenemezse sessizce geç
                    pass
            else:
                # Kaşe yoksa placeholder çerçeve
                x, y = A4[0] - 55 * mm, 8 * mm
                canv.setStrokeColor(colors.HexColor('#C0C0C0'))
                canv.setFillColor(colors.HexColor('#FAFAFA'))
                canv.rect(x, y, 40 * mm, 25 * mm, fill=1, stroke=1)
                canv.setFont('DejaVu-Oblique', 9)
                canv.setFillColor(colors.grey)
                canv.drawCentredString(x + 20 * mm, y + 11 * mm, 'KAŞE')
        canv.restoreState()

    out_buf = io.BytesIO()
    doc = BaseDocTemplate(
        out_buf, pagesize=A4,
        leftMargin=15 * mm, rightMargin=15 * mm,
        topMargin=10 * mm, bottomMargin=40 * mm,
    )
    main_frame = Frame(
        15 * mm, 40 * mm, A4[0] - 30 * mm, A4[1] - 50 * mm, id='n',
        leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
    )
    doc.addPageTemplates([PageTemplate(id='main', frames=[main_frame], onPage=_on_page)])
    doc.build(_build_elements(rows, fatura_no, S))

    out_buf.seek(0)
    return out_buf.getvalue()

import json
import base64
import io
import os
import sys
import traceback

import pandas as pd
import openpyxl
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import column_index_from_string, get_column_letter
from openpyxl.drawing.image import Image as XLImage
from openpyxl.worksheet.page import PageMargins
from openpyxl.worksheet.properties import PageSetupProperties

# ── SABITLER ──────────────────────────────────────────────────────────────────
DARK_BLUE  = '1F3864'
MID_BLUE   = '2F5496'
LIGHT_BLUE = 'D6E4F0'
GOLD       = 'C9A84C'
LIGHT_GRAY = 'F2F2F2'
TL_FMT     = '₺#,##0.00'

EXCEPTION_SKUS = {
    '1SPOCA0029197.': 0.01,
    '1SPOCA0030197.': 0.01,
    '1SSARF1507139.': 0.01,
    '1SPOCA0027197.': 0.01,
    '1SPOCA0028169.': 0.01,
    '1SPOCA0030169.': 0.01,
    '1SPOCA0028197.': 0.01,
}

# Sırbistan sütun haritaları
INV_COLS = [
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

PL_COLS = [
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

# ── YARDIMCI ─────────────────────────────────────────────────────────────────
def brd(c='BFBFBF'):
    s = Side(style='thin', color=c)
    return Border(left=s, right=s, top=s, bottom=s)

def hdr(ws, r, col, val, bg=DARK_BLUE, fg='FFFFFF', bold=True, align='center', size=9):
    c = ws.cell(row=r, column=col, value=val)
    c.font = Font(name='Arial', bold=bold, color=fg, size=size)
    c.fill = PatternFill('solid', fgColor=bg)
    c.alignment = Alignment(horizontal=align, vertical='center', wrap_text=True)
    c.border = brd()
    return c

def dat(ws, r, col, val, bg='FFFFFF', bold=False, align='left', fmt=None):
    c = ws.cell(row=r, column=col, value=val)
    c.font = Font(name='Arial', bold=bold, color='000000', size=9)
    c.fill = PatternFill('solid', fgColor=bg)
    c.alignment = Alignment(horizontal=align, vertical='center', wrap_text=True)
    c.border = brd()
    if fmt: c.number_format = fmt
    return c

def parse_num(v):
    if v is None or v == '': return 0.0
    if isinstance(v, (int, float)):
        return float(v) if str(v) not in ['nan', 'inf'] else 0.0
    s = str(v).strip().replace(' ', '').replace('\u00a0', '')
    if '.' in s and ',' in s:
        s = s.replace('.', '').replace(',', '.')
    elif ',' in s:
        s = s.replace(',', '.')
    try: return float(s)
    except: return 0.0

# ── KG HESAPLAMA ─────────────────────────────────────────────────────────────
def calculate_weights(df, grup_kilolari, hedef_brut, exception_skus=None):
    if exception_skus is None:
        exception_skus = EXCEPTION_SKUS

    ham_list = []
    for _, row in df.iterrows():
        sku    = str(row.get('SKU', '')).strip()
        grup   = str(row.get('ÜRÜN ARA GRUBU', '')).strip()
        ag     = parse_num(row.get('Ürün Ağırlığı (KG)', 0))
        miktar = parse_num(row.get('Miktar', 0))

        if sku in exception_skus:
            kg = parse_num(exception_skus[sku])
        elif ag > 0:
            kg = ag
        else:
            kg = parse_num(grup_kilolari.get(grup, 0))

        ham_list.append(kg * miktar)

    ham_toplam = sum(ham_list)
    if ham_toplam <= 0:
        return [0.0]*len(ham_list), [0.0]*len(ham_list), 0.0

    carpan    = hedef_brut / ham_toplam
    brut_list = [h * carpan for h in ham_list]
    net_list  = [b * 0.9    for b in brut_list]
    return brut_list, net_list, ham_toplam

# ── BAŞLIK ───────────────────────────────────────────────────────────────────
def build_header(ws, sheet_title, fatura_no, fatura_date,
                 musteri, musteri_adres, col_count, logo_bytes=None):
    last_col = get_column_letter(col_count)

    col_widths = {'A':16,'B':14,'C':14,'D':18,'E':33,'F':6,'G':7,'H':26,'I':22}
    for col, w in col_widths.items():
        if column_index_from_string(col) <= col_count:
            ws.column_dimensions[col].width = w

    # Satır 1: Logo
    ws.row_dimensions[1].height = 27.0
    ws.merge_cells(f'A1:{last_col}1')
    ws['A1'].fill = PatternFill('solid', fgColor='FFFFFF')
    if logo_bytes:
        try:
            img = XLImage(io.BytesIO(logo_bytes))
            img.width, img.height = 240, 22
            ws.add_image(img, 'E1')
        except: pass

    # Satır 2: Başlık
    ws.row_dimensions[2].height = 28.0
    ws.merge_cells(f'A2:{last_col}2')
    c = ws['A2']
    c.value = sheet_title
    c.font = Font(name='Arial', bold=True, size=14, color='FFFFFF')
    c.fill = PatternFill('solid', fgColor=DARK_BLUE)
    c.alignment = Alignment(horizontal='center', vertical='center')

    # Satırlar 3-8
    for i in range(3, 9):
        ws.row_dimensions[i].height = 22

    def info_label(r, txt):
        c = ws.cell(row=r, column=8, value=txt)
        c.font = Font(name='Arial', bold=True, color='FFFFFF', size=9)
        c.fill = PatternFill('solid', fgColor=MID_BLUE)
        c.alignment = Alignment(horizontal='left', vertical='center', wrap_text=True)
        c.border = brd()

    def info_val(r, val, bold=False):
        c = ws.cell(row=r, column=9, value=val)
        c.font = Font(name='Arial', bold=bold, color='000000', size=9)
        c.fill = PatternFill('solid', fgColor=LIGHT_BLUE)
        c.alignment = Alignment(horizontal='left', vertical='center', wrap_text=True)
        c.border = brd()

    # Satır 3: EXPORTER | INVOICE DATE
    ws.merge_cells('A3:G3')
    hdr(ws, 3, 1, 'EXPORTER :', bg=MID_BLUE, align='left')
    info_label(3, 'INVOICE DATE :')
    info_val(3, str(fatura_date), bold=True)

    # Satır 4-5: Şirket | INVOICE NO + PACKAGES
    ws.row_dimensions[4].height = 32
    ws.merge_cells('A4:G5')
    c = ws['A4']
    c.value = ('DEHA MAGAZACILIK EV TEKSTILI URUNLERI SAN. VE TIC. A.S.\n'
               'Mecidiyeköy Mah. Oğuz Sok Rönesans Biz İş Merkezi No:4/14 K:4 34387 Şişli/İstanbul')
    c.font = Font(name='Arial', size=8, color='000000')
    c.alignment = Alignment(horizontal='left', vertical='center', wrap_text=True)
    c.fill = PatternFill('solid', fgColor=LIGHT_GRAY)
    c.border = brd()
    info_label(4, 'INVOICE NO :')
    info_val(4, fatura_no, bold=True)
    info_label(5, 'PACKAGES :')
    info_val(5, '')

    # Satır 6: IMPORTER | DESTINATION
    ws.merge_cells('A6:G6')
    hdr(ws, 6, 1, 'IMPORTER :', bg=MID_BLUE, align='left')
    info_label(6, 'DESTINATION :')
    info_val(6, 'SERBIA', bold=True)

    # Satır 7-8: Müşteri | EXPORTATION + INCOTERM
    ws.row_dimensions[7].height = 32
    ws.merge_cells('A7:G8')
    c = ws['A7']
    c.value = f'{musteri}\n{musteri_adres}'
    c.font = Font(name='Arial', size=9, color='000000')
    c.alignment = Alignment(horizontal='left', vertical='center', wrap_text=True)
    c.fill = PatternFill('solid', fgColor=LIGHT_GRAY)
    c.border = brd()
    info_label(7, 'COUNTRY OF EXPORTATION :')
    info_val(7, 'TURKEY')
    info_label(8, 'INCOTERM :')
    info_val(8, 'CIP')

def build_footer(ws, footer_start, col_count):
    last_col = get_column_letter(col_count)
    for r in range(footer_start, footer_start + 3):
        ws.row_dimensions[r].height = 18

    ws.merge_cells(f'A{footer_start}:{last_col}{footer_start}')
    c = ws.cell(row=footer_start, column=1)
    c.value = 'DEHA MAGAZACILIK EV TEKSTILI URUNLERI SAN. VE TIC. A.S.'
    c.font = Font(name='Arial', bold=True, color='FFFFFF', size=9)
    c.fill = PatternFill('solid', fgColor=DARK_BLUE)
    c.alignment = Alignment(horizontal='center', vertical='center')
    c.border = brd()

    ws.merge_cells(f'A{footer_start+1}:{last_col}{footer_start+1}')
    c = ws.cell(row=footer_start+1, column=1)
    c.value = 'Mecidiyeköy Mah. Oğuz Sok Rönesans Biz İş Merkezi No:4/14 K:4 34387 Şişli/İstanbul'
    c.font = Font(name='Arial', color='000000', size=8)
    c.fill = PatternFill('solid', fgColor=LIGHT_BLUE)
    c.alignment = Alignment(horizontal='center', vertical='center')
    c.border = brd()

    ws.merge_cells(f'A{footer_start+2}:{last_col}{footer_start+2}')
    c = ws.cell(row=footer_start+2, column=1)
    c.value = 'Tel: +90 212 000 00 00  |  E-mail: info@deha.com.tr  |  www.deha.com.tr'
    c.font = Font(name='Arial', bold=True, color='FFFFFF', size=8)
    c.fill = PatternFill('solid', fgColor=MID_BLUE)
    c.alignment = Alignment(horizontal='center', vertical='center')
    c.border = brd()

def set_print(ws, print_area, col_count):
    ws.print_area = print_area
    ws.page_setup.paperSize   = ws.PAPERSIZE_A4
    ws.page_setup.orientation = ws.ORIENTATION_PORTRAIT
    ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
    ws.page_setup.fitToWidth  = 1
    ws.page_setup.fitToHeight = 0
    ws.page_margins = PageMargins(
        left=0.5, right=0.5, top=0.75, bottom=0.75, header=0.3, footer=0.3)
    ws.print_title_rows = '1:2'

# ── EXCEL ÜRET ───────────────────────────────────────────────────────────────
def generate_excel(df, grup_kilolari, hedef_brut, exception_skus, logo_bytes):
    # Temizlik
    df['Birim Cinsi (1)'] = df['Birim Cinsi (1)'].apply(
        lambda x: 'PCS' if str(x).strip() == 'AD' else x)
    df['GTİP'] = df['GTİP'].apply(
        lambda x: str(int(x)) if pd.notna(x) and str(x).strip() not in ['','nan'] else '')
    df['Asorti Barkodu'] = df['Asorti Barkodu'].apply(
        lambda x: str(int(x)) if pd.notna(x) and str(x).strip() not in ['','nan'] else '')

    fatura_no    = str(df['E-Fatura Seri Numarası'].iloc[0]).strip()
    fatura_date  = df['Fatura Tarihi'].iloc[0]
    if hasattr(fatura_date, 'date'): fatura_date = fatura_date.date()
    musteri      = str(df['Müşteri Firma Adı'].iloc[0]).strip()
    musteri_adres= 'Gospodar Jovanova 73, Belgrade'

    brut_list, net_list, ham_toplam = calculate_weights(
        df, grup_kilolari, hedef_brut, exception_skus)

    wb = Workbook()
    DATA_START = 9

    # ── INV SHEET ─────────────────────────────────────────────────────────────
    ws_inv = wb.active
    ws_inv.title = 'INV'

    build_header(ws_inv, 'COMMERCIAL INVOICE', fatura_no, fatura_date,
                 musteri, musteri_adres, len(INV_COLS), logo_bytes)

    ws_inv.row_dimensions[DATA_START].height = 35
    for i, (hd, _) in enumerate(INV_COLS):
        hdr(ws_inv, DATA_START, i+1, hd, bg=DARK_BLUE, size=9, align='center')

    for r_idx, (_, row) in enumerate(df.iterrows()):
        er = DATA_START + 1 + r_idx
        ws_inv.row_dimensions[er].height = None
        bg = 'FFFFFF' if r_idx % 2 == 0 else 'EBF3FB'

        for c_idx, (out_col, src_col) in enumerate(INV_COLS):
            col_num = c_idx + 1
            if src_col == '__CALC__':
                val = round(parse_num(row.get('Miktar',0)) * parse_num(row.get('Fiyat',0)), 2)
                dat(ws_inv, er, col_num, val, bg=bg, align='right', fmt=TL_FMT)
            elif out_col == 'QTY':
                dat(ws_inv, er, col_num, parse_num(row.get(src_col,0)), bg=bg, align='right', fmt='#,##0')
            elif out_col == 'UNIT PRICE':
                dat(ws_inv, er, col_num, parse_num(row.get(src_col,0)), bg=bg, align='right', fmt=TL_FMT)
            elif out_col in ('MASTER ITEM CODE','HS CODE'):
                dat(ws_inv, er, col_num, str(row.get(src_col,'') or ''), bg=bg, align='left')
            else:
                dat(ws_inv, er, col_num, row.get(src_col,''), bg=bg, align='left')

    last_inv = DATA_START + len(df)
    tr, fr, ir, gr = last_inv+1, last_inv+2, last_inv+3, last_inv+4
    for r in [tr, fr, ir, gr]: ws_inv.row_dimensions[r].height = 22
    ws_inv.row_dimensions[gr].height = 28

    H, I = 8, 9
    ws_inv.merge_cells(f'A{tr}:G{tr}')
    c = ws_inv.cell(row=tr, column=H, value='TOTAL')
    c.font=Font(name='Arial',bold=True,color='FFFFFF',size=10)
    c.fill=PatternFill('solid',fgColor=DARK_BLUE)
    c.alignment=Alignment(horizontal='center',vertical='center')
    c.border=brd()
    c = ws_inv.cell(row=tr, column=I, value=f'=SUM(I{DATA_START+1}:I{last_inv})')
    c.font=Font(name='Arial',bold=True,color='FFFFFF',size=10)
    c.fill=PatternFill('solid',fgColor=DARK_BLUE)
    c.alignment=Alignment(horizontal='right',vertical='center')
    c.number_format=TL_FMT; c.border=brd()

    ws_inv.merge_cells(f'A{fr}:G{fr}')
    dat(ws_inv,fr,H,'FREIGHT',bold=True,align='center')
    dat(ws_inv,fr,I,0,fmt=TL_FMT,align='right')

    ws_inv.merge_cells(f'A{ir}:G{ir}')
    dat(ws_inv,ir,H,'INSURANCE',bold=True,align='center')
    dat(ws_inv,ir,I,0,fmt=TL_FMT,align='right')

    ws_inv.merge_cells(f'A{gr}:G{gr}')
    c=ws_inv.cell(row=gr,column=H,value='GRAND TOTAL')
    c.font=Font(name='Arial',bold=True,color='FFFFFF',size=11)
    c.fill=PatternFill('solid',fgColor=GOLD)
    c.alignment=Alignment(horizontal='center',vertical='center')
    c.border=brd()
    c=ws_inv.cell(row=gr,column=I,value=f'=I{tr}+I{fr}+I{ir}')
    c.font=Font(name='Arial',bold=True,color='FFFFFF',size=11)
    c.fill=PatternFill('solid',fgColor=GOLD)
    c.alignment=Alignment(horizontal='right',vertical='center')
    c.number_format=TL_FMT; c.border=brd()

    build_footer(ws_inv, gr+2, len(INV_COLS))
    set_print(ws_inv, f'A1:I{gr}', len(INV_COLS))

    # ── PL SHEET ──────────────────────────────────────────────────────────────
    ws_pl = wb.create_sheet('PL')
    pl_widths = {'A':16,'B':14,'C':14,'D':18,'E':33,'F':6,'G':7,'H':14,'I':14}
    for col, w in pl_widths.items():
        ws_pl.column_dimensions[col].width = w

    build_header(ws_pl, 'PACKING LIST', fatura_no, fatura_date,
                 musteri, musteri_adres, len(PL_COLS), logo_bytes)

    ws_pl.row_dimensions[DATA_START].height = 35
    for i, (hd, _) in enumerate(PL_COLS):
        hdr(ws_pl, DATA_START, i+1, hd, bg=DARK_BLUE, size=9, align='center')

    for r_idx, (_, row) in enumerate(df.iterrows()):
        er = DATA_START + 1 + r_idx
        ws_pl.row_dimensions[er].height = None
        bg = 'FFFFFF' if r_idx % 2 == 0 else 'EBF3FB'

        for c_idx, (out_col, src_col) in enumerate(PL_COLS):
            col_num = c_idx + 1
            if src_col == '__BRUT__':
                dat(ws_pl, er, col_num, round(brut_list[r_idx],4), bg=bg, align='right', fmt='#,##0.0000')
            elif src_col == '__NET__':
                dat(ws_pl, er, col_num, round(net_list[r_idx],4), bg=bg, align='right', fmt='#,##0.0000')
            elif out_col == 'QTY':
                dat(ws_pl, er, col_num, parse_num(row.get(src_col,0)), bg=bg, align='right', fmt='#,##0')
            elif out_col == 'MASTER ITEM CODE':
                dat(ws_pl, er, col_num, str(row.get(src_col,'') or ''), bg=bg, align='left')
            else:
                dat(ws_pl, er, col_num, row.get(src_col,''), bg=bg, align='left')

    last_pl = DATA_START + len(df)
    pl_tr, pl_gr = last_pl+1, last_pl+2
    for r in [pl_tr, pl_gr]: ws_pl.row_dimensions[r].height = 22
    ws_pl.row_dimensions[pl_gr].height = 28

    G, H2, I2 = 7, 8, 9
    ws_pl.merge_cells(f'A{pl_tr}:F{pl_tr}')
    for col_n, fmt in [(G,'#,##0'),(H2,'#,##0.0000'),(I2,'#,##0.0000')]:
        src_r = DATA_START+1
        end_r = last_pl
        col_l = get_column_letter(col_n)
        c = ws_pl.cell(row=pl_tr, column=col_n, value=f'=SUM({col_l}{src_r}:{col_l}{end_r})')
        c.font=Font(name='Arial',bold=True,color='FFFFFF',size=10)
        c.fill=PatternFill('solid',fgColor=DARK_BLUE)
        c.alignment=Alignment(horizontal='right',vertical='center')
        c.number_format=fmt; c.border=brd()

    ws_pl.merge_cells(f'A{pl_gr}:F{pl_gr}')
    for col_n, fmt in [(G,'#,##0'),(H2,'#,##0.0000'),(I2,'#,##0.0000')]:
        col_l = get_column_letter(col_n)
        c = ws_pl.cell(row=pl_gr, column=col_n, value=f'={col_l}{pl_tr}')
        c.font=Font(name='Arial',bold=True,color='FFFFFF',size=11)
        c.fill=PatternFill('solid',fgColor=GOLD)
        c.alignment=Alignment(horizontal='right',vertical='center')
        c.number_format=fmt; c.border=brd()

    build_footer(ws_pl, pl_gr+2, len(PL_COLS))
    set_print(ws_pl, f'A1:I{pl_gr}', len(PL_COLS))

    # ── BYTES OLARAK DÖNDÜR ───────────────────────────────────────────────────
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.getvalue(), fatura_no

# ── VERCEL HANDLER ────────────────────────────────────────────────────────────
def handler(request):
    """Vercel Python serverless function handler."""
    if request.method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
            },
            'body': ''
        }

    if request.method != 'POST':
        return {'statusCode': 405, 'body': 'Method not allowed'}

    try:
        body = json.loads(request.body)

        # Excel dosyasını base64'ten decode et
        excel_b64   = body.get('excel', '')
        excel_bytes = base64.b64decode(excel_b64)

        # Logo base64
        logo_b64   = body.get('logo', '')
        logo_bytes = base64.b64decode(logo_b64) if logo_b64 else None

        # Parametreler
        hedef_brut    = float(body.get('hedefBrut', 0))
        grup_kilolari = body.get('grupKilolari', {})
        exception_skus= body.get('exceptionSkus', EXCEPTION_SKUS)

        # DataFrame oluştur
        df = pd.read_excel(io.BytesIO(excel_bytes))

        # Excel üret
        excel_out, fatura_no = generate_excel(
            df, grup_kilolari, hedef_brut, exception_skus, logo_bytes)

        # Base64 olarak döndür
        result_b64 = base64.b64encode(excel_out).decode('utf-8')

        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json',
            },
            'body': json.dumps({
                'success': True,
                'excel':   result_b64,
                'faturaNo': fatura_no,
            })
        }

    except Exception as e:
        return {
            'statusCode': 500,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'success': False, 'error': str(e), 'trace': traceback.format_exc()})
        }

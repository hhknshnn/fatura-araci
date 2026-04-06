from http.server import BaseHTTPRequestHandler
import json
import base64
import io
import re
import traceback
import pdfplumber

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

def parse_pdf(pdf_bytes):
    """PDF'den NAVLUN, SİG, KAP değerlerini çek."""
    result = {'navlun': 0.0, 'sigorta': 0.0, 'kap': ''}
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            last_page = pdf.pages[-1]
            text = last_page.extract_text() or ''
            m = re.search(r'NAVLUN:\s*TRY\s*([\d.,]+)', text)
            if m: result['navlun'] = float(m.group(1).replace('.','').replace(',','.'))
            m = re.search(r'S[\u0130I]G\.:\s*TRY\s*([\d.,]+)', text)
            if m: result['sigorta'] = float(m.group(1).replace('.','').replace(',','.'))
            m = re.search(r'KAP:\s*(\d+)', text)
            if m: result['kap'] = m.group(1)
    except Exception as e:
        pass
    return result

def parse_num(v):
    if v is None or v == '': return 0.0
    if isinstance(v, (int, float)):
        return float(v) if str(v) not in ['nan','inf'] else 0.0
    s = str(v).strip().replace(' ','').replace('\u00a0','')
    if '.' in s and ',' in s:
        s = s.replace('.','').replace(',','.')
    elif ',' in s:
        s = s.replace(',','.')
    try: return float(s)
    except: return 0.0

def calculate_weights(df, grup_kilolari, hedef_brut, exception_skus):
    ham_list = []
    for _, row in df.iterrows():
        sku    = str(row.get('SKU','')).strip()
        grup   = str(row.get('ÜRÜN ARA GRUBU','')).strip()
        ag     = parse_num(row.get('Ürün Ağırlığı (KG)',0))
        miktar = parse_num(row.get('Miktar',0))
        if sku in exception_skus:
            kg = parse_num(exception_skus[sku])
        elif ag > 0:
            kg = ag
        else:
            kg = parse_num(grup_kilolari.get(grup,0))
        ham_list.append(kg * miktar)
    ham_toplam = sum(ham_list)
    if ham_toplam <= 0:
        return [0.0]*len(ham_list), [0.0]*len(ham_list)
    carpan = hedef_brut / ham_toplam

    # Orantılı dağıtım: ilk N-1 satır yuvarlanır, son satıra kalan fark verilir
    # Bu sayede toplam tam olarak hedef_brut'a eşit olur
    brut_list = []
    toplam_yuvarlanmis = 0.0
    for i, h in enumerate(ham_list):
        if i < len(ham_list) - 1:
            val = round(h * carpan, 2)
            brut_list.append(val)
            toplam_yuvarlanmis += val
        else:
            # Son satır: hedeften önceki toplamı çıkar
            brut_list.append(round(hedef_brut - toplam_yuvarlanmis, 2))

    net_list = [round(b * 0.9, 2) for b in brut_list]
    return brut_list, net_list

def build_header(ws, sheet_title, fatura_no, fatura_date, musteri, musteri_adres, col_count, logo_bytes=None, pdf_fields=None):
    last_col = get_column_letter(col_count)
    col_widths = {'A':16,'B':14,'C':14,'D':18,'E':33,'F':6,'G':7,'H':26,'I':22,'J':13,'K':12,'L':16,'M':9,'N':9,'O':10}
    for col, w in col_widths.items():
        if column_index_from_string(col) <= col_count:
            ws.column_dimensions[col].width = w

    ws.row_dimensions[1].height = 27.0
    ws.merge_cells(f'A1:{last_col}1')
    ws['A1'].fill = PatternFill('solid', fgColor='FFFFFF')
    if logo_bytes:
        try:
            from PIL import Image as PILImage
            import numpy as np
            pil_img = PILImage.open(io.BytesIO(logo_bytes))
            # Beyaz boşlukları kırp
            arr = np.array(pil_img.convert('RGB'))
            mask = (arr < 240).any(axis=2)
            rows = np.any(mask, axis=1)
            cols = np.any(mask, axis=0)
            if rows.any() and cols.any():
                rmin,rmax = np.where(rows)[0][[0,-1]]
                cmin,cmax = np.where(cols)[0][[0,-1]]
                pad = 10
                pil_img = pil_img.crop((
                    max(0,cmin-pad), max(0,rmin-pad),
                    min(arr.shape[1],cmax+pad), min(arr.shape[0],rmax+pad)
                ))
            # Geçici dosya yerine BytesIO kullan
            logo_buf = io.BytesIO()
            pil_img.save(logo_buf, format='PNG')
            logo_buf.seek(0)
            img = XLImage(logo_buf)
            img.width, img.height = 240, 22
            ws.add_image(img, 'E1')
        except Exception as e:
            pass

    ws.row_dimensions[2].height = 28.0
    ws.merge_cells('A2:I2')
    c = ws['A2']
    c.value = sheet_title
    c.font = Font(name='Arial', bold=True, size=14, color='FFFFFF')
    c.fill = PatternFill('solid', fgColor=DARK_BLUE)
    c.alignment = Alignment(horizontal='center', vertical='center')
    # J-O beyaz
    for col_idx in range(10, column_index_from_string(last_col)+1):
        ws.cell(row=2, column=col_idx).fill = PatternFill('solid', fgColor='FFFFFF')

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

    ws.merge_cells('A3:G3')
    hdr(ws, 3, 1, 'EXPORTER :', bg=MID_BLUE, align='left')
    info_label(3, 'INVOICE DATE :')
    info_val(3, str(fatura_date), bold=True)

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
    info_val(5, str(pdf_fields.get('kap','')) if pdf_fields else '')

    ws.merge_cells('A6:G6')
    hdr(ws, 6, 1, 'IMPORTER :', bg=MID_BLUE, align='left')
    info_label(6, 'DESTINATION :')
    info_val(6, 'SERBIA', bold=True)

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
    for r in range(footer_start, footer_start+3):
        ws.row_dimensions[r].height = 18

    # Her zaman A:I birleştir, J ve sonrası beyaz
    for r in range(footer_start, footer_start+3):
        for col_idx in range(10, col_count+1):
            ws.cell(row=r, column=col_idx).fill = PatternFill('solid', fgColor='FFFFFF')

    ws.merge_cells(f'A{footer_start}:I{footer_start}')
    c = ws.cell(row=footer_start, column=1)
    c.value = 'DEHA MAGAZACILIK EV TEKSTILI URUNLERI SAN. VE TIC. A.S.'
    c.font = Font(name='Arial', bold=True, color='FFFFFF', size=9)
    c.fill = PatternFill('solid', fgColor=DARK_BLUE)
    c.alignment = Alignment(horizontal='center', vertical='center')
    c.border = brd()
    ws.merge_cells(f'A{footer_start+1}:I{footer_start+1}')
    c = ws.cell(row=footer_start+1, column=1)
    c.value = 'Mecidiyeköy Mah. Oğuz Sok Rönesans Biz İş Merkezi No:4/14 K:4 34387 Şişli/İstanbul'
    c.font = Font(name='Arial', color='000000', size=8)
    c.fill = PatternFill('solid', fgColor=LIGHT_BLUE)
    c.alignment = Alignment(horizontal='center', vertical='center')
    c.border = brd()
    ws.merge_cells(f'A{footer_start+2}:I{footer_start+2}')
    c = ws.cell(row=footer_start+2, column=1)
    c.value = 'Tel: +90 212 000 00 00  |  E-mail: info@deha.com.tr  |  www.deha.com.tr'
    c.font = Font(name='Arial', bold=True, color='FFFFFF', size=8)
    c.fill = PatternFill('solid', fgColor=MID_BLUE)
    c.alignment = Alignment(horizontal='center', vertical='center')
    c.border = brd()

def set_print(ws, print_area):
    ws.print_area = print_area
    ws.page_setup.paperSize   = ws.PAPERSIZE_A4
    ws.page_setup.orientation = ws.ORIENTATION_PORTRAIT
    ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
    ws.page_setup.fitToWidth  = 1
    ws.page_setup.fitToHeight = 0
    ws.page_margins = PageMargins(left=0.5, right=0.5, top=0.75, bottom=0.75, header=0.3, footer=0.3)
    ws.print_title_rows = '1:2'

def generate_excel(df, grup_kilolari, hedef_brut, exception_skus, logo_bytes, pdf_fields=None, hedef_net=0, depo_tipi='serbest'):
    df['Birim Cinsi (1)'] = df['Birim Cinsi (1)'].apply(
        lambda x: 'PCS' if str(x).strip()=='AD' else x)
    df['GTİP'] = df['GTİP'].apply(
        lambda x: str(int(x)) if pd.notna(x) and str(x).strip() not in ['','nan'] else '')
    df['Asorti Barkodu'] = df['Asorti Barkodu'].apply(
        lambda x: str(int(x)) if pd.notna(x) and str(x).strip() not in ['','nan'] else '')

    fatura_no    = str(df['E-Fatura Seri Numarası'].iloc[0]).strip()
    fatura_date  = df['Fatura Tarihi'].iloc[0]
    if hasattr(fatura_date,'date'): fatura_date = fatura_date.date()
    musteri      = str(df['Müşteri Firma Adı'].iloc[0]).strip()
    musteri_adres= 'Gospodar Jovanova 73, Belgrade'

    if pdf_fields is None: pdf_fields = {'navlun': 0.0, 'sigorta': 0.0, 'kap': ''}
    brut_list, net_list = calculate_weights(df, grup_kilolari, hedef_brut, exception_skus)

    # Antrepo: hedef NET girilmişse orantılı dağıt (son satıra kalan fark verilir)
    if depo_tipi == 'antrepo' and hedef_net > 0:
        toplam_brut = sum(brut_list)
        if toplam_brut > 0:
            net_list = []
            toplam_yuvarlanmis_net = 0.0
            for i, b in enumerate(brut_list):
                if i < len(brut_list) - 1:
                    val = round((b / toplam_brut) * hedef_net, 2)
                    net_list.append(val)
                    toplam_yuvarlanmis_net += val
                else:
                    net_list.append(round(hedef_net - toplam_yuvarlanmis_net, 2))

    wb = Workbook()
    DS = 9  # DATA_START

    # INV
    ws_inv = wb.active
    ws_inv.title = 'INV'
    build_header(ws_inv,'COMMERCIAL INVOICE',fatura_no,fatura_date,musteri,musteri_adres,len(INV_COLS),logo_bytes,pdf_fields)
    ws_inv.row_dimensions[DS].height = 35
    for i,(hd,_) in enumerate(INV_COLS):
        hdr(ws_inv,DS,i+1,hd,bg=DARK_BLUE,size=9,align='center')
    for r_idx,(_,row) in enumerate(df.iterrows()):
        er=DS+1+r_idx; ws_inv.row_dimensions[er].height=None
        bg='FFFFFF' if r_idx%2==0 else 'EBF3FB'
        for c_idx,(out_col,src_col) in enumerate(INV_COLS):
            cn=c_idx+1
            if src_col=='__CALC__':
                dat(ws_inv,er,cn,round(parse_num(row.get('Miktar',0))*parse_num(row.get('Fiyat',0)),2),bg=bg,align='right',fmt=TL_FMT)
            elif out_col=='QTY':
                dat(ws_inv,er,cn,parse_num(row.get(src_col,0)),bg=bg,align='right',fmt='#,##0')
            elif out_col=='UNIT PRICE':
                dat(ws_inv,er,cn,parse_num(row.get(src_col,0)),bg=bg,align='right',fmt=TL_FMT)
            elif out_col in('MASTER ITEM CODE','HS CODE'):
                dat(ws_inv,er,cn,str(row.get(src_col,'') or ''),bg=bg,align='left')
            else:
                dat(ws_inv,er,cn,row.get(src_col,''),bg=bg,align='left')

    last_inv=DS+len(df)
    tr,fr,ir,gr=last_inv+1,last_inv+2,last_inv+3,last_inv+4
    for r in[tr,fr,ir,gr]: ws_inv.row_dimensions[r].height=22
    ws_inv.row_dimensions[gr].height=28
    H,I=8,9
    ws_inv.merge_cells(f'A{tr}:G{tr}')
    c=ws_inv.cell(row=tr,column=H,value='TOTAL')
    c.font=Font(name='Arial',bold=True,color='FFFFFF',size=10)
    c.fill=PatternFill('solid',fgColor=DARK_BLUE)
    c.alignment=Alignment(horizontal='center',vertical='center'); c.border=brd()
    c=ws_inv.cell(row=tr,column=I,value=f'=SUM(I{DS+1}:I{last_inv})')
    c.font=Font(name='Arial',bold=True,color='FFFFFF',size=10)
    c.fill=PatternFill('solid',fgColor=DARK_BLUE)
    c.alignment=Alignment(horizontal='right',vertical='center')
    c.number_format=TL_FMT; c.border=brd()
    ws_inv.merge_cells(f'A{fr}:G{fr}')
    dat(ws_inv,fr,H,'FREIGHT',bold=True,align='center')
    dat(ws_inv,fr,I,float(pdf_fields.get('navlun',0)),fmt=TL_FMT,align='right')
    ws_inv.merge_cells(f'A{ir}:G{ir}')
    dat(ws_inv,ir,H,'INSURANCE',bold=True,align='center')
    dat(ws_inv,ir,I,float(pdf_fields.get('sigorta',0)),fmt=TL_FMT,align='right')
    ws_inv.merge_cells(f'A{gr}:G{gr}')
    c=ws_inv.cell(row=gr,column=H,value='GRAND TOTAL')
    c.font=Font(name='Arial',bold=True,color='FFFFFF',size=11)
    c.fill=PatternFill('solid',fgColor=GOLD)
    c.alignment=Alignment(horizontal='center',vertical='center'); c.border=brd()
    c=ws_inv.cell(row=gr,column=I,value=f'=I{tr}+I{fr}+I{ir}')
    c.font=Font(name='Arial',bold=True,color='FFFFFF',size=11)
    c.fill=PatternFill('solid',fgColor=GOLD)
    c.alignment=Alignment(horizontal='right',vertical='center')
    c.number_format=TL_FMT; c.border=brd()
    build_footer(ws_inv,gr+1,len(INV_COLS))
    set_print(ws_inv,f'A1:I{gr}')

    # PL
    ws_pl=wb.create_sheet('PL')
    pl_widths={'A':16,'B':14,'C':14,'D':18,'E':33,'F':6,'G':7,'H':14,'I':14}
    for col,w in pl_widths.items(): ws_pl.column_dimensions[col].width=w
    build_header(ws_pl,'PACKING LIST',fatura_no,fatura_date,musteri,musteri_adres,len(PL_COLS),logo_bytes)
    ws_pl.row_dimensions[DS].height=35
    for i,(hd,_) in enumerate(PL_COLS):
        hdr(ws_pl,DS,i+1,hd,bg=DARK_BLUE,size=9,align='center')
    for r_idx,(_,row) in enumerate(df.iterrows()):
        er=DS+1+r_idx; ws_pl.row_dimensions[er].height=None
        bg='FFFFFF' if r_idx%2==0 else 'EBF3FB'
        for c_idx,(out_col,src_col) in enumerate(PL_COLS):
            cn=c_idx+1
            if src_col=='__BRUT__':
                dat(ws_pl,er,cn,round(brut_list[r_idx],2),bg=bg,align='right',fmt='#,##0.00')
            elif src_col=='__NET__':
                dat(ws_pl,er,cn,round(net_list[r_idx],2),bg=bg,align='right',fmt='#,##0.00')
            elif out_col=='QTY':
                dat(ws_pl,er,cn,parse_num(row.get(src_col,0)),bg=bg,align='right',fmt='#,##0')
            elif out_col=='MASTER ITEM CODE':
                dat(ws_pl,er,cn,str(row.get(src_col,'') or ''),bg=bg,align='left')
            else:
                dat(ws_pl,er,cn,row.get(src_col,''),bg=bg,align='left')

    last_pl=DS+len(df)
    pl_gr=last_pl+1  # Sadece GRAND TOTAL, mavi satır yok
    ws_pl.row_dimensions[pl_gr].height=28
    ws_pl.merge_cells(f'A{pl_gr}:F{pl_gr}')
    c=ws_pl.cell(row=pl_gr,column=1,value='GRAND TOTAL')
    c.font=Font(name='Arial',bold=True,color='FFFFFF',size=11)
    c.fill=PatternFill('solid',fgColor=GOLD)
    c.alignment=Alignment(horizontal='center',vertical='center'); c.border=brd()
    for cn,fmt in[(7,'#,##0'),(8,'#,##0.00'),(9,'#,##0.00')]:
        cl=get_column_letter(cn)
        c=ws_pl.cell(row=pl_gr,column=cn,value=f'=SUM({cl}{DS+1}:{cl}{last_pl})')
        c.font=Font(name='Arial',bold=True,color='FFFFFF',size=11)
        c.fill=PatternFill('solid',fgColor=GOLD)
        c.alignment=Alignment(horizontal='right',vertical='center')
        c.number_format=fmt; c.border=brd()
    build_footer(ws_pl,pl_gr+1,len(PL_COLS))
    set_print(ws_pl,f'A1:I{pl_gr}')

    # Excel açılınca formüllerin otomatik hesaplanmasını zorla
    from openpyxl.worksheet.properties import WorksheetProperties
    for sheet in wb.worksheets:
        sheet.sheet_properties.enableFormatConditionsCalculation = True
    wb.calculation.calcMode = 'auto'

    buf=io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.getvalue(), fatura_no

# ── VERCEL HANDLER ────────────────────────────────────────────────────────────
class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin','*')
        self.send_header('Access-Control-Allow-Headers','Content-Type')
        self.send_header('Access-Control-Allow-Methods','POST, OPTIONS')
        self.end_headers()

    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body   = json.loads(self.rfile.read(length))

            excel_bytes   = base64.b64decode(body.get('excel',''))
            logo_b64      = body.get('logo','')
            logo_bytes    = base64.b64decode(logo_b64) if logo_b64 else None
            hedef_brut    = float(body.get('hedefBrut', 0))
            hedef_net     = float(body.get('hedefNet', 0))
            depo_tipi     = body.get('depoTipi', 'serbest')
            grup_kilolari = body.get('grupKilolari', {})
            exception_skus= body.get('exceptionSkus', EXCEPTION_SKUS)

            # PDF parse
            pdf_b64   = body.get('pdf', '')
            pdf_fields = {'navlun': 0.0, 'sigorta': 0.0, 'kap': ''}
            if pdf_b64:
                pdf_bytes_data = base64.b64decode(pdf_b64)
                pdf_fields = parse_pdf(pdf_bytes_data)

            df = pd.read_excel(io.BytesIO(excel_bytes))
            excel_out, fatura_no = generate_excel(
                df, grup_kilolari, hedef_brut, exception_skus, logo_bytes, pdf_fields,
                hedef_net=hedef_net, depo_tipi=depo_tipi)

            result = json.dumps({
                'success':   True,
                'excel':     base64.b64encode(excel_out).decode('utf-8'),
                'faturaNo':  fatura_no,
                'pdfFields': pdf_fields,
            })
            self.send_response(200)
            self.send_header('Content-Type','application/json')
            self.send_header('Access-Control-Allow-Origin','*')
            self.end_headers()
            self.wfile.write(result.encode('utf-8'))

        except Exception as e:
            err = json.dumps({'success':False,'error':str(e),'trace':traceback.format_exc()})
            self.send_response(500)
            self.send_header('Content-Type','application/json')
            self.send_header('Access-Control-Allow-Origin','*')
            self.end_headers()
            self.wfile.write(err.encode('utf-8'))
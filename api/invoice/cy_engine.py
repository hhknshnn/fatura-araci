"""
Kıbrıs özel engine — INV YOK, sadece PL üretilir.
1-3 fatura alır, tek PL çıktısı üretir.
"""
import base64
import io

import openpyxl
import pandas as pd
import pdfplumber

from .constants import DARK_BLUE, GOLD, CY_PL_COLS
from .helpers   import hdr, dat, parse_num, sku_grupla, set_print, brd
from .weights   import calculate_weights, get_net_list
from .templates import find_cy_template_path, apply_cy_header

from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils  import get_column_letter

DS = 9   # Data start satırı

# INV belgesinde silinecek kolonlar (IHR ve ANT fatura tipine göre değişir)
_INV_DELETE_COLS_ORTAK = [
    'Açıklama',
    'Renk Açıkmalası EN',
    'Ürün Açıklaması EN',
    'Ürün Ana Grubu - EN',
    'Ürün Ara Grubu - EN',
    'MATERYAL -EN',
    'MENŞEİ -EN',
    'MATERYAL Açıklama',
    'ALT GRUBU -EN',
    'EBAT DETAY Açıklama',
    'MATERYAL -RU',
    'Ürün Ana Grubu - RU',
    'Ürün Ara Grubu - RU',
    'ALT GRUBU -RU',
    'Ürün Açıklaması RU',
    'MENŞEİ -RU',
    'Ürün Açıklaması XS',
    'Renk Açıkmalası XS',
    'MATERYAL -XS',
]
INV_DELETE_COLS_IHR = _INV_DELETE_COLS_ORTAK + ['YURT DIŞI TEDARİKÇİ Açıklama']
INV_DELETE_COLS_ANT = _INV_DELETE_COLS_ORTAK + ['YURT İÇİ  TEDARİKÇİ Açıklama']


def generate_inv_excel(df_raw, fatura_no):
    """
    Ham yüklenen fatura Excel'inden INV belgesi üretir.
    - IHR/ANT fatura tipine göre belirli kolonlar silinir.
    - Veri satırlarının yüksekliği 15 olur.

    Dönüş: (excel_bytes, dosya_adi)
    """
    is_ant     = fatura_no.upper().startswith('ANT')
    delete_cols = INV_DELETE_COLS_ANT if is_ant else INV_DELETE_COLS_IHR
    prefix      = 'ANT' if is_ant else 'IHR'
    son_3       = fatura_no[-3:]
    dosya_adi   = f'INV-{prefix}{son_3}.xlsx'

    df = df_raw.drop(columns=[c for c in delete_cols if c in df_raw.columns])

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'INV'

    headers = list(df.columns)
    for c_idx, h in enumerate(headers, start=1):
        ws.cell(row=1, column=c_idx, value=h)

    for r_idx, row in enumerate(df.itertuples(index=False), start=2):
        ws.row_dimensions[r_idx].height = 15
        for c_idx, val in enumerate(row, start=1):
            ws.cell(row=r_idx, column=c_idx, value=val)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.getvalue(), dosya_adi


def _parse_cy_pdf(pdf_bytes):
    """Kıbrıs PDF'inden BRÜT/NET kg ve kap bilgisini çıkarır."""
    import re
    result = {'brutKg': 0.0, 'netKg': 0.0, 'kap': ''}
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            text = ' '.join(
                (p.extract_text() or '') for p in pdf.pages[-2:]
            )

        def _ext(t, pats):
            for p in pats:
                m = re.search(p, t, re.IGNORECASE)
                if m:
                    try:
                        return float(m.group(1).replace(',', '.'))
                    except Exception:
                        pass
            return 0.0

        result['brutKg'] = _ext(text, [r'\bB\.KG\s*[:.]?\s*([\d.,]+)'])
        result['netKg']  = _ext(text, [r'\bN\.KG\s*[:.]?\s*([\d.,]+)'])

        # Kap sayısı
        from .helpers import _extract_pdf_packages
        result['kap'] = _extract_pdf_packages(text)
    except Exception:
        pass
    return result


def generate_cy(faturalar, grup_kilolari, exception_skus):
    """
    Kıbrıs PL üretimi.

    faturalar: list of dict
        {
          'excel': '<base64>',
          'pdf':   '<base64>' | None,
          'faturaNo': str      # opsiyonel — df'ten okunur
        }
    """
    fatura_list = []

    for f in faturalar:
        excel_bytes = base64.b64decode(f['excel'])
        df = pd.read_excel(io.BytesIO(excel_bytes), engine='openpyxl')
        df_raw = df.copy()

        # PDF'ten ağırlık ve kap bilgisi
        pdf_fields = {'brutKg': 0.0, 'netKg': 0.0, 'kap': ''}
        raw_pdf_bytes = None
        if f.get('pdf'):
            raw_pdf_bytes = base64.b64decode(f['pdf'])
            pdf_fields    = _parse_cy_pdf(raw_pdf_bytes)

        hedef_brut = float(pdf_fields.get('brutKg', 0) or 0)
        hedef_net  = float(pdf_fields.get('netKg',  0) or 0)

        fatura_no   = str(df['E-Fatura Seri Numarası'].iloc[0]).strip()
        fatura_date = df['Fatura Tarihi'].iloc[0]
        if hasattr(fatura_date, 'date'):
            fatura_date = fatura_date.date()

        depo_tipi = 'antrepo' if hedef_net > 0 else 'serbest'

        # Master ham satırlarda üretilir (diğer ülkelerdeki df_original kalıbı) —
        # satır sayısı ve sırası faturanın PDF'i ile birebir kalsın diye ağırlık
        # dağıtımı gruplama öncesi ham df üzerinde ayrıca hesaplanır.
        brut_orig, _ = calculate_weights(df_raw, grup_kilolari, hedef_brut, exception_skus)
        net_orig     = get_net_list(brut_orig, hedef_net, depo_tipi, hedef_brut)

        # SKU gruplandır
        df = sku_grupla(df)

        # Ağırlık hesapla
        brut_list, _ = calculate_weights(df, grup_kilolari, hedef_brut, exception_skus)
        net_list     = get_net_list(brut_list, hedef_net, depo_tipi)

        fatura_list.append({
            'df':           df,
            'df_raw':       df_raw,
            'brut_list':    brut_list,
            'net_list':     net_list,
            'brut_orig':    brut_orig,
            'net_orig':     net_orig,
            'hedef_net':    hedef_net,
            'depo_tipi':    depo_tipi,
            'fatura_no':    fatura_no,
            'fatura_date':  fatura_date,
            'kap':          pdf_fields.get('kap', ''),
            'raw_pdf_bytes': raw_pdf_bytes,
            'tekstil_disi': bool(f.get('tekstilDisi')),
        })

    # Fatura no'ya göre sırala
    fatura_list.sort(key=lambda x: x['fatura_no'])

    # Şablonu yükle
    wb = openpyxl.load_workbook(find_cy_template_path())
    ws = wb['PL']

    if ws.max_row > DS:
        ws.delete_rows(DS + 1, ws.max_row - DS)

    # Header
    fatura_nos  = ' / '.join(f['fatura_no'] for f in fatura_list)
    toplam_kap  = ' / '.join(str(f['kap']) for f in fatura_list if f['kap'])
    apply_cy_header(ws, fatura_nos, fatura_list[0]['fatura_date'], toplam_kap)

    # Kolon başlıkları
    ws.row_dimensions[DS].height = 35
    for i, (hd, _) in enumerate(CY_PL_COLS):
        hdr(ws, DS, i + 1, hd, bg=DARK_BLUE, size=9, align='center')

    # Her faturanın satırlarını alt alta yaz
    current_row = DS + 1

    for f in fatura_list:
        df_f      = f['df']
        brut_list = f['brut_list']
        net_list  = f['net_list']

        for r_idx, (_, row) in enumerate(df_f.iterrows()):
            ws.row_dimensions[current_row].height = 23
            bg = 'FFFFFF' if r_idx % 2 == 0 else 'EBF3FB'

            for c_idx, (out_col, src_col) in enumerate(CY_PL_COLS):
                cn = c_idx + 1
                if src_col == '__BRUT__':
                    dat(ws, current_row, cn, round(brut_list[r_idx], 2),
                        bg=bg, align='right', fmt='#,##0.00')
                elif src_col == '__NET__':
                    dat(ws, current_row, cn, round(net_list[r_idx], 2),
                        bg=bg, align='right', fmt='#,##0.00')
                elif out_col == 'TOPLAM ÜRÜN ADEDİ':
                    dat(ws, current_row, cn, parse_num(row.get(src_col, 0)),
                        bg=bg, align='right', fmt='#,##0')
                elif out_col == 'Asorti Barkodu':
                    dat(ws, current_row, cn, str(row.get(src_col, '') or ''),
                        bg=bg, align='left')
                else:
                    dat(ws, current_row, cn, row.get(src_col, ''), bg=bg, align='left')

            current_row += 1

    # TOTAL KG footer
    last_row  = current_row - 1
    total_row = current_row
    ws.row_dimensions[total_row].height = 28

    for col_idx in range(1, 6):
        ws.cell(row=total_row, column=col_idx).fill = PatternFill('solid', fgColor='FFFFFF')

    def _gold(ws, r, col, val, fmt=None):
        c = ws.cell(row=r, column=col, value=val)
        c.font      = Font(name='Arial', bold=True, color='FFFFFF', size=11)
        c.fill      = PatternFill('solid', fgColor=GOLD)
        c.alignment = Alignment(horizontal='right', vertical='center')
        c.border    = brd()
        if fmt:
            c.number_format = fmt
        return c

    _gold(ws, total_row, 6, 'TOTAL KG:')
    _gold(ws, total_row, 7, f'=SUM(G{DS+1}:G{last_row})', fmt='#,##0.00')
    _gold(ws, total_row, 8, f'=SUM(H{DS+1}:H{last_row})', fmt='#,##0.00')

    ws.sheet_view.topLeftCell = 'A1'
    set_print(ws, f'A1:J{total_row}')

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    pl_bytes = buf.getvalue()

    # Master Excel — her fatura için ayrı üret
    from .weights import generate_master_excel

    master_list = []
    for f in fatura_list:
        mb = generate_master_excel(
            f['df_raw'], f['brut_orig'], f['net_orig'],
            hedef_net=f['hedef_net'], depo_tipi=f['depo_tipi'],
        )
        master_list.append({'fatura_no': f['fatura_no'], 'bytes': mb, 'kap': f.get('kap', '')})

    # INV belgesi — her fatura için ayrı üret (IHR/ANT'a göre kolon farklı)
    inv_list = []
    for f in fatura_list:
        inv_bytes, inv_dosya_adi = generate_inv_excel(f['df_raw'], f['fatura_no'])
        inv_list.append({
            'fatura_no': f['fatura_no'],
            'bytes':     inv_bytes,
            'dosya_adi': inv_dosya_adi,
        })

    # Tekstil dışı faturalar — yüklenen orijinal PDF'e Üretici sütunu eklenir
    from .cy_uretici_pdf import generate_uretici_pdf

    # Fatura tipine göre yurt dışı/içi tedarikçi sütunlarından hangisi doluysa
    # o kullanılır (INV Excel'de silinmeyip tutulan sütunla aynı mantık).
    TEDARIKCI_COLS = ['YURT DIŞI TEDARİKÇİ Açıklama', 'YURT İÇİ  TEDARİKÇİ Açıklama']

    uretici_pdf_list = []
    for f in fatura_list:
        if not f['tekstil_disi'] or not f['raw_pdf_bytes']:
            continue
        df_raw = f['df_raw']
        # e-Arşiv ve ihracat PDF şablonları "Ürün Kodu" alanında farklı
        # seviyede kod gösterebilir: bazıları Madde Kodu'nu, bazıları renk
        # ekini de içeren tam SKU'yu kullanır. Aynı üreticiyi iki kodla da
        # indeksleyerek PDF tarafında hangisi varsa eşleşmesini sağlarız.
        sku_cols = [c for c in ('Madde Kodu', 'SKU') if c in df_raw.columns]
        cols = [c for c in TEDARIKCI_COLS if c in df_raw.columns]
        if not cols or not sku_cols:
            continue
        sku_to_uretici = {}
        for _, row in df_raw.iterrows():
            uretici = ''
            for c in cols:
                val = str(row.get(c, '') or '').strip()
                if val and val.lower() != 'nan':
                    uretici = val
                    break
            if not uretici:
                continue
            for sku_col in sku_cols:
                sku = str(row.get(sku_col, '') or '').strip()
                if sku and sku.lower() != 'nan':
                    sku_to_uretici[sku] = uretici

        uretici_pdf_bytes = generate_uretici_pdf(f['raw_pdf_bytes'], sku_to_uretici)
        uretici_pdf_list.append({
            'fatura_no': f['fatura_no'],
            'bytes':     uretici_pdf_bytes,
            'dosya_adi': f"{f['fatura_no']} - TEKSTİL DIŞI ONAYLI.pdf",
        })

    return pl_bytes, master_list, inv_list, uretici_pdf_list

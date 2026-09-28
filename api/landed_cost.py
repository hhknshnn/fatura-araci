import io
import re

from flask import jsonify, request, send_file

from api.db import get_conn


KURUMSAL_ULKELER = {
    'SIRBİSTAN', 'BOSNA', 'GÜRCİSTAN', 'KOSOVA', 'MAKEDONYA',
    'BELÇİKA', 'ALMANYA', 'HOLLANDA', 'KAZAKİSTAN',
}

# Landed cost ülke adı → ulke_navlun kodu (Navlun Tanımları tablosu).
LC_ULKE_KOD = {
    'SIRBİSTAN': 'rs',
    'BOSNA': 'ba',
    'GÜRCİSTAN': 'ge',
    'KOSOVA': 'xk',
    'MAKEDONYA': 'mk',
    'BELÇİKA': 'be',
    'HOLLANDA': 'nl',
    'KAZAKİSTAN': 'kz',
    'ALMANYA': 'de',
}


def _to_float(value):
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _norm(value):
    return str(value or '').strip().upper()


def _depo_from_fatura(fatura_no):
    return 'ANT' if str(fatura_no or '').startswith('ANT') else 'IHR'


def _natural_sort_key(value):
    parts = re.split(r'(\d+)', str(value or ''))
    return [int(part) if part.isdigit() else part.lower() for part in parts]


def _is_kurumsal(row):
    tip = str(row.get('musteri_tipi') or '').strip().lower()
    return tip == 'kurumsal' or (not tip and _norm(row.get('ulke')) in KURUMSAL_ULKELER)


def _cost_parts(rows):
    fatura = sum(_to_float(r.get('fatura_bedeli_eur')) for r in rows)
    operasyon = sum(
        _to_float(r.get('ihracat_beyanname_eur')) +
        _to_float(r.get('arac_bekleme')) +
        _to_float(r.get('brokerage_eur')) +
        _to_float(r.get('other_costs_eur'))
        for r in rows
    )
    navlun = sum(_to_float(r.get('navlun_eur')) for r in rows)
    vergi = sum(_to_float(r.get('gumruk_vergisi_eur')) for r in rows)
    sigorta = sum(_to_float(r.get('sigorta_eur')) for r in rows)
    landed = operasyon + navlun + vergi + sigorta
    return {
        'fatura_eur': fatura,
        'operasyon_eur': operasyon,
        'navlun_eur': navlun,
        'vergi_eur': vergi,
        'sigorta_eur': sigorta,
        'landed_cost_eur': landed,
        'oran': round((landed / fatura) * 100, 2) if fatura else 0,
    }


def _sefer_count(rows):
    groups = set()
    singles = 0
    for row in rows:
        if row.get('sefer_id'):
            groups.add(row.get('sefer_id'))
        else:
            singles += 1
    return singles + len(groups)


def _has_landed_cost_ready(row):
    return _to_float(row.get('brokerage_eur')) > 0


def _split_landed_cost_rows(rows):
    ready = []
    pending = []
    for row in rows:
        if _has_landed_cost_ready(row):
            ready.append(row)
        else:
            pending.append(row)
    return ready, pending


def _query_rows():
    countries = [c.strip().upper() for c in request.args.get('countries', '').split(',') if c.strip()]
    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')
    depo = request.args.get('depo')
    group_type = request.args.get('group_type', 'all')

    conn = get_conn()
    cur = conn.cursor()
    query = '''
        SELECT id, ihracat_dosya_no, fatura_no, ulke, nakliye_firmasi, plaka,
               fatura_bedeli_eur, navlun_eur, sigorta_eur, yukleme_tarihi,
               ihracat_beyanname_eur, arac_bekleme, brokerage_eur,
               other_costs_eur, gumruk_vergisi_eur, kdv_eur, musteri_tipi, sefer_id, durum,
               palet, navlun_usd, usd_kuru, eur_kuru
        FROM shipments
        WHERE 1=1
    '''
    params = []
    if date_from:
        query += ' AND yukleme_tarihi >= %s'
        params.append(date_from)
    if date_to:
        query += ' AND yukleme_tarihi <= %s'
        params.append(date_to)
    if group_type == 'single':
        query += ' AND sefer_id IS NULL'
    elif group_type == 'grouped':
        query += ' AND sefer_id IS NOT NULL'
    query += ' ORDER BY ulke, yukleme_tarihi NULLS LAST, id'

    cur.execute(query, params)
    cols = [d[0] for d in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    cur.close()
    conn.close()

    filtered = []
    for row in rows:
        if not _is_kurumsal(row):
            continue
        if countries and _norm(row.get('ulke')) not in countries:
            continue
        if depo and _depo_from_fatura(row.get('fatura_no')) != depo:
            continue
        filtered.append(row)
    return filtered


def _pending_payload(rows):
    by_status = {}
    by_country = {}
    detail = []

    for row in rows:
        status = row.get('durum') or 'Belirsiz'
        country = row.get('ulke') or 'Belirsiz'
        by_status[status] = by_status.get(status, 0) + 1
        by_country[country] = by_country.get(country, 0) + 1
        detail.append({
            'id': row.get('id'),
            'ihracat_dosya_no': row.get('ihracat_dosya_no'),
            'fatura_no': row.get('fatura_no'),
            'ulke': country,
            'depo': _depo_from_fatura(row.get('fatura_no')),
            'yukleme_tarihi': str(row.get('yukleme_tarihi') or ''),
            'durum': status,
            'brokerage_eur': _to_float(row.get('brokerage_eur')),
            'fatura_eur': _to_float(row.get('fatura_bedeli_eur')),
            'sefer_id': row.get('sefer_id'),
        })
    detail.sort(key=lambda item: _natural_sort_key(item.get('ihracat_dosya_no')), reverse=True)

    return {
        'summary': {
            'fatura_sayisi': len(rows),
            'sefer_sayisi': _sefer_count(rows),
            'fatura_eur': sum(_to_float(r.get('fatura_bedeli_eur')) for r in rows),
            'by_status': [
                {'durum': status, 'sayi': count}
                for status, count in sorted(by_status.items(), key=lambda item: item[0])
            ],
            'by_country': [
                {'ulke': country, 'sayi': count}
                for country, count in sorted(by_country.items(), key=lambda item: item[0])
            ],
        },
        'detail': detail,
    }


def _build_payload(rows, pending_rows=None):
    pending_rows = pending_rows or []
    summary = _cost_parts(rows)
    summary['fatura_sayisi'] = len(rows)
    summary['sefer_sayisi'] = _sefer_count(rows)
    summary['ortalama_sefer_maliyeti_eur'] = (
        summary['landed_cost_eur'] / summary['sefer_sayisi']
        if summary['sefer_sayisi'] else 0
    )

    by_country = {}
    for row in rows:
        by_country.setdefault(row.get('ulke') or 'Belirsiz', []).append(row)

    countries = []
    for country, country_rows in by_country.items():
        data = _cost_parts(country_rows)
        data.update({
            'ulke': country,
            'fatura_sayisi': len(country_rows),
            'sefer_sayisi': _sefer_count(country_rows),
        })
        countries.append(data)
    countries.sort(key=lambda item: item['landed_cost_eur'], reverse=True)

    monthly = {}
    for row in rows:
        month = str(row.get('yukleme_tarihi') or '')[:7] or 'Tarihsiz'
        monthly.setdefault(month, []).append(row)
    months = []
    for month, month_rows in monthly.items():
        data = _cost_parts(month_rows)
        data['month'] = month
        months.append(data)
    months.sort(key=lambda item: item['month'])

    detail = []
    for row in rows:
        costs = _cost_parts([row])
        detail.append({
            'id': row.get('id'),
            'ihracat_dosya_no': row.get('ihracat_dosya_no'),
            'fatura_no': row.get('fatura_no'),
            'ulke': row.get('ulke'),
            'depo': _depo_from_fatura(row.get('fatura_no')),
            'yukleme_tarihi': str(row.get('yukleme_tarihi') or ''),
            'sefer_id': row.get('sefer_id'),
            'brokerage_eur': _to_float(row.get('brokerage_eur')),
            'other_costs_eur': _to_float(row.get('other_costs_eur')),
            **costs,
        })

    return {
        'summary': summary,
        'countries': countries,
        'months': months,
        'detail': detail,
        'pending': _pending_payload(pending_rows),
        'navlun_tanimlar': _navlun_tanimlar(),
        'navlun_satirlar': _navlun_satirlar(rows),
        'cost_labels': {
            'operasyon_eur': 'Operasyon',
            'navlun_eur': 'Navlun',
            'vergi_eur': 'Vergi',
            'sigorta_eur': 'Sigorta',
        },
    }


def _navlun_tanimlar():
    """Navlun Tanımları tablosunun güncel satırları — senaryo editörünün eskisi."""
    from api.navlun import KURUMSAL_ULKELER as NAVLUN_ULKELER
    kod_to_label = {kod: ad for kod, ad in NAVLUN_ULKELER.items()}
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute('''
            SELECT ulke_kodu, para_birimi, navlun_ihr, navlun_ant_ihr,
                   navlun_ant, sigorta_baz
            FROM ulke_navlun
            ORDER BY ulke_kodu
        ''')
        rows = cur.fetchall()
    finally:
        cur.close()
        conn.close()
    out = []
    for kod, para, ihr, ant_ihr, ant, sigorta in rows:
        out.append({
            'ulkeKodu': kod,
            'ulkeAdi': kod_to_label.get(kod, (kod or '').upper()),
            'paraBirimi': para or 'EUR',
            'navlunIhr': _to_float(ihr),
            'navlunAntIhr': _to_float(ant_ihr),
            'navlunAnt': _to_float(ant),
            'sigortaBaz': _to_float(sigorta),
        })
    return out


def _navlun_satir_senaryo(row):
    if row.get('sefer_id'):
        return 'gruplu'
    if _depo_from_fatura(row.get('fatura_no')) == 'ANT':
        return 'ant'
    return 'ihr'


def _navlun_satirlar(rows):
    """Senaryo hesabı için kompakt sevkiyat satırları (yalnız LC'ye giren kayıtlar)."""
    out = []
    for row in rows:
        ulke = row.get('ulke') or ''
        costs = _cost_parts([row])
        out.append({
            'id': row.get('id'),
            'ulke': ulke,
            'ulkeKodu': LC_ULKE_KOD.get(_norm(ulke), ''),
            'fatura_no': row.get('fatura_no') or '',
            'ihracat_dosya_no': row.get('ihracat_dosya_no') or '',
            'depo': _depo_from_fatura(row.get('fatura_no')),
            'sefer_id': row.get('sefer_id'),
            'palet': row.get('palet') or '',
            'yukleme_tarihi': str(row.get('yukleme_tarihi') or ''),
            'navlun_eur': _to_float(row.get('navlun_eur')),
            'navlun_usd': _to_float(row.get('navlun_usd')),
            'eur_kuru': _to_float(row.get('eur_kuru')),
            'usd_kuru': _to_float(row.get('usd_kuru')),
            'senaryo': _navlun_satir_senaryo(row),
            'fatura_eur': costs['fatura_eur'],
            'operasyon_eur': costs['operasyon_eur'],
            'vergi_eur': costs['vergi_eur'],
            'sigorta_eur': costs['sigorta_eur'],
            'landed_cost_eur': costs['landed_cost_eur'],
        })
    return out


def landed_cost_get():
    ready_rows, pending_rows = _split_landed_cost_rows(_query_rows())
    return jsonify({'success': True, **_build_payload(ready_rows, pending_rows)})


def landed_cost_export():
    ready_rows, pending_rows = _split_landed_cost_rows(_query_rows())
    payload = _build_payload(ready_rows, pending_rows)

    try:
        import openpyxl
        from openpyxl.styles import Alignment, Font, PatternFill
    except ImportError:
        return jsonify({'success': False, 'error': 'openpyxl kurulu değil'}), 500

    wb = openpyxl.Workbook()
    header_fill = PatternFill('solid', fgColor='1F3864')
    header_font = Font(bold=True, color='FFFFFF')
    money_fmt = '#,##0.00 €'
    pct_fmt = '0.00%'

    def write_table(ws, headers, rows_data):
        for col, header in enumerate(headers, start=1):
            cell = ws.cell(row=1, column=col, value=header[0])
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal='center')
        for r_idx, item in enumerate(rows_data, start=2):
            for c_idx, header in enumerate(headers, start=1):
                key = header[1]
                value = item.get(key, '')
                if key == 'oran':
                    value = (value or 0) / 100
                cell = ws.cell(row=r_idx, column=c_idx, value=value)
                if key.endswith('_eur') or key == 'landed_cost_eur':
                    cell.number_format = money_fmt
                if key == 'oran':
                    cell.number_format = pct_fmt
        for col in range(1, len(headers) + 1):
            ws.column_dimensions[ws.cell(row=1, column=col).column_letter].width = 18

    ws = wb.active
    ws.title = 'Ozet'
    summary_rows = [{**payload['summary'], 'ulke': 'Toplam Kurumsal'}]
    write_table(ws, [
        ('Kapsam', 'ulke'),
        ('Fatura EUR', 'fatura_eur'),
        ('Landed Cost EUR', 'landed_cost_eur'),
        ('Oran', 'oran'),
        ('Operasyon EUR', 'operasyon_eur'),
        ('Navlun EUR', 'navlun_eur'),
        ('Vergi EUR', 'vergi_eur'),
        ('Sigorta EUR', 'sigorta_eur'),
        ('Fatura Sayısı', 'fatura_sayisi'),
        ('Sefer Sayısı', 'sefer_sayisi'),
    ], summary_rows)

    ws = wb.create_sheet('Ulke Bazli')
    write_table(ws, [
        ('Ülke', 'ulke'),
        ('Fatura EUR', 'fatura_eur'),
        ('Landed Cost EUR', 'landed_cost_eur'),
        ('Oran', 'oran'),
        ('Operasyon EUR', 'operasyon_eur'),
        ('Navlun EUR', 'navlun_eur'),
        ('Vergi EUR', 'vergi_eur'),
        ('Sigorta EUR', 'sigorta_eur'),
        ('Fatura Sayısı', 'fatura_sayisi'),
        ('Sefer Sayısı', 'sefer_sayisi'),
    ], payload['countries'])

    ws = wb.create_sheet('Detay')
    write_table(ws, [
        ('Dosya No', 'ihracat_dosya_no'),
        ('Fatura No', 'fatura_no'),
        ('Ülke', 'ulke'),
        ('Depo', 'depo'),
        ('Yükleme', 'yukleme_tarihi'),
        ('Grup', 'sefer_id'),
        ('Fatura EUR', 'fatura_eur'),
        ('Landed Cost EUR', 'landed_cost_eur'),
        ('Oran', 'oran'),
        ('Operasyon EUR', 'operasyon_eur'),
        ('Brokerage Fee & Other Costs EUR', 'brokerage_eur'),
        ('Other Costs EUR', 'other_costs_eur'),
        ('Navlun EUR', 'navlun_eur'),
        ('Vergi EUR', 'vergi_eur'),
        ('Sigorta EUR', 'sigorta_eur'),
    ], payload['detail'])

    ws = wb.create_sheet('Bekleyenler')
    write_table(ws, [
        ('Dosya No', 'ihracat_dosya_no'),
        ('Fatura No', 'fatura_no'),
        ('Ülke', 'ulke'),
        ('Depo', 'depo'),
        ('Yükleme', 'yukleme_tarihi'),
        ('Durum', 'durum'),
        ('Grup', 'sefer_id'),
        ('Fatura EUR', 'fatura_eur'),
        ('Brokerage Fee & Other Costs EUR', 'brokerage_eur'),
    ], payload['pending']['detail'])

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return send_file(
        buf,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        as_attachment=True,
        download_name='landed_cost_raporu.xlsx',
    )


def _lc_fill(hex_color):
    from openpyxl.styles import PatternFill
    return PatternFill('solid', fgColor=hex_color)


def _lc_font(**kwargs):
    from openpyxl.styles import Font
    kwargs.setdefault('name', 'Calibri')
    return Font(**kwargs)


def _lc_border():
    from openpyxl.styles import Border, Side
    side = Side(style='thin', color='CBD5E1')
    return Border(left=side, right=side, top=side, bottom=side)


def _lc_num(v):
    if v is None or v == '':
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _lc_apply_cell(cell, value, kind, delta=False):
    """kind: text | int | eur | pct | pp"""
    from openpyxl.styles import Alignment
    cell.border = _lc_border()
    cell.alignment = Alignment(horizontal='left' if kind == 'text' else 'right', vertical='center')
    if kind == 'text':
        cell.value = value if value not in (None, '') else None
        return
    num = _lc_num(value)
    cell.value = num
    if num is None:
        return
    if kind == 'int':
        cell.number_format = '#,##0'
        cell.font = _lc_font(size=10)
        return
    if kind == 'eur':
        cell.number_format = '#,##0.00 "€"'
        cell.font = _lc_font(size=10)
        if delta:
            cell.fill = _lc_fill('DCFCE7' if num > 0.005 else ('FEE2E2' if num < -0.005 else 'F8FAFC'))
            cell.font = _lc_font(size=10, bold=True, color='166534' if num > 0 else ('991B1B' if num < 0 else '334155'))
        else:
            cell.fill = _lc_fill('EFF6FF')
        return
    if kind == 'amt':
        cell.number_format = '#,##0.00'
        cell.font = _lc_font(size=10)
        if delta:
            cell.fill = _lc_fill('DCFCE7' if num > 0.005 else ('FEE2E2' if num < -0.005 else 'F8FAFC'))
            cell.font = _lc_font(size=10, bold=True, color='166534' if num > 0 else ('991B1B' if num < 0 else '334155'))
        else:
            cell.fill = _lc_fill('EFF6FF')
        return
    if kind == 'pct':
        cell.value = num / 100.0
        cell.number_format = '0.00%'
        cell.fill = _lc_fill('FEF3C7')
        cell.font = _lc_font(size=10, bold=True, color='92400E')
        return
    if kind == 'pp':
        cell.number_format = '+0.00" pp";-0.00" pp";0.00" pp"'
        cell.fill = _lc_fill('DCFCE7' if num > 0.005 else ('FEE2E2' if num < -0.005 else 'FEF3C7'))
        cell.font = _lc_font(size=10, bold=True, color='166534' if num > 0 else ('991B1B' if num < 0 else '92400E'))


def _lc_header_row(ws, row, headers, kinds):
    from openpyxl.styles import Alignment
    fills = {
        'text': '1F3864',
        'int': '334155',
        'eur': '1D4ED8',
        'amt': '1D4ED8',
        'pct': 'B45309',
        'pp': '0F766E',
    }
    for col, (title, kind) in enumerate(zip(headers, kinds), start=1):
        cell = ws.cell(row=row, column=col, value=title)
        cell.fill = _lc_fill(fills.get(kind, '1F3864'))
        cell.font = _lc_font(bold=True, color='FFFFFF', size=10)
        cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
        cell.border = _lc_border()
    ws.row_dimensions[row].height = 28


def _lc_section_title(ws, row, col, text, color='0F766E', span=4):
    from openpyxl.styles import Alignment
    ws.merge_cells(start_row=row, start_column=col, end_row=row, end_column=col + span - 1)
    cell = ws.cell(row=row, column=col, value=text)
    cell.fill = _lc_fill(color)
    cell.font = _lc_font(bold=True, color='FFFFFF', size=11)
    cell.alignment = Alignment(horizontal='left', vertical='center')
    ws.row_dimensions[row].height = 22
    return cell


def landed_cost_senaryo_export():
    """POST /api/landed-cost/senaryo-export — navlun senaryosunu renkli xlsx olarak indir."""
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Alignment
        from openpyxl.utils import get_column_letter
    except ImportError:
        return jsonify({'success': False, 'error': 'openpyxl kurulu değil'}), 500

    body = request.get_json(silent=True) or {}
    meta = body.get('meta') if isinstance(body.get('meta'), dict) else {}
    tutarlar = body.get('tutarlar') if isinstance(body.get('tutarlar'), list) else []
    oranlar = body.get('oranlar') if isinstance(body.get('oranlar'), list) else []
    tarifeler = body.get('tarifeler') if isinstance(body.get('tarifeler'), list) else []
    kirilim = body.get('kirilim') if isinstance(body.get('kirilim'), list) else []
    ulkeler = body.get('ulkeler') if isinstance(body.get('ulkeler'), list) else []
    faturalar = body.get('faturalar') if isinstance(body.get('faturalar'), list) else []

    wb = Workbook()

    # ── Özet: tutarlar ve oranlar ayrı blok ────────────────────────────────
    ws = wb.active
    ws.title = 'Ozet'
    ws.sheet_view.showGridLines = False
    ws.merge_cells('A1:D1')
    title = ws['A1']
    title.value = 'Navlun Senaryosu'
    title.font = _lc_font(bold=True, size=18, color='0F172A')
    title.alignment = Alignment(vertical='center')
    ws.row_dimensions[1].height = 28

    meta_rows = [
        ('Ülke', meta.get('ulkeler') or 'Tüm ülkeler'),
        ('Başlangıç', meta.get('date_from') or ''),
        ('Bitiş', meta.get('date_to') or ''),
        ('Depo', meta.get('depo') or 'Tümü'),
        ('Sefer tipi', meta.get('group_type') or 'all'),
        ('KZ tarif dönemi', meta.get('kz_tarife') or ''),
        ('Dönem referansı', meta.get('kz_ref') or ''),
    ]
    r = 3
    for label, val in meta_rows:
        ws.cell(r, 1, label).font = _lc_font(bold=True, size=10, color='64748B')
        ws.cell(r, 2, val).font = _lc_font(size=10, color='0F172A')
        ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=4)
        r += 1

    r += 1
    _lc_section_title(ws, r, 1, 'TUTARLAR  ·  euro', '1D4ED8', 4)
    r += 1
    _lc_header_row(ws, r, ['Kalem', 'Kayıtlı €', 'Senaryo €', 'Fark €'], ['text', 'eur', 'eur', 'eur'])
    r += 1
    for item in tutarlar:
        ws.cell(r, 1, item.get('kalem') or '').font = _lc_font(bold=True, size=10)
        ws.cell(r, 1).border = _lc_border()
        ws.cell(r, 1).fill = _lc_fill('F8FAFC')
        _lc_apply_cell(ws.cell(r, 2), item.get('kayitli'), 'eur')
        _lc_apply_cell(ws.cell(r, 3), item.get('senaryo'), 'eur')
        _lc_apply_cell(ws.cell(r, 4), item.get('fark'), 'eur', delta=True)
        r += 1

    r += 1
    _lc_section_title(ws, r, 1, 'ORANLAR  ·  yüzde', 'B45309', 4)
    r += 1
    _lc_header_row(ws, r, ['Kalem', 'Kayıtlı %', 'Senaryo %', 'Fark'], ['text', 'pct', 'pct', 'pp'])
    r += 1
    for item in oranlar:
        ws.cell(r, 1, item.get('kalem') or '').font = _lc_font(bold=True, size=10)
        ws.cell(r, 1).border = _lc_border()
        ws.cell(r, 1).fill = _lc_fill('FFFBEB')
        _lc_apply_cell(ws.cell(r, 2), item.get('kayitli'), 'pct')
        _lc_apply_cell(ws.cell(r, 3), item.get('senaryo'), 'pct')
        fark_kind = 'pp' if item.get('fark_pp', True) else 'pct'
        _lc_apply_cell(ws.cell(r, 4), item.get('fark'), fark_kind)
        r += 1

    ws.column_dimensions['A'].width = 32
    ws.column_dimensions['B'].width = 16
    ws.column_dimensions['C'].width = 16
    ws.column_dimensions['D'].width = 16
    ws.freeze_panes = 'A3'

    def _write_typed_sheet(name, headers, kinds, rows, widths, depo_col=None):
        sh = wb.create_sheet(name)
        sh.sheet_view.showGridLines = False
        _lc_header_row(sh, 1, headers, kinds)
        for i, row in enumerate(rows, start=2):
            depo = ''
            if depo_col is not None:
                depo = str(row[depo_col] if depo_col < len(row) else '') or ''
            for c, (val, kind) in enumerate(zip(row, kinds), start=1):
                cell = sh.cell(row=i, column=c)
                if kind == 'text':
                    cell.value = val if val not in (None, '') else None
                    cell.font = _lc_font(size=10)
                    cell.border = _lc_border()
                    cell.alignment = Alignment(horizontal='left', vertical='center')
                    if depo == 'IHR':
                        cell.fill = _lc_fill('ECFDF5')
                    elif depo == 'ANT':
                        cell.fill = _lc_fill('FEF2F2')
                    elif i % 2 == 0:
                        cell.fill = _lc_fill('F8FAFC')
                elif kind in ('eur', 'amt'):
                    is_delta = 'Δ' in headers[c - 1] or headers[c - 1].startswith('Fark')
                    _lc_apply_cell(cell, val, kind, delta=is_delta)
                else:
                    _lc_apply_cell(cell, val, kind)
        for i, w in enumerate(widths, start=1):
            sh.column_dimensions[get_column_letter(i)].width = w
        sh.auto_filter.ref = f"A1:{get_column_letter(len(headers))}{max(1, len(rows) + 1)}"
        sh.freeze_panes = 'A2'
        sh.row_dimensions[1].height = 32
        return sh

    _write_typed_sheet(
        'Tarifeler',
        ['Ülke', 'PB', 'Senaryo kolon', 'Kayıtlı', 'Yeni', 'Fark'],
        ['text', 'text', 'text', 'amt', 'amt', 'amt'],
        [
            [
                t.get('ulke'), t.get('pb'), t.get('kolon'),
                t.get('kayitli'), t.get('yeni'),
                None if t.get('kayitli') is None else (_lc_num(t.get('yeni')) or 0) - (_lc_num(t.get('kayitli')) or 0),
            ]
            for t in tarifeler
        ],
        [18, 8, 22, 14, 14, 14],
    )

    _write_typed_sheet(
        'Kirilim',
        ['Depo', 'Tip', 'Fatura sayısı', 'Kayıtlı LC €', 'Yeni LC €', 'Δ Navlun €',
         'LC değişimi %', 'Navlun payı %', 'Yeni navlun payı %',
         'Landed Cost %', 'Senaryo Landed Cost %', 'Δ Landed Cost'],
        ['text', 'text', 'int', 'eur', 'eur', 'eur', 'pct', 'pct', 'pct', 'pct', 'pct', 'pp'],
        [
            [
                k.get('depo'), k.get('tip'), k.get('fatura_sayisi'),
                k.get('kayitli_lc'), k.get('yeni_lc'), k.get('delta_navlun'),
                k.get('lc_pct'), k.get('navlun_pay'), k.get('yeni_navlun_pay'),
                k.get('kayitli_oran'), k.get('yeni_oran'), k.get('oran_delta'),
            ]
            for k in kirilim
        ],
        [10, 12, 14, 16, 14, 16, 16, 16, 20, 16, 22, 16],
        depo_col=0,
    )

    _write_typed_sheet(
        'Ulkeler',
        ['Ülke', 'Komple', 'Gruplu', 'Kayıtlı LC €', 'Yeni LC €', 'Kayıtlı navlun €',
         'Senaryo navlun €', 'Navlun payı %', 'Yeni navlun payı %', 'Δ Navlun €', 'LC değişimi %'],
        ['text', 'int', 'int', 'eur', 'eur', 'eur', 'eur', 'pct', 'pct', 'eur', 'pct'],
        [
            [
                u.get('ulke'), u.get('komple'), u.get('gruplu'),
                u.get('kayitli_lc'), u.get('yeni_lc'),
                u.get('kayitli_navlun'), u.get('yeni_navlun'),
                u.get('navlun_pay'), u.get('yeni_navlun_pay'),
                u.get('delta_navlun'), u.get('lc_pct'),
            ]
            for u in ulkeler
        ],
        [16, 10, 10, 16, 14, 18, 18, 16, 18, 16, 16],
    )

    _write_typed_sheet(
        'Faturalar',
        ['Ülke', 'Fatura no', 'Dosya no', 'Depo', 'Senaryo', 'Sefer id', 'Palet',
         'Kayıtlı LC €', 'Yeni LC €', 'Kayıtlı navlun €', 'Senaryo navlun €',
         'Δ Navlun €', 'Navlun payı %', 'Yeni navlun payı %', 'LC değişimi %', 'Para birimi'],
        ['text', 'text', 'text', 'text', 'text', 'text', 'text',
         'eur', 'eur', 'eur', 'eur', 'eur', 'pct', 'pct', 'pct', 'text'],
        [
            [
                f.get('ulke'), f.get('fatura_no'), f.get('dosya_no'),
                f.get('depo'), f.get('senaryo'), f.get('sefer_id'), f.get('palet'),
                f.get('kayitli_lc'), f.get('yeni_lc'),
                f.get('kayitli_navlun'), f.get('yeni_navlun'),
                f.get('delta_navlun'),
                f.get('navlun_pay'), f.get('yeni_navlun_pay'), f.get('lc_pct'),
                f.get('para_birimi'),
            ]
            for f in faturalar
        ],
        [16, 18, 14, 8, 20, 12, 10, 14, 14, 16, 16, 14, 14, 18, 14, 12],
        depo_col=3,
    )

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    slug = re.sub(r'[^\wÇĞİÖŞÜçğıöşü-]+', '_', str(meta.get('ulkeler') or 'TUM'))[:40]
    tarih = str(meta.get('date_to') or '')[:10] or 'rapor'
    return send_file(
        buf,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        as_attachment=True,
        download_name=f'navlun_senaryo_{slug}_{tarih}.xlsx',
    )

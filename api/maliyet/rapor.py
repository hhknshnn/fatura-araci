# api/maliyet/rapor.py
# Excel raporu: Özet sheet (ülke bazında beklenen/gerçek/fark) + seçilen her
# ülke için detay sheet (kalem kırılımı, beklenen toplamlar, gerçek faturalar).
# Stil, Master Excel ile aynıdır (weights.generate_master_excel): koyu mavi
# header, zebra satırlar, freeze panes, auto filter, auto kolon genişliği.

import datetime
import io
import re

from flask import jsonify, request, send_file
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from api.db import get_conn
from api.kur import get_tcmb_kurlar
from api.maliyet.meta import kurumsal_ulkeler
from api.maliyet.hareket import PALLET_OUT_KOD
from api.maliyet.hesap import beklenen_hesapla, beklenen_eur, kalem_ozeti, _toplamlar, to_eur

DARK_BLUE = '1F3864'
ZEBRA_CLR = 'F7FAFD'

_thin = Side(style='thin', color='BFBFBF')
_border = Border(left=_thin, right=_thin, top=_thin, bottom=_thin)
_hdr_font = Font(name='Arial', bold=True, color='FFFFFF', size=10)
_hdr_fill = PatternFill('solid', fgColor=DARK_BLUE)
_hdr_align = Alignment(horizontal='center', vertical='center', wrap_text=True)
_data_font = Font(name='Arial', size=9)
_bold_font = Font(name='Arial', size=9, bold=True)
_title_font = Font(name='Arial', size=12, bold=True, color=DARK_BLUE)
_align_left = Alignment(horizontal='left', vertical='center')
_align_right = Alignment(horizontal='right', vertical='center')
_fill_white = PatternFill('solid', fgColor='FFFFFF')
_fill_zebra = PatternFill('solid', fgColor=ZEBRA_CLR)


def _parse_date(value):
    try:
        return datetime.date.fromisoformat(str(value or '').strip())
    except ValueError:
        return None


def _sheet_adi(label):
    """Excel sheet adı: yasak karakterler temizlenir, 31 karaktere kısaltılır."""
    return re.sub(r'[\[\]:*?/\\]', '', str(label))[:31] or 'Sayfa'


def _tablo_yaz(ws, baslik_satiri, headers, rows, bold_rows=()):
    """Master stiliyle tablo basar; tablonun bittiği satır numarasını döner.
    bold_rows: kalın yazılacak veri satırı indeksleri (0 bazlı)."""
    for c_idx, h in enumerate(headers, start=1):
        cell = ws.cell(row=baslik_satiri, column=c_idx, value=h)
        cell.font = _hdr_font
        cell.fill = _hdr_fill
        cell.alignment = _hdr_align
        cell.border = _border
    ws.row_dimensions[baslik_satiri].height = 26

    for r_idx, row in enumerate(rows):
        excel_row = baslik_satiri + 1 + r_idx
        bg = _fill_white if r_idx % 2 == 0 else _fill_zebra
        for c_idx, val in enumerate(row, start=1):
            cell = ws.cell(row=excel_row, column=c_idx, value=val)
            cell.font = _bold_font if r_idx in bold_rows else _data_font
            cell.fill = bg
            cell.alignment = _align_right if isinstance(val, (int, float)) and not isinstance(val, bool) else _align_left
            cell.border = _border
            if isinstance(val, float):
                cell.number_format = '#,##0.00'
    return baslik_satiri + len(rows)


def _kolon_genislikleri(ws):
    """Sheet'teki dolu hücrelere göre auto kolon genişliği."""
    for col in ws.columns:
        max_len = 0
        letter = None
        for cell in col:
            if letter is None:
                letter = cell.column_letter
            if cell.value is not None:
                max_len = max(max_len, len(str(cell.value)))
        if letter:
            ws.column_dimensions[letter].width = max(10, min(42, max_len + 2))


def maliyet_rapor_get():
    """GET /api/maliyet/rapor?ulkeler=de,rs&start&end — Excel raporu indirir.
    ulkeler boşsa tüm kurumsal ülkeler dahil edilir."""
    start = _parse_date(request.args.get('start'))
    end = _parse_date(request.args.get('end'))
    if not start or not end or start > end:
        return jsonify({'success': False, 'error': 'Geçerli bir tarih aralığı girin'}), 400

    tum_ulkeler = kurumsal_ulkeler()
    istenen = [k.strip().lower() for k in str(request.args.get('ulkeler') or '').split(',') if k.strip()]
    if istenen:
        gecersiz = set(istenen) - {u['kod'] for u in tum_ulkeler}
        if gecersiz:
            return jsonify({'success': False, 'error': f"Geçersiz ülke: {', '.join(sorted(gecersiz))}"}), 400
        secili = [u for u in tum_ulkeler if u['kod'] in istenen]
    else:
        secili = tum_ulkeler

    kurlar = get_tcmb_kurlar()
    donem_str = f"{start.strftime('%d.%m.%Y')} – {end.strftime('%d.%m.%Y')}"

    wb = Workbook()
    ws_ozet = wb.active
    ws_ozet.title = 'Özet'

    conn = get_conn()
    cur = conn.cursor()
    try:
        ozet_rows = []
        detaylar = []  # (ulke, kalemler, beklenen, faturalar, uyarilar)

        for u in secili:
            hesap = beklenen_hesapla(cur, u['kod'], start, end, kurlar)
            beklenen = _toplamlar(hesap['satirlar'])
            kalemler = kalem_ozeti(hesap['satirlar'])

            cur.execute('''
                SELECT fatura_no, donem_baslangic, donem_bitis, tutar, para_birimi, fatura_tarihi
                FROM maliyet_faturalari
                WHERE ulke = %s AND donem_baslangic >= %s AND donem_bitis <= %s
                ORDER BY donem_baslangic
            ''', (u['kod'], start, end))
            faturalar = cur.fetchall()

            # Her fatura kendi döneminin beklenen tutarıyla eşleştirilir
            gercek_eur = 0.0
            gercek_eksik = False
            eslesen_eur = 0.0
            eslesen_eksik = False
            fatura_beklenen = []   # faturalarla aynı sırada dönem bekleneni (EUR)
            for _no, d_bas, d_bit, tutar, para, _ft in faturalar:
                e = to_eur(float(tutar), para, kurlar)
                if e is None:
                    gercek_eksik = True
                else:
                    gercek_eur += e
                b = beklenen_eur(cur, u['kod'], d_bas, d_bit, kurlar)
                fatura_beklenen.append(round(b, 2) if b is not None else None)
                if b is None:
                    eslesen_eksik = True
                else:
                    eslesen_eur += b
            gercek_eur = None if (gercek_eksik or not faturalar) else round(gercek_eur, 2)
            eslesen = None if (eslesen_eksik or not faturalar) else round(eslesen_eur, 2)

            cur.execute('''
                SELECT COALESCE(SUM(h.miktar), 0)
                FROM maliyet_hareketleri h
                JOIN maliyet_kalemleri k ON k.id = h.kalem_id
                WHERE h.ulke = %s AND k.kod = %s AND h.tarih BETWEEN %s AND %s
            ''', (u['kod'], PALLET_OUT_KOD, start, end))
            palet_out = float(cur.fetchone()[0])

            fark = fark_pct = None
            if eslesen is not None and gercek_eur is not None:
                fark = round(gercek_eur - eslesen, 2)
                if eslesen > 0:
                    fark_pct = round(fark / eslesen * 100, 1)

            ozet_rows.append([
                u['label'],
                beklenen['eur'],
                eslesen,
                gercek_eur,
                fark,
                fark_pct,
                len(faturalar),
                palet_out,
                round(beklenen['eur'] / palet_out, 2) if beklenen['eur'] and palet_out > 0 else None,
            ])
            detaylar.append((u, kalemler, beklenen, faturalar, fatura_beklenen, eslesen, hesap['uyarilar']))
    finally:
        cur.close()
        conn.close()

    # ── Özet sheet ───────────────────────────────────────────────────────────
    ozet_headers = ['Ülke', 'Beklenen — Aralık (EUR)', 'Beklenen — Fatura Dönemleri (EUR)',
                    'Gerçek (EUR)', 'Fark (EUR)', 'Fark %', 'Fatura Sayısı',
                    'Palet Out', '€/Palet (Beklenen)']
    son = _tablo_yaz(ws_ozet, 1, ozet_headers, ozet_rows)
    ws_ozet.freeze_panes = 'A2'
    ws_ozet.auto_filter.ref = f'A1:{get_column_letter(len(ozet_headers))}{son}'

    meta = [
        f'Dönem: {donem_str}',
        f"Oluşturma: {datetime.date.today().strftime('%d.%m.%Y')}",
        ('Kur (EUR bazlı): 1 € = {USD} $ / {TRY} ₺'.format(**kurlar)
         if kurlar.get('USD') else 'Kur alınamadı — EUR dışı tutarlar çevrilemedi'),
        'Gerçek: dönemi rapor aralığının içinde kalan depo faturaları.',
        'Fark, her faturanın kendi dönemine denk gelen beklenen tutarla hesaplanır.',
    ]
    for i, satir in enumerate(meta):
        cell = ws_ozet.cell(row=son + 2 + i, column=1, value=satir)
        cell.font = Font(name='Arial', size=8, italic=True, color='808080')
    _kolon_genislikleri(ws_ozet)

    # ── Ülke detay sheet'leri ────────────────────────────────────────────────
    birim_adlari = {
        'palet': 'palet', 'koli': 'koli', 'siparis': 'sipariş', 'satir': 'satır',
        'adet': 'adet', 'konteyner': 'konteyner', 'islem': 'işlem', 'ay': 'ay',
        'palet_hafta': 'palet/hafta', 'palet_ay': 'palet/ay',
    }
    for u, kalemler, beklenen, faturalar, fatura_beklenen, eslesen, uyarilar in detaylar:
        ws = wb.create_sheet(_sheet_adi(u['label']))
        cell = ws.cell(row=1, column=1, value=f"{u['label']} — Maliyet Raporu ({donem_str})")
        cell.font = _title_font

        # Kalem kırılımı
        kalem_headers = ['Kalem', 'Birim', 'Miktar', 'Ort. Birim Fiyat',
                         'Para Birimi', 'Tutar', 'Tutar (EUR)']
        kalem_rows = [
            [k['kalem_ad'],
             birim_adlari.get(k['birim'], k['birim']),
             k['miktar'] if k['tip'] == 'hareket' else None,
             round(k['tutar'] / k['miktar'], 4) if k['tip'] == 'hareket' and k['miktar'] else None,
             k['para_birimi'],
             k['tutar'],
             k['tutar_eur']]
            for k in kalemler
        ] or [['Bu dönemde hesaplanan kalem yok', None, None, None, None, None, None]]
        son = _tablo_yaz(ws, 3, kalem_headers, kalem_rows)
        ws.freeze_panes = 'A4'
        ws.auto_filter.ref = f'A3:{get_column_letter(len(kalem_headers))}{son}'

        # Beklenen toplamlar — EUR genel toplamı zaten var, yerel paraları ayrıca göster
        satir = son + 2
        toplam_rows = [[f'Beklenen Toplam ({para})', tutar]
                       for para, tutar in beklenen['para_toplamlari'].items()
                       if para != 'EUR']
        toplam_rows.append(['Beklenen Toplam (EUR)', beklenen['eur']])
        satir = _tablo_yaz(ws, satir, ['Toplam', 'Tutar'], toplam_rows,
                           bold_rows=(len(toplam_rows) - 1,))

        # Gerçek faturalar — her satırda kendi döneminin bekleneni ve farkı
        satir += 2
        fatura_headers = ['Fatura No', 'Dönem Başlangıç', 'Dönem Bitiş',
                          'Fatura Tarihi', 'Para Birimi', 'Tutar', 'Tutar (EUR)',
                          'Dönem Bekleneni (EUR)', 'Fark (EUR)']
        fatura_rows = []
        for (no, db, dbit, tutar, para, ft), b_eur in zip(faturalar, fatura_beklenen):
            t_eur = to_eur(float(tutar), para, kurlar)
            f_fark = round(t_eur - b_eur, 2) if (t_eur is not None and b_eur is not None) else None
            fatura_rows.append([
                no, db.strftime('%d.%m.%Y'), dbit.strftime('%d.%m.%Y'),
                ft.strftime('%d.%m.%Y') if ft else None,
                para, float(tutar), t_eur, b_eur, f_fark,
            ])
        if fatura_rows:
            gercek_toplam = sum(r[6] for r in fatura_rows if r[6] is not None)
            fatura_rows.append(['GERÇEK TOPLAM (EUR)', None, None, None, None, None,
                                round(gercek_toplam, 2), eslesen,
                                round(gercek_toplam - eslesen, 2) if eslesen is not None else None])
            satir = _tablo_yaz(ws, satir, fatura_headers, fatura_rows,
                               bold_rows=(len(fatura_rows) - 1,))
        else:
            cell = ws.cell(row=satir, column=1, value='Bu dönem için gerçek fatura girilmedi.')
            cell.font = _data_font

        # Uyarılar
        for i, uyari in enumerate(uyarilar):
            cell = ws.cell(row=satir + 2 + i, column=1, value='Uyarı: ' + uyari)
            cell.font = Font(name='Arial', size=8, italic=True, color='B45309')

        _kolon_genislikleri(ws)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    dosya_adi = f"maliyet_raporu_{start.isoformat()}_{end.isoformat()}.xlsx"
    return send_file(
        buf,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        as_attachment=True,
        download_name=dosya_adi,
    )

# api/shipments.py
# Sevkiyat kayıtları — PostgreSQL tabanlı

import io
import json
import os
import re
import time
import pdfplumber
from flask import request, jsonify, send_file
from api.db import get_conn
from api.auth import get_session_from_headers
from api.invoice.helpers import parse_pdf

# Ülke adı → müşteri tipi eşlemesi
ULKE_MUSTERI_TIPI = {
    'SIRBİSTAN': 'kurumsal', 'BOSNA': 'kurumsal', 'GÜRCİSTAN': 'kurumsal',
    'KOSOVA': 'kurumsal', 'MAKEDONYA': 'kurumsal', 'BELÇİKA': 'kurumsal',
    'ALMANYA': 'kurumsal', 'HOLLANDA': 'kurumsal', 'KAZAKİSTAN': 'kurumsal',
    'KIBRIS': 'franchise', 'IRAK': 'franchise', 'LİBYA': 'franchise',
    'LİBERYA': 'franchise', 'LÜBNAN': 'franchise', 'ÖZBEKİSTAN': 'franchise',
    'RUSYA': 'franchise', 'ÜRDÜN': 'franchise',
    'ABHAZYA': 'toptan', 'MAURITIUS': 'toptan',
    'KENYA': 'devir',
}

def _musteri_tipi_from_ulke(ulke):
    return ULKE_MUSTERI_TIPI.get(str(ulke).strip().upper(), 'kurumsal')


def _gecerli_tarih(v):
    """Tarih alanı için makul aralık koruması (YYYY-MM-DD, 1900–2100).

    Tarayıcının <input type="date"> alanı 6 haneli yıl kabul ediyor; oraya
    yanlışlıkla "272026" gibi bir yıl girilirse PostgreSQL değeri sorunsuz
    yazar ama psycopg2 okurken datetime'a çeviremez ve TÜM sevkiyat listesi
    500 döner. Bu yüzden aralık dışı tarihleri yazarken None'a çeviriyoruz.
    """
    if not v:
        return None
    s = str(v).strip()
    if not s:
        return None
    m = re.match(r'^(\d{1,6})-(\d{2})-(\d{2})', s)
    if not m:
        return s  # başka formatlar mevcut akışa dokunulmadan geçsin
    yil = int(m.group(1))
    if yil < 1900 or yil > 2100:
        return None
    return s[:10]


# ── TÜM SEVKİYATLARI GETİR ───────────────────────────────────────────────────
def get_all_shipments(ulke=None, durum=None, musteri_tipi=None):
    conn = get_conn()
    cur  = conn.cursor()

    query = '''
        SELECT id, ihracat_dosya_no, fatura_no, ulke, nakliye_firmasi, plaka,
               mal_bedeli_eur, navlun_eur, sigorta_eur, eur_kuru, fatura_bedeli_eur,
               fatura_bedeli_tl, durum, yukleme_tarihi, gumruk_tarihi,
               varis_tarihi, gumrukleme_bitis, created_at,
               mal_bedeli_tl, ihracat_beyanname_tl, ihracat_beyanname_eur,
               arac_bekleme, brokerage_eur, gumruk_vergisi_eur, kdv_eur,
               toplam_maliyet_eur, other_costs_eur, musteri_tipi, sefer_id, palet,
               navlun_usd, sigorta_usd, usd_kuru
        FROM shipments
        WHERE 1=1
    '''
    params = []

    if ulke:
        query += ' AND unaccent(lower(ulke)) = unaccent(lower(%s))'
        params.append(ulke)
    if durum:
        query += ' AND upper(durum) = upper(%s)'
        params.append(durum)
    if musteri_tipi:
        query += ' AND musteri_tipi = %s'
        params.append(musteri_tipi)

    query += ' ORDER BY id DESC'

    cur.execute(query, params)
    rows = cur.fetchall()
    cur.close()
    conn.close()

    return [_row_to_dict(r) for r in rows]


# ── TEK SEVKİYAT GETİR ───────────────────────────────────────────────────────
def get_shipment(shipment_id):
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute('SELECT * FROM shipments WHERE id = %s', (shipment_id,))
    row  = cur.fetchone()
    cols = [d[0] for d in cur.description]
    cur.close()
    conn.close()
    if not row:
        return None
    return dict(zip(cols, row))


# ── SEVKİYAT OLUŞTUR ─────────────────────────────────────────────────────────
def create_shipment(data):
    fatura_no = data.get('fatura_no', '')
    if fatura_no:
        conn = get_conn()
        cur  = conn.cursor()
        cur.execute('SELECT id FROM shipments WHERE fatura_no = %s', (fatura_no,))
        if cur.fetchone():
            cur.close()
            conn.close()
            raise ValueError(f'Bu fatura no zaten kayıtlı: {fatura_no}')
        cur.close()
        conn.close()

    ulke         = data.get('ulke', '')
    musteri_tipi = data.get('musteri_tipi') or _musteri_tipi_from_ulke(ulke)

    # Franchise/toptan/devir ise: varış ve gümrükleme bitiş = gümrük tarihi, durum = TESLİM EDİLDİ
    gumruk_tarihi = _gecerli_tarih(data.get('gumruk_tarihi'))
    if musteri_tipi in ('franchise', 'toptan', 'devir'):
        varis_tarihi      = gumruk_tarihi or _gecerli_tarih(data.get('varis_tarihi'))
        gumrukleme_bitis  = gumruk_tarihi or _gecerli_tarih(data.get('gumrukleme_bitis'))
        durum_default     = 'TESLİM EDİLDİ'
    else:
        varis_tarihi      = _gecerli_tarih(data.get('varis_tarihi'))
        gumrukleme_bitis  = _gecerli_tarih(data.get('gumrukleme_bitis'))
        durum_default     = data.get('durum', 'YOLDA')

    yukleme_tarihi = _gecerli_tarih(data.get('yukleme_tarihi'))

    # USD kuru elle/faturadan gelmediyse yükleme tarihine göre otomatik çek
    usd_kuru = float(data.get('usd_kuru', 0) or 0)
    if not usd_kuru and yukleme_tarihi:
        usd_kuru = _get_usd_kuru_for_date(str(yukleme_tarihi))

    conn = get_conn()
    try:
        cur = conn.cursor()
        try:
            cur.execute('''
                INSERT INTO shipments (
                    ihracat_dosya_no, fatura_no, ulke, nakliye_firmasi, plaka,
                    fatura_bedeli_tl, mal_bedeli_eur, navlun_eur, sigorta_eur,
                    eur_kuru, fatura_bedeli_eur, yukleme_tarihi, gumruk_tarihi,
                    varis_tarihi, gumrukleme_bitis, durum, musteri_tipi, palet,
                    navlun_usd, sigorta_usd, usd_kuru
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                RETURNING id
            ''', (
                data.get('ihracat_dosya_no', ''),
                fatura_no,
                ulke,
                data.get('nakliye_firmasi', ''),
                data.get('plaka', ''),
                data.get('fatura_bedeli_tl', 0),
                data.get('mal_bedeli_eur', 0),
                data.get('navlun_eur', 0),
                data.get('sigorta_eur', 0),
                data.get('eur_kuru', 0),
                data.get('fatura_bedeli_eur', 0),
                yukleme_tarihi,
                gumruk_tarihi,
                varis_tarihi,
                gumrukleme_bitis,
                _normalize_durum(durum_default),
                musteri_tipi,
                data.get('palet') or None,
                data.get('navlun_usd', 0),
                data.get('sigorta_usd', 0),
                usd_kuru,
            ))
            new_id = cur.fetchone()[0]
            conn.commit()
        except Exception as e:
            conn.rollback()
            if 'shipments_fatura_no_unique_idx' in str(e):
                raise ValueError(f'Bu fatura no zaten kayıtlı: {fatura_no}')
            raise
        finally:
            cur.close()
    finally:
        conn.close()

    # Taslakta hesaplanan navlun/sigortayı doğru para birimi kolonuna yaz ve
    # gruplu partner varsa otomatik grupla. Hata shipment oluşturmayı bozmaz.
    try:
        from api.navlun import sevkiyat_olusturuldu
        sevkiyat_olusturuldu(data.get('ihracat_dosya_no', ''))
    except Exception:
        pass

    return new_id


# ── SEVKİYAT GÜNCELLE ────────────────────────────────────────────────────────
def update_shipment(shipment_id, data):
    conn = get_conn()
    cur  = conn.cursor()

    # USD alanları formdan gelmiyorsa mevcut DB değerini koru (veri kaybını önler)
    cur.execute('''
        SELECT navlun_usd, sigorta_usd, usd_kuru, yukleme_tarihi,
               gumruk_tarihi, varis_tarihi, gumrukleme_bitis
        FROM shipments WHERE id = %s
    ''', (shipment_id,))
    existing = cur.fetchone() or (0, 0, 0, None, None, None, None)

    navlun_usd  = data.get('navlun_usd',  existing[0]) or 0
    sigorta_usd = data.get('sigorta_usd', existing[1]) or 0
    usd_kuru    = data.get('usd_kuru',    existing[2]) or 0
    yukleme_tarihi = _gecerli_tarih(data.get('yukleme_tarihi', existing[3]))
    gumruk_tarihi = _gecerli_tarih(data.get('gumruk_tarihi', existing[4]))

    # USD kuru elle/faturadan gelmediyse yükleme tarihine göre otomatik çek
    if not usd_kuru:
        if yukleme_tarihi:
            usd_kuru = _get_usd_kuru_for_date(str(yukleme_tarihi))

    toplam = (
        float(data.get('ihracat_beyanname_eur', 0) or 0) +
        float(data.get('arac_bekleme', 0) or 0) +
        float(data.get('brokerage_eur', 0) or 0) +
        float(data.get('gumruk_vergisi_eur', 0) or 0) +
        float(data.get('kdv_eur', 0) or 0) +
        float(data.get('other_costs_eur', 0) or 0)
    )

    # Varış tarihi veya gümrükleme bitiş tarihi doluysa durumu otomatik
    # TESLİM EDİLDİ yap — ANCAK yalnızca durum bilgisi istekle gelmediyse.
    # Maliyet-evrak akışı durum göndermez, o yüzden otomatik kural orada çalışır;
    # sevkiyat düzenleme pop-up'ı durumu her zaman açıkça gönderir ve kullanıcının
    # elle seçtiği durum geçerli olur (aksi halde YOLDA seçimi sessizce geri alınır).
    varis_tarihi = _gecerli_tarih(data.get('varis_tarihi', existing[5]))
    gumrukleme_bitis = _gecerli_tarih(data.get('gumrukleme_bitis', existing[6]))
    durum_istekten_geldi = bool(str(data.get('durum') or '').strip())
    durum = _normalize_durum(data.get('durum', 'YOLDA'))
    if (not durum_istekten_geldi) and (varis_tarihi or gumrukleme_bitis) \
            and durum != 'TESLİM EDİLDİ':
        durum = 'TESLİM EDİLDİ'

    cur.execute('''
        UPDATE shipments SET
            ihracat_dosya_no      = %s,
            nakliye_firmasi       = %s,
            plaka                 = %s,
            fatura_bedeli_tl      = %s,
            fatura_bedeli_eur     = %s,
            mal_bedeli_eur        = %s,
            navlun_eur            = %s,
            sigorta_eur           = %s,
            eur_kuru              = %s,
            navlun_usd            = %s,
            sigorta_usd           = %s,
            usd_kuru              = %s,
            ihracat_beyanname_tl  = %s,
            ihracat_beyanname_eur = %s,
            arac_bekleme          = %s,
            brokerage_eur         = %s,
            gumruk_vergisi_eur    = %s,
            kdv_eur               = %s,
            other_costs_eur       = %s,
            toplam_maliyet_eur    = %s,
            varis_tarihi          = %s,
            gumrukleme_bitis      = %s,
            durum                 = %s,
            palet                 = %s,
            yukleme_tarihi        = %s,
            gumruk_tarihi         = %s
        WHERE id = %s
    ''', (
        data.get('ihracat_dosya_no', ''),
        data.get('nakliye_firmasi', ''),
        data.get('plaka', ''),
        data.get('fatura_bedeli_tl', 0),
        data.get('fatura_bedeli_eur', 0),
        data.get('mal_bedeli_eur', 0),
        data.get('navlun_eur', 0),
        data.get('sigorta_eur', 0),
        data.get('eur_kuru', 0),
        navlun_usd,
        sigorta_usd,
        usd_kuru,
        data.get('ihracat_beyanname_tl', 0),
        data.get('ihracat_beyanname_eur', 0),
        data.get('arac_bekleme', 0),
        data.get('brokerage_eur', 0),
        data.get('gumruk_vergisi_eur', 0),
        data.get('kdv_eur', 0),
        data.get('other_costs_eur', 0),
        toplam,
        varis_tarihi,
        gumrukleme_bitis,
        durum,
        data.get('palet') or None,
        yukleme_tarihi,
        gumruk_tarihi,
        shipment_id,
    ))
    conn.commit()
    cur.close()
    conn.close()


# ── DASHBOARD İSTATİSTİKLERİ ─────────────────────────────────────────────────
def get_dashboard_stats():
    conn = get_conn()
    cur  = conn.cursor()

    cur.execute('SELECT COUNT(*) FROM shipments')
    toplam = cur.fetchone()[0]

    # Yolda — sefer bazlı (grupluları 1 say)
    cur.execute('''
        SELECT COUNT(*) FROM (
            SELECT id FROM shipments WHERE sefer_id IS NULL AND upper(durum) = 'YOLDA'
            UNION ALL
            SELECT MIN(id) FROM shipments WHERE sefer_id IS NOT NULL AND upper(durum) = 'YOLDA' GROUP BY sefer_id
        ) t
    ''')
    yolda = cur.fetchone()[0]

    # Teslim edildi — sefer bazlı
    cur.execute('''
        SELECT COUNT(*) FROM (
            SELECT id FROM shipments WHERE sefer_id IS NULL AND upper(durum) IN ('TESLİM EDİLDİ', 'TESLIM EDILDI')
            UNION ALL
            SELECT MIN(id) FROM shipments WHERE sefer_id IS NOT NULL AND upper(durum) IN ('TESLİM EDİLDİ', 'TESLIM EDILDI') GROUP BY sefer_id
        ) t
    ''')
    teslim = cur.fetchone()[0]

    # Varış Gümrük — sefer bazlı
    cur.execute('''
        SELECT COUNT(*) FROM (
            SELECT id FROM shipments WHERE sefer_id IS NULL AND upper(durum) LIKE '%GÜMRÜK%'
            UNION ALL
            SELECT MIN(id) FROM shipments WHERE sefer_id IS NOT NULL AND upper(durum) LIKE '%GÜMRÜK%' GROUP BY sefer_id
        ) t
    ''')
    varis_gumruk = cur.fetchone()[0]

    cur.execute('SELECT COALESCE(SUM(fatura_bedeli_eur), 0) FROM shipments')
    toplam_eur = float(cur.fetchone()[0])

    # Sefer sayısı: gruplanmamışlar tek tek + her grup 1 sefer
    cur.execute('''
        SELECT COUNT(*) FROM (
            SELECT id FROM shipments WHERE sefer_id IS NULL
            UNION ALL
            SELECT MIN(id) FROM shipments WHERE sefer_id IS NOT NULL GROUP BY sefer_id
        ) t
    ''')
    sefer_sayisi = cur.fetchone()[0]

    # Toplam fatura sayısı
    cur.execute('SELECT COUNT(*) FROM shipments')
    toplam_fatura = cur.fetchone()[0]

    # Tek araç sefer sayısı (sefer_id NULL olanlar)
    cur.execute('SELECT COUNT(*) FROM shipments WHERE sefer_id IS NULL')
    tek_arac = cur.fetchone()[0]

    # Gruplu sefer sayısı (unique sefer_id sayısı)
    cur.execute('SELECT COUNT(DISTINCT sefer_id) FROM shipments WHERE sefer_id IS NOT NULL')
    gruplu_sefer = cur.fetchone()[0]

    # Gruplu fatura sayısı (sefer_id NOT NULL olanlar)
    cur.execute('SELECT COUNT(*) FROM shipments WHERE sefer_id IS NOT NULL')
    gruplu_fatura = cur.fetchone()[0]

    # Ülke dağılımı — sefer bazlı
    cur.execute('''
        SELECT ulke, COUNT(*) as sayi FROM (
            SELECT ulke, id FROM shipments WHERE sefer_id IS NULL
            UNION ALL
            SELECT ulke, MIN(id) FROM shipments WHERE sefer_id IS NOT NULL GROUP BY sefer_id, ulke
        ) t
        GROUP BY ulke
        ORDER BY sayi DESC
    ''')
    ulkeler = [{'ulke': r[0], 'sayi': r[1]} for r in cur.fetchall()]

    cur.close()
    conn.close()

    return {
        'toplam':        toplam,
        'sefer_sayisi':  sefer_sayisi,
        'toplam_fatura': toplam_fatura,
        'tek_arac':      tek_arac,
        'gruplu_sefer':  gruplu_sefer,
        'gruplu_fatura': gruplu_fatura,
        'yolda':         yolda,
        'teslim':        teslim,
        'varis_gumruk':  varis_gumruk,
        'toplam_eur':    toplam_eur,
        'ulkeler':       ulkeler,
    }


# ── MALİYET RAPORU EXPORT ────────────────────────────────────────────────────
def export_shipments(ulke=None, durum=None, depo=None, musteri_tipi=None, ids=None):
    rows = get_all_shipments(ulke=ulke, durum=durum, musteri_tipi=musteri_tipi)
    if depo:
        rows = [r for r in rows if str(r.get('fatura_no', '')).startswith(depo)]
    if ids:
        rows = [r for r in rows if r.get('id') in ids]
    try:
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment
    except ImportError:
        return jsonify({'error': 'openpyxl kurulu değil'}), 500

    if not rows:
        return jsonify({'error': 'Veri bulunamadı'}), 404

    fatura_ref_no_map = {}
    if rows:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            'SELECT shipment_id, fatura_ref_no FROM nebim_delivery_refs WHERE shipment_id = ANY(%s)',
            ([r['id'] for r in rows],),
        )
        fatura_ref_no_map = {r[0]: r[1] for r in cur.fetchall() if r[1]}
        cur.close()
        conn.close()

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'Maliyet Raporu'

    headers = [
        'İhracat Dosya No', 'Fatura No', 'Depo', 'Ülke', 'Müşteri Tipi',
        'Nakliye Firması', 'Plaka', 'Grup', 'Palet',
        'Fatura Bedeli TL', 'Fatura Bedeli EUR', 'Mal Bedeli EUR',
        'Navlun EUR', 'Sigorta EUR', 'EUR Kuru',
        'Navlun USD', 'Sigorta USD', 'USD Kuru',
        'Yükleme Tarihi', 'Gümrük Tarihi', 'Varış Tarihi', 'Gümrükleme Bitiş',
        'İhracat Beyanname TL', 'İhracat Beyanname EUR',
        'Araç Bekleme', 'Brokerage Fee & Other Costs EUR', 'Other Costs EUR', 'Gümrük Vergisi EUR', 'KDV EUR',
        'Durum', 'Fatura Ref No',
    ]

    header_fill = PatternFill('solid', fgColor='1F3864')
    header_font = Font(name='Arial', bold=True, color='FFFFFF', size=10)
    for col_idx, header in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.font      = header_font
        cell.fill      = header_fill
        cell.alignment = Alignment(horizontal='center', vertical='center')

    TL_FMT  = '#,##0.00 ₺'
    EUR_FMT = '#,##0.00 €'
    USD_FMT = '#,##0.00 $'
    NUM_FMT = '#,##0.0000'

    for row_idx, s in enumerate(rows, start=2):
        fatura_no = s.get('fatura_no', '')
        depo_val  = 'ANT' if str(fatura_no).startswith('ANT') else 'IHR'

        def c(col, val, fmt=None):
            cell = ws.cell(row=row_idx, column=col, value=val)
            if fmt: cell.number_format = fmt
            return cell

        c(1,  s.get('ihracat_dosya_no', ''))
        c(2,  fatura_no)
        c(3,  depo_val)
        c(4,  s.get('ulke', ''))
        c(5,  s.get('musteri_tipi', ''))
        c(6,  s.get('nakliye_firmasi', ''))
        c(7,  s.get('plaka', ''))
        c(8,  f"Grup {s['sefer_id']}" if s.get('sefer_id') else '')
        c(9,  s.get('palet') or '')
        c(10, float(s.get('fatura_bedeli_tl', 0) or 0),  TL_FMT)
        c(11, float(s.get('fatura_bedeli_eur', 0) or 0), EUR_FMT)
        c(12, float(s.get('mal_bedeli_eur', 0) or 0),    EUR_FMT)
        c(13, float(s.get('navlun_eur', 0) or 0),        EUR_FMT)
        c(14, float(s.get('sigorta_eur', 0) or 0),       EUR_FMT)
        c(15, float(s.get('eur_kuru', 0) or 0),          NUM_FMT)
        c(16, float(s.get('navlun_usd', 0) or 0),        USD_FMT)
        c(17, float(s.get('sigorta_usd', 0) or 0),       USD_FMT)
        c(18, float(s.get('usd_kuru', 0) or 0),          NUM_FMT)
        c(19, s.get('yukleme_tarihi', ''))
        c(20, s.get('gumruk_tarihi', ''))
        c(21, s.get('varis_tarihi', ''))
        c(22, s.get('gumrukleme_bitis', ''))
        c(23, float(s.get('ihracat_beyanname_tl', 0) or 0),  TL_FMT)
        c(24, float(s.get('ihracat_beyanname_eur', 0) or 0), EUR_FMT)
        c(25, float(s.get('arac_bekleme', 0) or 0),          EUR_FMT)
        c(26, float(s.get('brokerage_eur', 0) or 0),         EUR_FMT)
        c(27, float(s.get('other_costs_eur', 0) or 0),       EUR_FMT)
        c(28, float(s.get('gumruk_vergisi_eur', 0) or 0),    EUR_FMT)
        c(29, float(s.get('kdv_eur', 0) or 0),               EUR_FMT)
        c(30, s.get('durum', ''))
        c(31, fatura_ref_no_map.get(s.get('id'), ''))

    for col_idx in range(1, len(headers) + 1):
        col_letter = ws.cell(row=1, column=col_idx).column_letter
        max_len    = len(str(ws.cell(row=1, column=col_idx).value or ''))
        for row_idx in range(2, len(rows) + 2):
            val = ws.cell(row=row_idx, column=col_idx).value
            if val is not None:
                max_len = max(max_len, len(str(val)))
        ws.column_dimensions[col_letter].width = min(max_len + 4, 50)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    try:
        from api.storage import save_record
        tarih_str = time.strftime('%Y-%m-%d %H:%M')
        save_record('genel', f'Maliyet Raporu {tarih_str}', 'shipment_report', excel_bytes=buf.getvalue())
    except Exception:
        pass

    return send_file(
        buf,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        as_attachment=True,
        download_name='maliyet_raporu.xlsx',
    )


# ── YARDIMCI ─────────────────────────────────────────────────────────────────
def _normalize_durum(raw):
    if not raw:
        return 'YOLDA'
    # Nokta, boşluk gibi karakterleri temizle
    s = raw.strip().rstrip('.').strip().upper()
    if s in ('YÜKLENECEK', 'YUKLENECEK', 'TO BE LOADED'):
        return 'Yüklenecek'
    if s in ('YOLDA', 'IN TRANSIT', 'TRANSIT'):
        return 'YOLDA'
    if s in ('TESLIM EDILDI', 'TESLİM EDİLDİ', 'DELIVERED', 'TESLIM',
             'TESLIM EDILDI.', 'TESLİM EDİLDİ.'):
        return 'TESLİM EDİLDİ'
    if s in ('VARIŞ GÜMRÜK', 'VARIS GUMRUK', 'CUSTOMS', 'GÜMRÜKTE'):
        return 'Varış Gümrük'
    if s in ('HAZIRLANIYOR', 'HAZIRLANYOR', 'PREPARING'):
        return 'HAZIRLANIYOR'
    return raw.strip()


def _row_to_dict(row):
    return {
        'id':                    row[0],
        'ihracat_dosya_no':      row[1],
        'fatura_no':             row[2],
        'ulke':                  row[3],
        'nakliye_firmasi':       row[4],
        'plaka':                 row[5],
        'mal_bedeli_eur':        float(row[6]  or 0),
        'navlun_eur':            float(row[7]  or 0),
        'sigorta_eur':           float(row[8]  or 0),
        'eur_kuru':              float(row[9]  or 0),
        'fatura_bedeli_eur':     float(row[10] or 0),
        'fatura_bedeli_tl':      float(row[11] or 0),
        'durum':                 row[12],
        'yukleme_tarihi':        str(row[13]) if row[13] else None,
        'gumruk_tarihi':         str(row[14]) if row[14] else None,
        'varis_tarihi':          str(row[15]) if row[15] else None,
        'gumrukleme_bitis':      str(row[16]) if row[16] else None,
        'created_at':            row[17],
        'mal_bedeli_tl':         float(row[18] or 0),
        'ihracat_beyanname_tl':  float(row[19] or 0),
        'ihracat_beyanname_eur': float(row[20] or 0),
        'arac_bekleme':          float(row[21] or 0),
        'brokerage_eur':         float(row[22] or 0),
        'gumruk_vergisi_eur':    float(row[23] or 0),
        'kdv_eur':               float(row[24] or 0),
        'toplam_maliyet_eur':    float(row[25] or 0),
        'other_costs_eur':       float(row[26] or 0) if len(row) > 26 else 0.0,
        'musteri_tipi':          row[27] if len(row) > 27 else 'kurumsal',
        'sefer_id':              row[28] if len(row) > 28 else None,
        'palet':                 row[29] if len(row) > 29 else None,
        'navlun_usd':            float(row[30] or 0) if len(row) > 30 else 0.0,
        'sigorta_usd':           float(row[31] or 0) if len(row) > 31 else 0.0,
        'usd_kuru':              float(row[32] or 0) if len(row) > 32 else 0.0,
    }


# ── FLASK ROUTE FONKSİYONLARI ─────────────────────────────────────────────────
def shipments_get():
    mode         = request.args.get('mode')
    ulke         = request.args.get('ulke')
    durum        = request.args.get('durum')
    musteri_tipi = request.args.get('musteri_tipi')
    sid          = request.args.get('id')
    sefer_id     = request.args.get('sefer_id')

    if mode == 'dashboard':
        return jsonify({'success': True, 'stats': get_dashboard_stats()})

    if sid:
        s = get_shipment(int(sid))
        if not s:
            return jsonify({'success': False, 'error': 'Bulunamadı'}), 404
        return jsonify({'success': True, 'shipment': s})

    if sefer_id:
        conn = get_conn()
        cur  = conn.cursor()
        cur.execute('''
            SELECT id, ihracat_dosya_no, fatura_no, ulke, nakliye_firmasi, plaka,
                   mal_bedeli_eur, navlun_eur, sigorta_eur, eur_kuru, fatura_bedeli_eur,
                   fatura_bedeli_tl, durum, yukleme_tarihi, gumruk_tarihi,
                   varis_tarihi, gumrukleme_bitis, created_at,
                   mal_bedeli_tl, ihracat_beyanname_tl, ihracat_beyanname_eur,
                   arac_bekleme, brokerage_eur, gumruk_vergisi_eur, kdv_eur,
                   toplam_maliyet_eur, other_costs_eur, musteri_tipi, sefer_id, palet,
                   navlun_usd, sigorta_usd, usd_kuru
            FROM shipments WHERE sefer_id = %s ORDER BY id
        ''', (int(sefer_id),))
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify({'success': True, 'shipments': [_row_to_dict(r) for r in rows]})

    shipments = get_all_shipments(ulke=ulke, durum=durum, musteri_tipi=musteri_tipi)
    return jsonify({'success': True, 'shipments': shipments})


def shipments_post():
    body = request.get_json() or {}
    try:
        new_id = create_shipment(body)
        return jsonify({'success': True, 'id': new_id})
    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 400


def shipments_put():
    body = request.get_json() or {}
    sid  = body.get('id')
    if not sid:
        return jsonify({'success': False, 'error': 'id gerekli'}), 400
    cost_fields = {
        'ihracat_beyanname_eur', 'arac_bekleme', 'brokerage_eur',
        'gumruk_vergisi_eur', 'kdv_eur', 'other_costs_eur',
    }
    if set(body.keys()).issubset(cost_fields | {'id'}):
        update_shipment_cost_fields(int(sid), body)
        return jsonify({'success': True})
    update_shipment(int(sid), body)
    return jsonify({'success': True})


def repair_shipment_freight(sid=None, fatura_no=None):
    body = request.get_json() or {}
    sid = sid or body.get('id')
    fatura_no = fatura_no or body.get('fatura_no', '')
    if not sid and not fatura_no:
        return jsonify({'success': False, 'error': 'id veya fatura_no gerekli'})

    conn = get_conn()
    cur = conn.cursor()
    try:
        if sid:
            cur.execute('''
                SELECT id, fatura_no, mal_bedeli_eur, eur_kuru, fatura_bedeli_tl, ulke
                FROM shipments
                WHERE id = %s
            ''', (int(sid),))
        else:
            cur.execute('''
                SELECT id, fatura_no, mal_bedeli_eur, eur_kuru, fatura_bedeli_tl, ulke
                FROM shipments
                WHERE fatura_no = %s
            ''', (fatura_no,))
        shipment = cur.fetchone()
        if not shipment:
            return jsonify({'success': False, 'error': 'Sevkiyat bulunamadı'})

        shipment_id, shipment_fatura_no, mal_bedeli_eur, eur_kuru, fatura_bedeli_tl, ulke = shipment
        cur.execute('''
            SELECT file_paths
            FROM storage_records
            WHERE fatura_no = %s
            ORDER BY tarih DESC
        ''', (shipment_fatura_no,))

        pdf_path = ''
        for (file_paths,) in cur.fetchall():
            if isinstance(file_paths, str):
                try:
                    file_paths = json.loads(file_paths)
                except Exception:
                    file_paths = {}
            if isinstance(file_paths, dict):
                candidate = file_paths.get('pdf') or ''
            else:
                candidate = ''
            if candidate and os.path.exists(candidate):
                pdf_path = candidate
                break

        if not pdf_path:
            return jsonify({'success': False, 'error': 'Bu fatura için storage PDF bulunamadı'})

        with open(pdf_path, 'rb') as f:
            pdf_fields = parse_pdf(f.read())

        navlun_pdf = float(pdf_fields.get('navlun') or 0)
        sigorta_pdf = float(pdf_fields.get('sigorta') or 0)
        eur_kuru = float(eur_kuru or 0)
        if eur_kuru <= 0:
            return jsonify({'success': False, 'error': 'EUR kuru 0 olduğu için çevrim yapılamadı'})
        if navlun_pdf <= 0 and sigorta_pdf <= 0:
            return jsonify({'success': False, 'error': 'PDF içinde navlun/sigorta tutarı bulunamadı', 'pdfFields': pdf_fields})

        ulke_norm = str(ulke or '').strip().upper()
        pdf_freight_is_eur = False  # Türk e-faturasında navlun/sigorta her zaman TRY
        kz_ge = ulke_norm in {'KAZAKİSTAN', 'GÜRCİSTAN'}

        if pdf_freight_is_eur:
            navlun_eur = navlun_pdf
            sigorta_eur = sigorta_pdf
            freight_tl = (navlun_eur + sigorta_eur) * eur_kuru
        else:
            navlun_eur = navlun_pdf / eur_kuru
            sigorta_eur = sigorta_pdf / eur_kuru
            freight_tl = navlun_pdf + sigorta_pdf

        if kz_ge:
            # KZ/GE PDF'lerinde fatura_bedeli_tl GRAND TOTAL'dir:
            # ürün TL + navlun TL + sigorta TL. Üç EUR kolon da PDF'teki
            # kendi TL tutarının API EUR kuruna bölünmesiyle bulunur.
            fatura_bedeli_tl = float(fatura_bedeli_tl or 0)
            mal_bedeli_tl = fatura_bedeli_tl - freight_tl
            if mal_bedeli_tl < 0:
                return jsonify({
                    'success': False,
                    'error': 'PDF navlun/sigorta toplamı fatura TL tutarından büyük',
                    'pdfFields': pdf_fields,
                })
            mal_bedeli_eur = mal_bedeli_tl / eur_kuru
            fatura_bedeli_eur = mal_bedeli_eur + navlun_eur + sigorta_eur
        else:
            # PDF'teki TL tutarı direkt Fatura Bedeli TL — tüm kurumsal ülkeler
            pdf_fatura_tl_val = float(pdf_fields.get('fatura_tl') or 0)
            mal_bedeli_eur    = float(mal_bedeli_eur or 0)
            if pdf_fatura_tl_val > 0:
                fatura_bedeli_tl = pdf_fatura_tl_val
            else:
                fatura_bedeli_tl = float(mal_bedeli_eur or 0) * eur_kuru
            fatura_bedeli_eur = fatura_bedeli_tl / eur_kuru if eur_kuru > 0 else 0
            mal_bedeli_eur    = fatura_bedeli_eur - navlun_eur - sigorta_eur

        cur.execute('''
            UPDATE shipments
            SET mal_bedeli_eur = %s,
                navlun_eur = %s,
                sigorta_eur = %s,
                fatura_bedeli_eur = %s,
                fatura_bedeli_tl = %s
            WHERE id = %s
        ''', (
            round(mal_bedeli_eur, 2),
            round(navlun_eur, 2),
            round(sigorta_eur, 2),
            round(fatura_bedeli_eur, 2),
            round(fatura_bedeli_tl, 2),
            shipment_id,
        ))
        conn.commit()

        return jsonify({
            'success': True,
            'shipment': get_shipment(shipment_id),
            'pdfFields': pdf_fields,
        })
    finally:
        cur.close()
        conn.close()


def bulk_repair_freight_kz_ge():
    """
    Tüm KAZAKİSTAN ve GÜRCİSTAN sevkiyatlarını tarar, storage'daki orijinal
    PDF'ten navlun/sigorta/fatura_bedeli alanlarını double-count olmadan
    yeniden hesaplar.
    Döner: (onarilan, atlanan, hatalar)
    """
    conn = get_conn()
    cur = conn.cursor()
    cur.execute('''
        SELECT id FROM shipments
        WHERE upper(ulke) IN ('KAZAKİSTAN', 'GÜRCİSTAN')
        ORDER BY id
    ''')
    ids = [r[0] for r in cur.fetchall()]
    cur.close()
    conn.close()

    onarilan, atlanan, hatalar = 0, 0, []
    for sid in ids:
        try:
            resp = repair_shipment_freight(sid=sid)
            data = resp.get_json()
            if data.get('success'):
                onarilan += 1
            else:
                atlanan += 1
                hatalar.append(f'id {sid}: {data.get("error")}')
        except Exception as e:
            atlanan += 1
            hatalar.append(f'id {sid}: {str(e)}')

    return onarilan, atlanan, hatalar


def repair_shipment_usd(sid=None, fatura_no=None):
    """
    KZ/GE sevkiyatları için USD navlun/sigorta/kur alanlarını
    storage'daki orijinal PDF'ten yeniden hesaplar.
    """
    from api.kur import get_tcmb_kurlar

    if not sid and not fatura_no:
        return jsonify({'success': False, 'error': 'id veya fatura_no gerekli'})

    conn = get_conn()
    cur = conn.cursor()
    try:
        if sid:
            cur.execute('SELECT id, fatura_no, ulke FROM shipments WHERE id = %s', (int(sid),))
        else:
            cur.execute('SELECT id, fatura_no, ulke FROM shipments WHERE fatura_no = %s', (fatura_no,))
        shipment = cur.fetchone()
        if not shipment:
            return jsonify({'success': False, 'error': 'Sevkiyat bulunamadı'})

        shipment_id, shipment_fatura_no, ulke = shipment
        ulke_norm = str(ulke or '').strip().upper()

        cur.execute('''
            SELECT file_paths FROM storage_records
            WHERE fatura_no = %s ORDER BY tarih DESC
        ''', (shipment_fatura_no,))

        pdf_path = ''
        for (file_paths,) in cur.fetchall():
            if isinstance(file_paths, str):
                try:
                    file_paths = json.loads(file_paths)
                except Exception:
                    file_paths = {}
            candidate = file_paths.get('pdf') if isinstance(file_paths, dict) else ''
            if candidate and os.path.exists(candidate):
                pdf_path = candidate
                break

        if not pdf_path:
            return jsonify({'success': False, 'error': 'Bu fatura için storage PDF bulunamadı'})

        with open(pdf_path, 'rb') as f:
            pdf_fields = parse_pdf(f.read())

        navlun_pdf  = float(pdf_fields.get('navlun') or 0)
        sigorta_pdf = float(pdf_fields.get('sigorta') or 0)
        pdf_kur     = float(pdf_fields.get('kur') or 0)

        if navlun_pdf <= 0 and sigorta_pdf <= 0:
            return jsonify({'success': False, 'error': 'PDF içinde navlun/sigorta tutarı bulunamadı', 'pdfFields': pdf_fields})

        kurlar = get_tcmb_kurlar()
        api_eur_kuru   = float(kurlar.get('TRY', 0) or 0)   # TRY/EUR
        api_usd_per_eur = float(kurlar.get('USD', 0) or 1)  # 1 EUR = X USD
        api_try_usd = (api_eur_kuru / api_usd_per_eur) if api_usd_per_eur else 0  # TRY/USD

        # KZ/GE: PDF kuru zaten TRY/USD — diğer ülkelerde API TRY/USD kullan
        kz_ge = ulke_norm in {'KAZAKİSTAN', 'GÜRCİSTAN'}
        usd_kuru = (pdf_kur if pdf_kur > 0 else api_try_usd) if kz_ge else api_try_usd
        if usd_kuru <= 0:
            return jsonify({'success': False, 'error': 'USD kuru hesaplanamadı'})

        navlun_usd  = navlun_pdf  / usd_kuru
        sigorta_usd = sigorta_pdf / usd_kuru

        cur.execute('''
            UPDATE shipments
            SET navlun_usd = %s, sigorta_usd = %s, usd_kuru = %s
            WHERE id = %s
        ''', (
            round(navlun_usd, 2),
            round(sigorta_usd, 2),
            round(usd_kuru, 4),
            shipment_id,
        ))
        conn.commit()

        return jsonify({
            'success': True,
            'shipment': get_shipment(shipment_id),
            'pdfFields': pdf_fields,
        })
    finally:
        cur.close()
        conn.close()


def bulk_repair_usd():
    """
    Tüm KZ/GE sevkiyatlarını tarar, usd_kuru = 0 olanları onarır.
    Döner: (onarilan, atlanan, hatalar)
    """
    conn = get_conn()
    cur = conn.cursor()
    cur.execute('''
        SELECT id FROM shipments
        WHERE (usd_kuru IS NULL OR usd_kuru = 0)
        ORDER BY id
    ''')
    ids = [r[0] for r in cur.fetchall()]
    cur.close()
    conn.close()

    onarilan, atlanan, hatalar = 0, 0, []
    for sid in ids:
        try:
            resp = repair_shipment_usd(sid=sid)
            data = resp.get_json()
            if data.get('success'):
                onarilan += 1
            else:
                atlanan += 1
                hatalar.append(f'id {sid}: {data.get("error")}')
        except Exception as e:
            atlanan += 1
            hatalar.append(f'id {sid}: {str(e)}')

    return onarilan, atlanan, hatalar

def shipments_delete():
    body = request.get_json() or {}
    sid  = body.get('id')
    if not sid:
        return jsonify({'success': False, 'error': 'id gerekli'}), 400
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute('DELETE FROM shipments WHERE id = %s', (int(sid),))
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({'success': True})
def bulk_update_shipments(rows):
    """
    Excel'den parse edilmiş satır listesini fatura_no eşleşimine göre günceller.
    rows: list of dict
    Döner: (guncellenen, atlanan, hatalar)
    """
    conn = get_conn()
    cur  = conn.cursor()
    guncellenen, atlanan, hatalar = 0, 0, []

    def to_float(v):
        try:
            if v in (None, '', 'nan'): return None
            s = str(v).strip()
            # Para birimi kelimelerini temizle
            s = s.replace('EUR', '').replace('USD', '').replace('BAM', '').replace('TRY', '')
            # Para birimi sembollerini temizle
            s = s.replace('€', '').replace('$', '').replace('₺', '').replace('£', '')
            # Boşluk ve non-breaking space temizle
            s = s.replace('\xa0', '').replace('\u202f', '').replace(' ', '')
            # Binlik ayraç ve ondalık düzelt
            # 1.234,56 formatı (Türkçe) → 1234.56
            if ',' in s and '.' in s:
                if s.rfind(',') > s.rfind('.'):
                    # Türkçe format: 1.234,56
                    s = s.replace('.', '').replace(',', '.')
                else:
                    # İngilizce format: 1,234.56
                    s = s.replace(',', '')
            elif ',' in s:
                s = s.replace(',', '.')
            s = s.strip()
            if not s or s == '-': return None
            return float(s)
        except: return None

    def to_date(v):
        if not v or str(v).strip() in ('', 'nan', 'None'): return None
        s = str(v).strip()
        if '/' in s:
            parts = s.split('/')
            if len(parts) == 3 and len(parts[2]) == 4:
                return f"{parts[2]}-{parts[1].zfill(2)}-{parts[0].zfill(2)}"
        if '.' in s:
            parts = s.split('.')
            if len(parts) == 3 and len(parts[2]) == 4:
                return f"{parts[2]}-{parts[1].zfill(2)}-{parts[0].zfill(2)}"
        return s[:10] if len(s) >= 10 else None

    def to_str(v):
        if v is None or str(v).strip() in ('', 'nan', 'None'): return None
        return str(v).strip()

    for i, row in enumerate(rows):
        try:
            fatura_no = to_str(row.get('fatura_no'))
            if not fatura_no:
                atlanan += 1
                hatalar.append(f'Satır {i+1}: fatura_no boş, atlandı.')
                continue

            # Kayıt var mı kontrol et, musteri_tipi, kur ve mevcut navlun/sigortayı da al
            cur.execute('''
                SELECT id, musteri_tipi, eur_kuru, ulke, navlun_eur, sigorta_eur
                FROM shipments
                WHERE fatura_no = %s
            ''', (fatura_no,))
            existing = cur.fetchone()
            if not existing:
                atlanan += 1
                hatalar.append(f'Satır {i+1}: {fatura_no} bulunamadı, atlandı.')
                continue
            db_musteri_tipi = existing[1] or ''
            db_eur_kuru = float(existing[2]) if existing[2] else 0
            db_ulke = str(existing[3] or '').strip().upper()
            db_navlun_eur = float(existing[4] or 0)
            db_sigorta_eur = float(existing[5] or 0)

            # Sadece gönderilen alanları güncelle (None olanları atla)
            fields = {}
            mapping = {
                'ulke': to_str, 'ihracat_dosya_no': to_str,
                'nakliye_firmasi': to_str, 'plaka': to_str,
                'fatura_bedeli_tl': to_float, 'mal_bedeli_tl': to_float,
                'mal_bedeli_eur': to_float, 'navlun_eur': to_float,
                'sigorta_eur': to_float, 'eur_kuru': to_float,
                'fatura_bedeli_eur': to_float, 'arac_bekleme': to_float,
                'ihracat_beyanname_tl': to_float, 'ihracat_beyanname_eur': to_float,
                'brokerage_eur': to_float, 'gumruk_vergisi_eur': to_float,
                'kdv_eur': to_float, 'toplam_maliyet_eur': to_float,
                'navlun_usd': to_float, 'sigorta_usd': to_float, 'usd_kuru': to_float,
                'durum': to_str,  # aşağıda varis_tarihi kontrolü yapılıyor
            }
            date_fields = ['yukleme_tarihi', 'gumruk_tarihi', 'varis_tarihi', 'gumrukleme_bitis']

            for col, fn in mapping.items():
                if col in row:
                    val = fn(row[col])
                    if val is not None:
                        fields[col] = val

            for col in date_fields:
                if col in row:
                    val = to_date(row[col])
                    if val is not None:
                        fields[col] = val

            # Durum boşsa varış tarihine göre otomatik belirle
            if 'durum' not in fields or not fields.get('durum'):
                varis = fields.get('varis_tarihi') or to_date(row.get('varis_tarihi'))
                if varis:
                    fields['durum'] = 'TESLİM EDİLDİ'
                elif 'durum' not in fields:
                    fields['durum'] = 'YOLDA'

            # Franchise/toptan/devir ise durum otomatik TESLİM EDİLDİ yap
            if db_musteri_tipi in ('franchise', 'toptan', 'devir'):
                if 'durum' not in fields or not fields.get('durum'):
                    fields['durum'] = 'TESLİM EDİLDİ'

            # fatura_bedeli_tl güncellendiyse EUR otomatik hesapla.
            # KZ/GE'de fatura TL grand total'dir; mal bedeli grand total'den
            # navlun/sigorta düşüldükten sonra kalan TL'nin kur karşılığıdır.
            if 'fatura_bedeli_tl' in fields and fields['fatura_bedeli_tl']:
                if db_eur_kuru > 0:
                    tl = float(fields['fatura_bedeli_tl'])
                    fatura_eur = tl / db_eur_kuru
                    fields['fatura_bedeli_eur'] = round(fatura_eur, 4)
                    if db_ulke in {'KAZAKİSTAN', 'GÜRCİSTAN'}:
                        navlun_eur = float(fields.get('navlun_eur', db_navlun_eur) or 0)
                        sigorta_eur = float(fields.get('sigorta_eur', db_sigorta_eur) or 0)
                        fields['mal_bedeli_eur'] = round(max(fatura_eur - navlun_eur - sigorta_eur, 0), 4)
                    else:
                        fields['mal_bedeli_eur'] = round(fatura_eur, 4)

            if not fields:
                atlanan += 1
                hatalar.append(f'Satır {i+1}: {fatura_no} — güncellenecek alan yok.')
                continue

            set_clause = ', '.join(f'{k} = %s' for k in fields)
            values = list(fields.values()) + [fatura_no]
            cur.execute(f'UPDATE shipments SET {set_clause} WHERE fatura_no = %s', values)
            conn.commit()
            guncellenen += 1

        except Exception as e:
            conn.rollback()
            hatalar.append(f'Satır {i+1}: {str(e)}')

    cur.close()
    conn.close()
    return guncellenen, atlanan, hatalar

def _otomatik_durum(durum, varis_tarihi):
    """Durum boşsa varış tarihine göre otomatik belirle."""
    if durum and durum.strip():
        return durum
    if varis_tarihi:
        return 'TESLİM EDİLDİ'
    return 'YOLDA'

def bulk_import_shipments(rows):
    """
    Excel'den parse edilmiş satır listesini toplu olarak shipments tablosuna ekler.
    rows: list of dict
    Döner: (eklenen, atlanan, hatalar)
    """
    conn = get_conn()
    cur  = conn.cursor()
    eklenen, atlanan, hatalar = 0, 0, []

    def to_float(v):
        # € $ ₺ sembollerini, boşlukları ve binlik ayraçları temizle
        try:
            if v in (None, '', 'nan'): return 0.0
            s = str(v).strip()
            # Para birimi kelimelerini temizle
            s = s.replace('EUR', '').replace('USD', '').replace('BAM', '').replace('TRY', '')
            # Para birimi sembollerini temizle
            s = s.replace('€', '').replace('$', '').replace('₺', '')
            s = s.replace('\xa0', '').replace(' ', '')
            # 1,234.56 formatı (binlik virgül, ondalık nokta)
            if ',' in s and '.' in s:
                s = s.replace(',', '')
            # 1.234,56 formatı (binlik nokta, ondalık virgül)
            elif ',' in s and '.' not in s:
                s = s.replace(',', '.')
            s = s.strip()
            if not s or s == '-': return 0.0
            return float(s)
        except: return 0.0

    def to_date(v):
        # Tarihi YYYY-MM-DD formatına çevir
        if not v or str(v).strip() in ('', 'nan', 'None'): return None
        s = str(v).strip()
        # DD/MM/YYYY → YYYY-MM-DD
        if '/' in s:
            parts = s.split('/')
            if len(parts) == 3 and len(parts[2]) == 4:
                return f"{parts[2]}-{parts[1].zfill(2)}-{parts[0].zfill(2)}"
        # DD.MM.YYYY → YYYY-MM-DD
        if '.' in s:
            parts = s.split('.')
            if len(parts) == 3 and len(parts[2]) == 4:
                return f"{parts[2]}-{parts[1].zfill(2)}-{parts[0].zfill(2)}"
        # Zaten YYYY-MM-DD veya uzun string, ilk 10 karakter al
        return s[:10] if len(s) >= 10 else None

    def to_str(v):
        if v is None or str(v).strip() in ('', 'nan', 'None'): return ''
        return str(v).strip()

    for i, row in enumerate(rows):
        try:
            fatura_no = to_str(row.get('fatura_no'))
            if fatura_no:
                cur.execute('SELECT id FROM shipments WHERE fatura_no = %s', (fatura_no,))
                if cur.fetchone():
                    atlanan += 1
                    hatalar.append(f'Satır {i+1}: {fatura_no} zaten kayıtlı, atlandı.')
                    continue

            ulke         = to_str(row.get('ulke'))
            musteri_tipi = to_str(row.get('musteri_tipi')) or _musteri_tipi_from_ulke(ulke)

            cur.execute('''
                INSERT INTO shipments (
                    arac_sira_no, ulke, ihracat_dosya_no, nakliye_firmasi, plaka,
                    fatura_no, palet, aciklama,
                    fatura_bedeli_tl, mal_bedeli_tl, mal_bedeli_eur,
                    navlun_eur, sigorta_eur, eur_kuru, fatura_bedeli_eur,
                    arac_bekleme, ihracat_beyanname_tl, ihracat_beyanname_eur,
                    brokerage_yerel, brokerage_birim, brokerage_eur,
                    gumruk_vergisi_yerel, gumruk_vergisi_birim, gumruk_vergisi_eur,
                    kdv_yerel, kdv_birim, kdv_eur,
                    toplam_maliyet_eur,
                    navlun_usd, sigorta_usd, usd_kuru,
                    yukleme_tarihi, gumruk_tarihi, varis_tarihi, gumrukleme_bitis,
                    durum, musteri_tipi
                ) VALUES (
                    %s,%s,%s,%s,%s,%s,%s,%s,
                    %s,%s,%s,%s,%s,%s,%s,
                    %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                    %s,%s,%s,
                    %s,%s,%s,%s,%s,%s
                )
            ''', (
                row.get('arac_sira_no') or None,
                ulke,
                to_str(row.get('ihracat_dosya_no')),
                to_str(row.get('nakliye_firmasi')),
                to_str(row.get('plaka')),
                fatura_no,
                to_str(row.get('palet')),
                to_str(row.get('aciklama')),
                to_float(row.get('fatura_bedeli_tl')),
                to_float(row.get('mal_bedeli_tl')),
                to_float(row.get('mal_bedeli_eur')),
                to_float(row.get('navlun_eur')),
                to_float(row.get('sigorta_eur')),
                to_float(row.get('eur_kuru')),
                to_float(row.get('fatura_bedeli_eur')),
                to_float(row.get('arac_bekleme')),
                to_float(row.get('ihracat_beyanname_tl')),
                to_float(row.get('ihracat_beyanname_eur')),
                to_float(row.get('brokerage_yerel')),
                to_str(row.get('brokerage_birim')),
                to_float(row.get('brokerage_eur')),
                to_float(row.get('gumruk_vergisi_yerel')),
                to_str(row.get('gumruk_vergisi_birim')),
                to_float(row.get('gumruk_vergisi_eur')),
                to_float(row.get('kdv_yerel')),
                to_str(row.get('kdv_birim')),
                to_float(row.get('kdv_eur')),
                to_float(row.get('toplam_maliyet_eur')),
                to_float(row.get('navlun_usd')),
                to_float(row.get('sigorta_usd')),
                to_float(row.get('usd_kuru')),
                to_date(row.get('yukleme_tarihi')),
                to_date(row.get('gumruk_tarihi')),
                (to_date(row.get('gumruk_tarihi')) or to_date(row.get('varis_tarihi'))) if musteri_tipi in ('franchise', 'toptan', 'devir') else to_date(row.get('varis_tarihi')),
                (to_date(row.get('gumruk_tarihi')) or to_date(row.get('gumrukleme_bitis'))) if musteri_tipi in ('franchise', 'toptan', 'devir') else to_date(row.get('gumrukleme_bitis')),
                'TESLİM EDİLDİ' if musteri_tipi in ('franchise', 'toptan', 'devir') else _normalize_durum(_otomatik_durum(to_str(row.get('durum', '')), to_date(row.get('varis_tarihi')))),
                musteri_tipi,
            ))
            conn.commit()
            eklenen += 1
        except Exception as e:
            conn.rollback()
            hatalar.append(f'Satır {i+1}: {str(e)}')

    cur.close()
    conn.close()
    return eklenen, atlanan, hatalar


# ── FR PDF TOPLU IMPORT ENDPOINT ─────────────────────────────────────────────
def parse_fr_pdf_import():
    """
    Çoklu FR fatura PDF'lerini parse eder, önizleme için veri döner.
    POST /api/shipments/parse-fr-pdf
    Body: { "pdfs": [ { "name": "ANT2026...", "data": "<base64>" }, ... ] }
    """
    import base64

    body = request.get_json() or {}
    pdfs = body.get('pdfs', [])

    if not pdfs:
        return jsonify({'success': False, 'error': 'PDF listesi boş'}), 400

    sonuclar = []

    for item in pdfs:
        name     = item.get('name', '')
        b64data  = item.get('data', '')

        try:
            pdf_bytes = base64.b64decode(b64data)
            parsed    = parse_fr_fatura_pdf(pdf_bytes)

            usd_kuru = parsed.get('usd_kuru', 0.0)
            if not usd_kuru and parsed.get('yukleme_tarihi'):
                usd_kuru = _get_usd_kuru_for_date(parsed['yukleme_tarihi'])

            para_birimi = parsed.get('para_birimi', 'TL')
            usd_tutar   = parsed.get('fatura_bedeli_usd', 0.0)
            eur_tutar   = parsed.get('fatura_bedeli_eur', 0.0)
            tl_tutar    = parsed.get('fatura_bedeli_tl', 0.0)
            tl_tutar_pdf = parsed.get('fatura_bedeli_tl_pdf', 0.0)

            # TL hesapla — para birimine göre
            # Fatura PDF'inde "Ödenecek Tutar (TL)" doğrudan yazıyorsa, kur ile
            # yeniden hesaplamak yerine faturayla birebir eşleşmesi için o değer kullanılır.
            if tl_tutar_pdf:
                fatura_tl = tl_tutar_pdf
            elif para_birimi == 'USD' and usd_kuru:
                fatura_tl = round(usd_tutar * usd_kuru, 2)
            elif para_birimi == 'EUR' and usd_kuru:
                fatura_tl = round(eur_tutar * usd_kuru, 2)  # usd_kuru burada EUR/TL kuru
            elif para_birimi == 'TL':
                fatura_tl = tl_tutar
            else:
                fatura_tl = 0.0

            sonuclar.append({
                'dosya_adi':         name,
                'fatura_no':         parsed.get('fatura_no'),
                'yukleme_tarihi':    parsed.get('yukleme_tarihi'),
                'para_birimi':       para_birimi,
                'fatura_bedeli_usd': usd_tutar,
                'fatura_bedeli_eur': eur_tutar,
                'usd_kuru':          usd_kuru,
                'fatura_bedeli_tl':  fatura_tl,
                'palet':             parsed.get('palet'),
                'hata':              None,
            })

        except Exception as e:
            sonuclar.append({
                'dosya_adi': name,
                'fatura_no': None,
                'hata':      str(e),
            })

    return jsonify({'success': True, 'sonuclar': sonuclar})


def bulk_import_fr_shipments():
    """
    Parse edilmiş FR faturalarını toplu olarak shipments tablosuna ekler.
    POST /api/shipments/bulk-import-fr
    Body: { "rows": [ { fatura_no, yukleme_tarihi, fatura_bedeli_usd, usd_kuru, fatura_bedeli_tl, eur_kuru } ] }
    """
    body = request.get_json() or {}
    rows = body.get('rows', [])

    if not rows:
        return jsonify({'success': False, 'error': 'Satır listesi boş'}), 400

    eklenen, atlanan, hatalar = 0, 0, []

    for i, row in enumerate(rows):
        try:
            fatura_no = str(row.get('fatura_no', '')).strip()
            if not fatura_no:
                atlanan += 1
                hatalar.append(f'Satır {i+1}: fatura_no boş, atlandı.')
                continue

            conn = get_conn()
            cur  = conn.cursor()
            cur.execute('SELECT id FROM shipments WHERE fatura_no = %s', (fatura_no,))
            if cur.fetchone():
                cur.close()
                conn.close()
                atlanan += 1
                hatalar.append(f'{fatura_no}: zaten kayıtlı, atlandı.')
                continue
            cur.close()
            conn.close()

            usd_tutar  = float(row.get('fatura_bedeli_usd', 0) or 0)
            usd_kuru   = float(row.get('usd_kuru', 0) or 0)
            fatura_tl  = float(row.get('fatura_bedeli_tl', 0) or 0)
            eur_kuru   = float(row.get('eur_kuru', 0) or 0)   # 1 EUR = kaç TL
            usd_per_eur = float(row.get('usd_per_eur', 0) or 0)  # 1 EUR = kaç USD

            # USD → EUR: usd_per_eur varsa kullan, yoksa TL üzerinden hesapla
            if usd_per_eur:
                fatura_eur = round(usd_tutar / usd_per_eur, 2)
            elif eur_kuru and usd_kuru:
                # 1 EUR = eur_kuru TL, 1 USD = usd_kuru TL → 1 EUR = eur_kuru/usd_kuru USD
                fatura_eur = round(usd_tutar / (eur_kuru / usd_kuru), 2)
            else:
                fatura_eur = 0.0

            yukleme_tarihi = row.get('yukleme_tarihi') or None

            # TL faturalar için EUR'yu kur üzerinden hesapla
            if not fatura_eur and fatura_tl and eur_kuru:
                fatura_eur = round(fatura_tl / eur_kuru, 2)

            new_id = create_shipment({
                'fatura_no':          fatura_no,
                'ihracat_dosya_no':   str(row.get('ihracat_dosya_no', '') or ''),
                'ulke':               str(row.get('ulke', 'IRAK') or 'IRAK'),
                'musteri_tipi':       'franchise',
                'nakliye_firmasi':    str(row.get('nakliye_firmasi', '') or ''),
                'plaka':              str(row.get('plaka', '') or ''),
                'yukleme_tarihi':     yukleme_tarihi,
                'gumruk_tarihi':      yukleme_tarihi,
                'fatura_bedeli_tl':   fatura_tl,
                'fatura_bedeli_eur':  fatura_eur,
                'mal_bedeli_eur':     fatura_eur,
                'eur_kuru':           eur_kuru,
                'palet':              str(row.get('palet', '') or ''),
                'durum':              'TESLİM EDİLDİ',
            })
            eklenen += 1

        except ValueError as e:
            atlanan += 1
            hatalar.append(str(e))
        except Exception as e:
            hatalar.append(f'Satır {i+1}: {str(e)}')

    return jsonify({
        'success': True,
        'eklenen': eklenen,
        'atlanan': atlanan,
        'hatalar': hatalar,
    })


def _get_usd_kuru_for_date(tarih_str):
    """
    Verilen tarihe (YYYY-MM-DD) ait USD/TRY kurunu Frankfurter API'den çeker.
    Bulunamazsa 0.0 döner.
    """
    import urllib.request
    import json

    try:
        url = f'https://api.frankfurter.app/{tarih_str}?from=USD&to=TRY'
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode())
            return float(data['rates']['TRY'])
    except Exception as e:
        print(f'USD kuru API hatası ({tarih_str}): {e}')
        return 0.0


def shipments_export():
    ulke         = request.args.get('ulke')
    durum        = request.args.get('durum')
    depo         = request.args.get('depo')
    musteri_tipi = request.args.get('musteri_tipi')
    ids_raw      = request.args.get('ids')
    ids          = [int(i) for i in ids_raw.split(',') if i.strip().isdigit()] if ids_raw else None
    return export_shipments(ulke=ulke, durum=durum, depo=depo, musteri_tipi=musteri_tipi, ids=ids)

# ── GRUPLAMA ──────────────────────────────────────────────────────────────────
def group_shipments(shipment_ids):
    """Verilen id'lere yeni bir sefer_id ata."""
    if not shipment_ids:
        return

    conn = get_conn()
    cur  = conn.cursor()

    # Mevcut en yüksek sefer_id'yi bul, 1 artır
    cur.execute('SELECT COALESCE(MAX(sefer_id), 0) + 1 FROM shipments')
    new_sefer_id = cur.fetchone()[0]

    cur.execute(
        'UPDATE shipments SET sefer_id = %s WHERE id = ANY(%s)',
        (new_sefer_id, shipment_ids)
    )
    conn.commit()
    cur.close()
    conn.close()
    return new_sefer_id


def ungroup_shipment(shipment_id):
    """Tek bir kaydı gruptan çıkar."""
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute('UPDATE shipments SET sefer_id = NULL WHERE id = %s', (shipment_id,))
    conn.commit()
    cur.close()
    conn.close()
    
    
def bulk_update_palet(rows):
    """
    Fatura no eşleşimine göre palet alanını toplu günceller.
    rows: [{ fatura_no, palet }, ...]
    Döner: (guncellenen, atlanan, hatalar)
    """
    conn = get_conn()
    cur  = conn.cursor()
    guncellenen, atlanan, hatalar = 0, 0, []

    for i, row in enumerate(rows):
        try:
            fatura_no = str(row.get('fatura_no', '')).strip()
            palet     = str(row.get('palet', '')).strip()
            if not fatura_no or not palet:
                atlanan += 1
                continue

            cur.execute('SELECT id FROM shipments WHERE fatura_no = %s', (fatura_no,))
            if not cur.fetchone():
                atlanan += 1
                hatalar.append(f'{fatura_no}: kayıt bulunamadı, atlandı.')
                continue

            cur.execute('UPDATE shipments SET palet = %s WHERE fatura_no = %s', (palet, fatura_no))
            conn.commit()
            guncellenen += 1

        except Exception as e:
            conn.rollback()
            hatalar.append(f'Satır {i+1}: {str(e)}')

    cur.close()
    conn.close()
    return guncellenen, atlanan, hatalar


def bulk_delete_shipments(ids):
    """Birden fazla sevkiyatı id listesine göre siler."""
    if not ids:
        return 0
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute('DELETE FROM shipments WHERE id = ANY(%s)', (ids,))
    deleted = cur.rowcount
    conn.commit()
    cur.close()
    conn.close()
    return deleted

# ── SIRBİSTAN VERGİ PDF PARSE ────────────────────────────────────────────────
def parse_rs_vergi_pdf(pdf_bytes):
    """
    Sırbistan gümrük faturasından CARINA ve POREZ NA DODATU VREDNOST çeker.
    Format: 4.071,40 (binlik nokta, ondalık virgül)
    """
    result = {'carina': 0.0, 'pdv': 0.0, 'svega': 0.0}

    def parse_rs_sayi(s):
        s = s.strip().replace('.', '').replace(',', '.')
        try:
            return float(s)
        except:
            return 0.0

    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            text = ' '.join((p.extract_text() or '') for p in pdf.pages)
        text = re.sub(r'\s+', ' ', text)

        m = re.search(r'CARINA\s+([\d.,]+)', text)
        if m:
            result['carina'] = parse_rs_sayi(m.group(1))

        m = re.search(r'POREZ NA DODATU VREDNOST\s+([\d.,]+)', text)
        if m:
            result['pdv'] = parse_rs_sayi(m.group(1))

        m = re.search(r'SVEGA\s+([\d.,]+)', text)
        if m:
            result['svega'] = parse_rs_sayi(m.group(1))

    except Exception as e:
        print(f'RS vergi PDF parse hatası: {e}')

    return result


def update_shipment_cost_fields(shipment_id, data):
    allowed = {
        'ihracat_beyanname_eur', 'arac_bekleme', 'brokerage_eur',
        'gumruk_vergisi_eur', 'kdv_eur', 'other_costs_eur',
    }
    fields = {}
    for key in allowed:
        if key in data:
            try:
                fields[key] = float(data.get(key) or 0)
            except (TypeError, ValueError):
                fields[key] = 0.0

    if not fields:
        return

    conn = get_conn()
    cur = conn.cursor()
    cur.execute('''
        SELECT ihracat_beyanname_eur, arac_bekleme, brokerage_eur,
               gumruk_vergisi_eur, kdv_eur, other_costs_eur
        FROM shipments
        WHERE id = %s
    ''', (shipment_id,))
    row = cur.fetchone()
    if not row:
        cur.close()
        conn.close()
        raise ValueError('Sevkiyat bulunamadı')

    totals = {
        'ihracat_beyanname_eur': float(row[0] or 0),
        'arac_bekleme':          float(row[1] or 0),
        'brokerage_eur':         float(row[2] or 0),
        'gumruk_vergisi_eur':    float(row[3] or 0),
        'kdv_eur':               float(row[4] or 0),
        'other_costs_eur':       float(row[5] or 0),
    }
    totals.update(fields)
    toplam = sum(totals.values())

    set_clause = ', '.join(f'{k} = %s' for k in fields)
    values = list(fields.values()) + [toplam, shipment_id]
    cur.execute(f'''
        UPDATE shipments
        SET {set_clause}, toplam_maliyet_eur = %s
        WHERE id = %s
    ''', values)
    conn.commit()
    cur.close()
    conn.close()


def _apply_kz_avr_kalemler(result, kalemler):
    brokerage_kalemler = {1, 2, 4}
    for no, item in sorted(kalemler.items()):
        tutar = float(item.get('tutar') or 0)
        if tutar <= 0:
            continue
        result['kalemler'].append({'no': no, 'ad': item.get('ad') or f'Kalem {no}', 'tutar': tutar})
        if no in brokerage_kalemler:
            result['brokerage_kzt'] += tutar
        else:
            result['other_costs_kzt'] += tutar


def _set_kz_avr_eur_values(result):
    import json
    import urllib.request

    try:
        url = 'https://api.exchangerate-api.com/v4/latest/EUR'
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=5) as resp:
            rates = json.loads(resp.read()).get('rates', {})
        kzt_per_eur = float(rates.get('KZT', 0) or 0)
        result['kzt_per_eur'] = round(kzt_per_eur, 4)
        if kzt_per_eur > 0:
            result['brokerage_eur'] = round(result['brokerage_kzt'] / kzt_per_eur, 2)
            result['other_costs_eur'] = round(result['other_costs_kzt'] / kzt_per_eur, 2)
    except Exception as e:
        print(f'[KZ] Kur hatası: {e}')


def parse_kz_avr_image(image_bytes):
    """
    KZ AVR tablo görselinden 7 kalem tutarını okur.
    Цена = Сумма (adet=1) olduğu için sağ sütundaki eşleşen çiftleri yakalar.
    Итого ve KDV satırları otomatik filtrelenir.
    """
    result = {
        'brokerage_kzt':   0.0,
        'other_costs_kzt': 0.0,
        'brokerage_eur':   0.0,
        'other_costs_eur': 0.0,
        'kzt_per_eur':     0.0,
        'kalemler':        [],
    }

    BROKERAGE_KALEMLER = {1, 2, 4}

    def parse_kzt(s):
        # "165 000,00" veya "165000,00" → float
        s = str(s).strip()
        s = s.replace('\xa0', ' ').replace('\u202f', ' ')
        # Boşluklu binlik ayraç: "165 000,00" → "165000,00"
        s = re.sub(r'(\d)\s+(\d)', r'\1\2', s)
        s = re.sub(r'[^\d,.]', '', s)
        if ',' in s and '.' in s:
            if s.rfind(',') > s.rfind('.'):
                s = s.replace('.', '').replace(',', '.')
            else:
                s = s.replace(',', '')
        elif ',' in s:
            s = s.replace(',', '.')
        try:
            return float(s)
        except ValueError:
            return 0.0

    try:
        import pytesseract
        from PIL import Image, ImageOps, ImageFilter

        img = Image.open(io.BytesIO(image_bytes)).convert('L')
        w, h = img.size

        # Kontrastı artır, 2x büyüt
        img = ImageOps.autocontrast(img)
        img = img.resize((w * 2, h * 2), Image.LANCZOS)

        # Sadece Цена sütununu al (sağdan ikinci sütun, ~%55-78 arası)
        right = img.crop((int(img.width * 0.55), 0, int(img.width * 0.78), img.height))

        # OCR — boşluk dahil sayı karakterleri
        config = '--psm 6 -c tessedit_char_whitelist=0123456789., '
        text = pytesseract.image_to_string(right, lang='eng', config=config)
        print(f'[KZ IMG] Sağ sütun OCR:\n{text[:400]}')

        # Tüm sayıları satır satır çek
        # Her satırda 2 sayı var: Цена ve Сумма (eşit olduğu için biri yeterli)
        all_values = []
        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue
            # Boşluklu binlik ayraç düzelt: "165 000,00" → "165000,00"
            line = re.sub(r'(\d)\s+(\d)', r'\1\2', line)
            # Satırdaki tüm sayıları bul
            nums = re.findall(r'\d+[.,]\d{2}', line)
            parsed = [parse_kzt(n) for n in nums]
            parsed = [v for v in parsed if v >= 1000]  # Kol-vo "1,000" gibi küçükleri çıkar
            if parsed:
                all_values.append(parsed)

        print(f'[KZ IMG] Satır değerleri: {all_values}')

        # Her satırdan ilk değeri al (Цена sütunu)
        # Итого toplamını bul — diğerlerinin toplamına eşit olan değer
        flat = [row[0] for row in all_values if row]
        print(f'[KZ IMG] Düz liste: {flat}')

        if not flat:
            result['_hata'] = 'Hiç sayı okunamadı'
            return result

        # Итого'yu tespit et: en büyük değer veya diğerlerinin toplamı olan değer
        itogo = None
        for i, v in enumerate(flat):
            others = flat[:i] + flat[i+1:]
            if others and abs(sum(others) - v) < 1.0:
                itogo = v
                break

        # Итого bulunamazsa en büyük değer muhtemelen Итого
        if itogo is None and len(flat) > 7:
            itogo = max(flat)

        # Итого ve KDV'yi çıkar, kalan kalemler
        kalem_values = [v for v in flat if itogo is None or abs(v - itogo) > 1.0]

        # KDV genellikle son büyük değer — toplamın ~%16'sı civarı
        # Eğer hâlâ 7'den fazla varsa Итого sonrasını çıkar
        if len(kalem_values) > 7:
            # En büyük kalan değer muhtemelen KDV toplamı
            kdv_candidate = max(kalem_values)
            if len([v for v in kalem_values if v != kdv_candidate]) == 7:
                kalem_values = [v for v in kalem_values if v != kdv_candidate]

        print(f'[KZ IMG] Kalem değerleri ({len(kalem_values)}): {kalem_values}')

        # 7'den az varsa uyar
        if len(kalem_values) < 7:
            result['_hata'] = f'AVR tablosundaki 7 kalem okunamadı. Okunan değerler: {kalem_values}'

        # Kalem sözlüğü oluştur
        kalemler = {}
        for i, v in enumerate(kalem_values[:7]):
            kalemler[i + 1] = {'ad': f'Kalem {i + 1}', 'tutar': v}

        _apply_kz_avr_kalemler(result, kalemler)
        _set_kz_avr_eur_values(result)

    except Exception as e:
        print(f'[KZ IMG] Parse hatası: {e}')
        import traceback
        traceback.print_exc()
        result['_hata'] = str(e)

    return result


def parse_kz_avr_pdf(pdf_bytes):
    """
    Kazakistan AVR PDF'inden Итого satırını okur.
    Tüm tutarı brokerage_eur olarak döner.
    """
    import urllib.request, json as _json

    result = {
        'brokerage_kzt':   0.0,
        'other_costs_kzt': 0.0,
        'brokerage_eur':   0.0,
        'other_costs_eur': 0.0,
        'kzt_per_eur':     0.0,
        'kalemler':        [],
    }

    def parse_kzt(s):
        s = str(s).strip().replace('\xa0', '').replace('\u202f', '').replace(' ', '')
        s = re.sub(r'[^\d,.]', '', s)
        if ',' in s and '.' in s:
            s = s.replace('.', '').replace(',', '.') if s.rfind(',') > s.rfind('.') else s.replace(',', '')
        elif ',' in s:
            s = s.replace(',', '.')
        try:
            return float(s)
        except ValueError:
            return 0.0

    try:
        # Önce pdfplumber dene, boşsa OCR yap
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            text = ' '.join((p.extract_text() or '') for p in pdf.pages)
        text = re.sub(r'\s+', ' ', text).strip()

        if len(text) < 50:  # Taranmış PDF — OCR gerekli
            try:
                from pdf2image import convert_from_bytes
                import pytesseract
                # Sadece son sayfa — Итого orada, dpi düşük
                images = convert_from_bytes(pdf_bytes, dpi=100, last_page=2, first_page=2)
                if not images:
                    images = convert_from_bytes(pdf_bytes, dpi=100, last_page=1)
                # Sadece sayfa alt yarısı — Итого hep altta
                img = images[0]
                w, h = img.size
                img = img.crop((0, int(h * 0.6), w, h))
                text = pytesseract.image_to_string(img, lang='rus')
                text = re.sub(r'\s+', ' ', text)
                print(f'[KZ PDF] OCR text preview: {text[:300]}')
            except Exception as ocr_err:
                print(f'[KZ PDF] OCR hatası: {ocr_err}')
        else:
            print(f'[KZ PDF] pdfplumber text preview: {text[:300]}')

        # Итого satırını yakala — Kiril veya bozuk encoding dahil
        m = re.search(r'(?:Итого|Итого|ИТОГО|\u0418\u0442\u043e\u0433\u043e)[:\s]+([\d\s]+[,.][\d]{2})', text)
        if not m:
            # Fallback: "x 702 062,00" formatı — tablodaki son büyük sayıyı al
            numbers = re.findall(r'(\d{1,3}(?:\s\d{3})*[,.]\d{2})', text)
            big = [parse_kzt(n) for n in numbers if parse_kzt(n) >= 50000]
            if not big:
                raise ValueError('Итого satırı bulunamadı')
            itogo = max(big)
        else:
            itogo = parse_kzt(m.group(1))
        print(f'[KZ PDF] Итого: {itogo}')

        result['brokerage_kzt'] = itogo
        result['kalemler'] = [{'no': 1, 'ad': 'Итого', 'tutar': itogo}]

        # KZT/EUR kuru
        try:
            url = 'https://api.exchangerate-api.com/v4/latest/EUR'
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=5) as resp:
                rates = _json.loads(resp.read()).get('rates', {})
            kzt_per_eur = float(rates.get('KZT', 0) or 0)
            result['kzt_per_eur'] = round(kzt_per_eur, 4)
            if kzt_per_eur > 0:
                result['brokerage_eur'] = round(itogo / kzt_per_eur, 2)
        except Exception as e:
            print(f'[KZ] Kur hatası: {e}')

    except Exception as e:
        print(f'[KZ PDF] Parse hatası: {e}')
        import traceback
        traceback.print_exc()
        result['_hata'] = str(e)

    return result


def parse_rs_brokerage_pdf(pdf_bytes):
    """
    M&M gibi Sırbistan spediter faturasından 'Naši troškovi bez PDV-a' tutarını çeker.
    Format: 13.616,06 (binlik nokta, ondalık virgül)
    """
    result = {'nasi_troskovi': 0.0}

    def parse_rs_sayi(s):
        s = s.strip().replace('.', '').replace(',', '.')
        try:
            return float(s)
        except:
            return 0.0

    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            text = ' '.join((p.extract_text() or '') for p in pdf.pages)
        text = re.sub(r'\s+', ' ', text)

        m = re.search(r'Na[šs]i tro[šs]kovi bez PDV-a[:\s]*([\d.,]+)', text, re.IGNORECASE)
        if m:
            result['nasi_troskovi'] = parse_rs_sayi(m.group(1))

    except Exception as e:
        print(f'RS brokerage PDF parse hatası: {e}')

    return result

def parse_ge_broker_pdf(pdf_bytes):
    """
    Gebrüder Weiss broker faturasından KDV hariç tutarı çeker.
    'ღირ-ბა დღგ-ს გარეშე GEL XXX' satırından alınır.
    Format: 217,55 (ondalık virgül)
    """
    result = {'brokerage': 0.0}

    def parse_gel(s):
        s = s.strip().replace(',', '.')
        try:
            return float(s)
        except:
            return 0.0

    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            text = ' '.join((p.extract_text() or '') for p in pdf.pages)
        text = re.sub(r'\s+', ' ', text)

        m = re.search(r'ღირ-ბა\s+დღგ-ს\s+გარეშე\s+GEL\s+([\d,]+)', text)
        if m:
            result['brokerage'] = parse_gel(m.group(1))

    except Exception as e:
        print(f'GE broker PDF parse hatası: {e}')

    return result


def parse_ge_im_pdf(pdf_bytes):
    """
    Gürcistan ithalat beyanından (sadece son sayfa) KDV (kod 28) ve gümrük vergisi (kod 20) çeker.
    სახე ჯამი ... სულ ჯამი arası özet bölümden alınır.
    Format: 21,453.80 (nokta ondalık)
    """
    result = {'kdv': 0.0, 'vergi': 0.0, 'toplam': 0.0}

    def parse_gel(s):
        s = s.strip().replace(',', '')
        try:
            return float(s)
        except:
            return 0.0

    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            last_text = pdf.pages[-1].extract_text() or ''
        text = re.sub(r'\s+', ' ', last_text)

        # "სახე ჯამი" ile "სულ ჯამი" arasındaki özet bölümü bul
        m_section = re.search(r'სახე\s+ჯამი(.*?)სულ\s+ჯამი', text, re.DOTALL)
        if m_section:
            section = m_section.group(1)
            # Özet satırında sadece "KOD TUTAR" var (detay satırlarında rate ve computed da var)
            m28 = re.search(r'\b28\b\s+([\d,]+\.?\d*)', section)
            if m28:
                result['kdv'] = parse_gel(m28.group(1))
            m20 = re.search(r'\b20\b\s+([\d,]+\.?\d*)', section)
            if m20:
                result['vergi'] = parse_gel(m20.group(1))

        m_total = re.search(r'სულ\s+ჯამი\s+([\d,]+\.?\d*)', text)
        if m_total:
            result['toplam'] = parse_gel(m_total.group(1))

    except Exception as e:
        print(f'GE IM PDF parse hatası: {e}')

    return result


def parse_ko_pdf(pdf_bytes):
    """
    Kosova gümrük ödeme emrinden (Urdhërpagesë) CD (Dogana/vergi) ve VT (TVSH/KDV) çeker.
    Tutarlar zaten EUR (E pagueshme/EUR) — kur çevrimi gerekmez.
    Format: 5,407.05 (virgül binlik, nokta ondalık)
    """
    result = {'vergi': 0.0, 'kdv': 0.0, 'toplam': 0.0}

    def parse_eur(s):
        s = s.strip().replace(',', '')
        try:
            return float(s)
        except:
            return 0.0

    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            text = ' '.join((p.extract_text() or '') for p in pdf.pages)
        text = re.sub(r'\s+', ' ', text)

        m_cd = re.search(r'\bCD\s+Dogana\s+([\d,]+\.\d+)', text)
        if m_cd:
            result['vergi'] = parse_eur(m_cd.group(1))

        m_vt = re.search(r'\bVT\s+TVSH\s+([\d,]+\.\d+)', text)
        if m_vt:
            result['kdv'] = parse_eur(m_vt.group(1))

        m_total = re.search(r'Totali\s+i\s+pagueshëm\s+([\d,]+\.\d+)', text)
        if m_total:
            result['toplam'] = parse_eur(m_total.group(1))

    except Exception as e:
        print(f'KO gümrük PDF parse hatası: {e}')

    return result


def parse_de_vergi_pdf(pdf_bytes):
    """
    Almanya (NIETEN Zollservice vb.) Rechnung/Vorauskassa faturasından kalemleri çeker.
    Her iki belge tipinde de alan etiketleri (Zoll, Einfuhrumsatzsteuer, ...) aynıdır.
    PDF'te metin katmanı yoksa (taranmış/görüntü çıktısı) pytesseract ile OCR (lang='deu') yapılır.
    Tutarlar zaten EUR — kur çevrimi gerekmez. Tek evrak tek sevkiyat, oranlama yok.
    Format: 1258,82 / 4.071,40 (binlik nokta, ondalık virgül)

    Eşleme:
      Zoll + Ausgleichs- und Antidumpingzoll          → gumruk_vergisi
      Einfuhrumsatzsteuer                             → kdv
      Weitere Tarifposition (Einfuhr) + Zollabfertigung → brokerage
      Vorauskassenabwicklung + Speditionsversicherung
        + ATLAS-Informatikgebühr + Porti/Papiere      → other_costs
    """
    result = {'gumruk_vergisi': 0.0, 'kdv': 0.0, 'brokerage': 0.0, 'other_costs': 0.0}

    def parse_de_sayi(s):
        s = s.strip().replace('.', '').replace(',', '.')
        try:
            return float(s)
        except:
            return 0.0

    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            text = ' '.join((p.extract_text() or '') for p in pdf.pages)
        text = re.sub(r'\s+', ' ', text).strip()

        if len(text) < 50:  # Metin katmanı yok — taranmış/görüntü PDF, OCR gerekli
            try:
                from pdf2image import convert_from_bytes
                import pytesseract
                images = convert_from_bytes(pdf_bytes, dpi=200, first_page=1, last_page=1)
                text = ' '.join(pytesseract.image_to_string(img, lang='deu') for img in images)
                text = re.sub(r'\s+', ' ', text).strip()
            except Exception as ocr_err:
                print(f'DE PDF OCR hatası: {ocr_err}')

        def bul(pattern):
            m = re.search(pattern, text)
            return parse_de_sayi(m.group(1)) if m else 0.0

        zoll        = bul(r'\bZoll\b\s+([\d.,]+)')
        antidumping = bul(r'Ausgleichs-\s*und\s*Antidumpingzoll\s+([\d.,]+)')
        einfuhr_ust = bul(r'Einfuhrumsatzsteuer\s+([\d.,]+)')
        tarifpos    = bul(r'Weitere Tarifposition\s*\(Einfuhr\)\s+([\d.,]+)')
        zollabf     = bul(r'\bZollabfertigung\b\s+([\d.,]+)')
        vorauskasse = bul(r'Vorauskassenabwicklung\s+([\d.,]+)')
        speditionsv = bul(r'Speditionsversicherung\s+([\d.,]+)')
        atlas       = bul(r'ATLAS-Informatikgeb\w*\s+([\d.,]+)')
        porti       = bul(r'Porti/Papiere\s+([\d.,]+)')

        result['gumruk_vergisi'] = round(zoll + antidumping, 2)
        result['kdv']            = round(einfuhr_ust, 2)
        result['brokerage']      = round(tarifpos + zollabf, 2)
        result['other_costs']    = round(vorauskasse + speditionsv + atlas + porti, 2)

    except Exception as e:
        print(f'DE vergi PDF parse hatası: {e}')

    return result


def parse_nl_broker_pdf(pdf_bytes):
    """
    NedLine Logistics (Hollanda) gümrük/broker faturasından "Mark" sütunundaki
    kodlara göre kalemleri toplar. Referans no formatı (ANT.../IHR...) fark etmez.
    Tutarlar zaten EUR — kur çevrimi gerekmez. Tek evrak tek sevkiyat, oranlama yapılmaz.
    Format: 2.152,70 / 100,00 (binlik nokta, ondalık virgül)

    Eşleme:
      CC + T1 + CCHS (Customs Clearance + T1 + Customs Clearance Extra Hs) → brokerage
      TAX + TAXFEE (Invoerrechten + Invoerrechten Fee)                     → vergi
    """
    result = {'brokerage': 0.0, 'vergi': 0.0}

    def parse_eur(s):
        s = s.strip().replace('.', '').replace(',', '.')
        try:
            return float(s)
        except:
            return 0.0

    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            text = ' '.join((p.extract_text() or '') for p in pdf.pages)
        text = re.sub(r'\s+', ' ', text)

        def toplam(mark):
            return sum(parse_eur(m) for m in re.findall(r'\b' + mark + r'\b\s+([\d.,]+)', text))

        result['brokerage'] = round(toplam('CC') + toplam('T1') + toplam('CCHS'), 2)
        result['vergi']     = round(toplam('TAX') + toplam('TAXFEE'), 2)

    except Exception as e:
        print(f'NL broker PDF parse hatası: {e}')

    return result


def _parse_kzt_sayi(s):
    """KZT sayı formatı: '702 062,00' veya '3167375,35' — boşluk/nokta binlik, virgül ondalık."""
    s = s.strip().replace('\xa0', '').replace(' ', '').replace('.', '').replace(',', '.')
    try:
        return float(s)
    except (TypeError, ValueError):
        return 0.0


def parse_kz_beyanname_pdf(pdf_bytes):
    """
    Kazakistan gümrük beyannamesinin (ДЕКЛАРАЦИЯ НА ТОВАРЫ) ilk sayfasındaki
    "В ПОДРОБНОСТИ ПОДСЧЕТА" özet kutusundan çeker.
    Kod 1010 (beyan ücreti) + 2010 (ithalat gümrük vergisi) → vergi
    Kod 5060 (KDV) → kdv
    Kodlar ve tutarlar ayrı bloklar halinde (1010 2010 5060 ... tutar tutar tutar) çıkarıldığından
    önce kod token'ları temizlenip sadece tutarlar sırayla eşleştirilir.
    """
    result = {'vergi': 0.0, 'kdv': 0.0}

    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            text = pdf.pages[0].extract_text() or ''
        text = re.sub(r'\s+', ' ', text)

        m_section = re.search(r'В\s+ПОДРОБНОСТИ\s+ПОДСЧЕТА(.*?)Общая\s+сумма', text, re.DOTALL)
        if m_section:
            section = re.sub(r'\b(1010|2010|5060)\b', ' ', m_section.group(1))
            amounts = re.findall(r'(\d[\d\s.]*,\d{2})\s*KZT', section)
            if len(amounts) >= 3:
                beyan_ucreti = _parse_kzt_sayi(amounts[0])
                gumruk_v     = _parse_kzt_sayi(amounts[1])
                result['kdv']   = _parse_kzt_sayi(amounts[2])
                result['vergi'] = round(beyan_ucreti + gumruk_v, 2)

    except Exception as e:
        print(f'KZ beyanname PDF parse hatası: {e}')

    return result


def parse_aksu_beyanname_pdf(pdf_bytes):
    """
    Aksu Gümrük e-faturasından tüm faturaları parse eder.
    Fatura sayfası (Vergiler Hariç Toplam Tutar) + özet sayfası (MÜŞTERİ REF.NO) çifti.
    """
    faturalar = []

    def parse_tl_sayi(s):
        s = str(s).strip().replace('.', '').replace(',', '.').replace('TL', '').strip()
        try:
            return float(s)
        except:
            return 0.0

    def extract_ref_no(text):
        # "POZİSYON NO H-26-01461 2026-281 EŞYANIN CİNSİ" → 2026-281
        m = re.search(r'POZ[İI]SYON NO\s+\S+\s+(\d{4}-\d+)', text)
        if m:
            return m.group(1).strip()
        return None

    def extract_fatura_no(text):
        # "MÜŞTERİ FATURA NO IHR2026..." veya "MÜŞTERİ 26TR... NOT" formatı
        m = re.search(r'MÜŞTER[İI]\s+(?:FATURA\s+NO\s+)?((?:IHR|ANT)\d+)', text, re.IGNORECASE)
        if m:
            return m.group(1).strip()
        return None

    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            pages_text = []
            for page in pdf.pages:
                raw = page.extract_text() or ''
                pages_text.append(re.sub(r'\s+', ' ', raw))

        i = 0
        while i < len(pages_text):
            text = pages_text[i]

            if 'Vergiler Hariç Toplam Tutar' in text:
                # Fatura sayfası
                tutar     = 0.0
                ref_no    = None
                fatura_no = None

                m = re.search(r'Vergiler Hariç Toplam Tutar\s+([\d.,]+)', text)
                if m:
                    tutar = parse_tl_sayi(m.group(1))

                # Ref ve fatura no aynı sayfada olabilir
                ref_no    = extract_ref_no(text)
                fatura_no = extract_fatura_no(text)

                # Bir sonraki sayfa özet sayfasıysa oradan da al
                if i + 1 < len(pages_text):
                    next_text = pages_text[i + 1]
                    if 'POZİSYON NO' in next_text or 'MÜŞTERİ REF' in next_text:
                        if not ref_no:
                            ref_no = extract_ref_no(next_text)
                        if not fatura_no:
                            fatura_no = extract_fatura_no(next_text)
                        i += 2
                    else:
                        i += 1
                else:
                    i += 1

                faturalar.append({
                    'ref_no':    ref_no,
                    'fatura_no': fatura_no,
                    'tutar_tl':  tutar,
                })
            else:
                i += 1

    except Exception as e:
        print(f'Aksu beyanname PDF parse hatası: {e}')

    return faturalar


# ── FR FATURA PDF PARSE ───────────────────────────────────────────────────────
def parse_fr_fatura_pdf(pdf_bytes):
    """
    ANT (e-Arşiv) ve IHR (e-Fatura) formatındaki franchise faturalarını parse eder.
    Sadece ilk sayfa + son 2 sayfa okunur (performans için).
    """
    result = {
        'fatura_no':         None,
        'yukleme_tarihi':    None,
        'fatura_bedeli_usd': 0.0,
        'fatura_bedeli_tl':  0.0,
        'fatura_bedeli_tl_pdf': 0.0,
        'usd_kuru':          0.0,
        'para_birimi':       'TL',
        'fatura_tipi':       None,  # 'ANT' veya 'IHR'
        'palet':             None,
    }

    def parse_tr_sayi(s):
        # 59.073,14 → 59073.14
        s = str(s).strip().replace('.', '').replace(',', '.').strip()
        try:
            return float(s)
        except:
            return 0.0

    def parse_tarih(s):
        # "06-01-2026 / 15:13" veya "22- 01- 2026" → "2026-01-06"
        s = re.sub(r'\s+', '', s)          # boşlukları kaldır
        s = re.sub(r'/.*', '', s).strip()  # saat kısmını at
        parts = s.split('-')
        if len(parts) == 3 and len(parts[2]) == 4:
            return f"{parts[2]}-{parts[1].zfill(2)}-{parts[0].zfill(2)}"
        return None

    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            total = len(pdf.pages)
            # İlk sayfa + son 2 sayfa (max 3 sayfa, üst üste gelirse tekrar alma)
            idxs = list(dict.fromkeys(
                [0] + [i for i in [total - 2, total - 1] if i >= 0]
            ))
            pages_text = []
            for i in idxs:
                raw = pdf.pages[i].extract_text() or ''
                pages_text.append(re.sub(r'\s+', ' ', raw))

        full = ' '.join(pages_text)

        # ── Fatura No ────────────────────────────────────────────────────────
        m = re.search(r'Fatura No[:\s]*((?:ANT|IHR)\d+)', full)
        if m:
            result['fatura_no'] = m.group(1).strip()
            result['fatura_tipi'] = 'ANT' if result['fatura_no'].startswith('ANT') else 'IHR'

        # ── Tarih ────────────────────────────────────────────────────────────
        if result['fatura_tipi'] == 'ANT':
            # "Tarih / Saat: 06-01-2026 / 15:13"
            m = re.search(r'Tarih\s*/\s*Saat[:\s]*([\d][\d\s\-]+)', full)
        else:
            # "Tarih: 22- 01- 2026"
            m = re.search(r'Tarih[:\s]*([\d][\d\s\-]+)', full)

        if m:
            result['yukleme_tarihi'] = parse_tarih(m.group(1))

        # ── Tutar ve Para Birimi (otomatik tespit) ───────────────────────────
        # ANT: "Ürün Bedeli: 59.073,14 USD/EUR/TL"
        # IHR: "Mal Hizmet Toplam Tutarı: 312.145,20TL"
        if result['fatura_tipi'] == 'ANT':
            m = re.search(r'Ürün Bedeli[:\s]*([\d.,]+)\s*(USD|EUR|TL)', full)
        else:
            m = re.search(r'Mal Hizmet Toplam Tutarı[:\s]*([\d.,]+)\s*(USD|EUR|TL)', full)

        if m:
            tutar = parse_tr_sayi(m.group(1))
            para_birimi = m.group(2).strip()
            result['para_birimi'] = para_birimi
            if para_birimi == 'USD':
                result['fatura_bedeli_usd'] = tutar
            elif para_birimi == 'EUR':
                result['fatura_bedeli_eur'] = tutar
            elif para_birimi == 'TL':
                result['fatura_bedeli_tl'] = tutar

        # ── Döviz Kuru ───────────────────────────────────────────────────────
        # "Döviz Kuru: 42,9648 TL" veya "Döviz Kuru: 1,2345 USD" gibi
        m = re.search(r'Döviz Kuru[:\s]*([\d.,]+)\s*(TL|USD|EUR)', full)
        if m:
            kur_deger = parse_tr_sayi(m.group(1))
            kur_birimi = m.group(2).strip()
            if kur_birimi == 'TL' and kur_deger > 1:
                # 1 USD/EUR = X TL formatı
                result['usd_kuru'] = kur_deger

        # ── PDF'te yazılı TL Toplamı (varsa, fatura ile birebir eşleşmesi için öncelikli) ──
        # USD/EUR ile kesilip döviz kuru bilgisi bulunan faturalarda TL toplamı
        # tekrar hesaplanmak yerine faturada yazan "Ödenecek Tutar (TL)" değeri kullanılır.
        if result['para_birimi'] in ('USD', 'EUR'):
            m = re.search(r'Ödenecek Tutar\s*\(TL\)[:\s]*([\d.,]+)', full)
            if m:
                result['fatura_bedeli_tl_pdf'] = parse_tr_sayi(m.group(1))

        # ── Palet / Kap ──────────────────────────────────────────────────────
        m = re.search(r'\*?\s*KAP(?:\s*ADETİ)?[:\s]*([\d]+(?:\s*\([^)]+\))?)', full, re.IGNORECASE)
        if m:
            import math
            kap_str = m.group(1).strip()
            kap = int(re.search(r'[\d]+', kap_str).group())
            if result['fatura_tipi'] == 'ANT':
                palet = math.ceil(kap / 30)
                result['palet'] = f'{kap} ({palet})'
            else:
                # IHR: parantez varsa tümünü al, yoksa sadece sayıyı al
                result['palet'] = kap_str

    except Exception as e:
        print(f'FR fatura PDF parse hatası: {e}')

    return result

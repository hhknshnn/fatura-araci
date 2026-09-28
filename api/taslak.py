import json
import io
import os
import re
import openpyxl

from invoice.helpers import parse_pdf as _parse_pdf_common

_ULKE_KODU_RE = re.compile(r'^[a-z]{2,4}$')


def parse_pdf_fields(pdf_bytes):
    """Taslak / menşe / PL hedef kilo için PDF alanları. B.KG: 5600,00 dahil."""
    parsed = _parse_pdf_common(pdf_bytes or b'')
    return {
        'navlun':  float(parsed.get('navlun') or 0),
        'sigorta': float(parsed.get('sigorta') or 0),
        'kap':     parsed.get('kap') or '',
        'brutKg':  float(parsed.get('brutKg') or 0),
        'netKg':   float(parsed.get('netKg') or 0),
        'kur':     float(parsed.get('kur') or 0),
    }


# ── CONFIG YÜKLE ──────────────────────────────────────────────────────────────
def load_config(ulke_kodu):
    """Ülkeye göre taslak config dosyasını yükle."""
    if not _ULKE_KODU_RE.match(str(ulke_kodu or '')):
        raise ValueError(f'Geçersiz ülke kodu: {ulke_kodu}')
    # Vercel'de çalışma dizini /var/task, config klasörü oradan erişilebilir
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    config_path = os.path.join(base_dir, 'config', f'taslak_{ulke_kodu}.json')
    with open(config_path, 'r', encoding='utf-8') as f:
        return json.load(f)

# ── TASLAK DOLDUR ─────────────────────────────────────────────────────────────
def doldur_kibris(taslak_bytes, config, form_data):
    """Kıbrıs özel: 3 grup dinamik doldurma."""
    wb = openpyxl.load_workbook(io.BytesIO(taslak_bytes))
    ws = wb[config.get('sheet', wb.sheetnames[0])]

    gruplar   = config.get('gruplar', {})
    dosya_cfg = config.get('dosyaNo', {})

    for grup_id, grup_cfg in gruplar.items():
        kap_val   = form_data.get(grup_id + '_kap',   '')
        brut_val  = form_data.get(grup_id + '_brutKg', '')
        net_val   = form_data.get(grup_id + '_netKg',  '')

        # Grup boşsa tüm hücreleri temizle
        if not kap_val and not brut_val:
            ws[grup_cfg['kap']]    = ''
            ws[grup_cfg['brutKg']] = ''
            ws[grup_cfg['netKg']]  = ''
        else:
            ws[grup_cfg['kap']] = kap_val
            try:    ws[grup_cfg['brutKg']] = float(str(brut_val).replace(',','.'))
            except: ws[grup_cfg['brutKg']] = brut_val
            try:    ws[grup_cfg['netKg']]  = float(str(net_val).replace(',','.'))
            except: ws[grup_cfg['netKg']]  = net_val

    # Dosya no — her 3 sütuna da yaz (A8, D8, G8)
    ref_no = str(form_data.get('referansNo', ''))
    prefix = dosya_cfg.get('prefix', '')
    # Frontend zaten yıl+no gönderiyor (örn: 2027-100), prefix'i atla
    if ref_no and '-' in ref_no:
        prefix = ''
    for hucre in ['B8', 'E8', 'H8']:
        ws[hucre] = prefix + ref_no

    dosya_adi = f"Fatura Taslak_{config['dosyaAdi']} {prefix}{ref_no}.xlsx"
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.getvalue(), dosya_adi

def doldur_taslak(taslak_bytes, config, form_data, mense_data=None, depo_tipi=None):
    """
    Taslak Excel'e form ve menşe verilerini yaz.

    form_data: {referansNo, navlun, sigorta, kap, brutKg, netKg}
    mense_data: {yabanciKg, trKg} — opsiyonel, menşe adımında gelir
    depo_tipi: 'serbest' (IHR) | 'antrepo' (ANT) — antrepo'da menşe ayrımı olmaz
    """
    wb = openpyxl.load_workbook(io.BytesIO(taslak_bytes))
    sheet_name = config.get('sheet', wb.sheetnames[0])
    ws = wb[sheet_name]

    alanlar = config.get('alanlar', {})

    # ── FORM ALANLARI ─────────────────────────────────────────────────────────
    for alan_adi, alan_cfg in alanlar.items():
        hucre = alan_cfg['hucre']
        deger = form_data.get(alan_adi)
        if deger is None:
            continue

        tip    = alan_cfg.get('tip', 'metin')
        prefix = alan_cfg.get('prefix', '')

        if tip == 'sayi':
            try:    ws[hucre] = float(str(deger).replace(',', '.'))
            except: ws[hucre] = deger
        elif tip == 'tam':
            try:    ws[hucre] = int(deger)
            except: ws[hucre] = deger
        elif tip == 'metin':
            # Frontend zaten yıl+no gönderiyor (örn: 2026-284), prefix'i tekrar ekleme
            deger_str = str(deger)
            if prefix and deger_str.startswith(prefix):
                ws[hucre] = deger_str
            else:
                ws[hucre] = prefix + deger_str

    # ── MENŞE ALANLARI (opsiyonel) ────────────────────────────────────────────
    if mense_data:
        mense_alanlar = config.get('menseAlanlar', {})

        yabanci_kg = mense_data.get('yabanciKg', 0)
        tr_kg      = mense_data.get('trKg', 0)

        for alan_adi, alan_cfg in mense_alanlar.items():
            hucre  = alan_cfg['hucre']
            tip    = alan_cfg.get('tip', 'sayi')
            format_str = alan_cfg.get('format', '{deger}')

            if alan_adi == 'yabanciKg':
                deger = yabanci_kg
            elif alan_adi == 'trKg':
                deger = tr_kg
            elif alan_adi == 'yabanciMetin':
                deger = format_str.replace('{deger}', str(yabanci_kg))
                ws[hucre] = deger
                continue
            elif alan_adi == 'trMetin':
                deger = format_str.replace('{deger}', str(tr_kg))
                ws[hucre] = deger
                continue
            else:
                continue

            if tip == 'sayi':
                try:    ws[hucre] = float(deger)
                except: ws[hucre] = deger

    # ── ANTREPO (ANT): menşe ayrımı yok ────────────────────────────────────────
    if depo_tipi == 'antrepo':
        for hucre in config.get('menseTemizle', []):
            ws[hucre] = None

    # ── DOSYA ADI ─────────────────────────────────────────────────────────────
    ref_no  = form_data.get('referansNo', '')
    prefix  = config['alanlar']['referansNo'].get('prefix', '')
    # Frontend zaten yıl+no gönderiyor (örn: 2027-100), prefix'i atla
    if ref_no and '-' in ref_no:
            prefix = ''
    sablon = config.get('dosyaAdiSablon')
    if sablon:
        dosya_adi = sablon.replace('{refNo}', f'{prefix}{ref_no}') + '.xlsx'
    else:
        ulke    = config.get('dosyaAdi', 'Taslak')
        dosya_adi = f"Fatura Taslak_{ulke} {prefix}{ref_no}.xlsx"
    # ── BYTES OLARAK DÖNDÜR ───────────────────────────────────────────────────
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.getvalue(), dosya_adi

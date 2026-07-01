# api/usd_backfill.py
# ══════════════════ GEÇİCİ MODÜL — USD BACKFILL ══════════════════
# İş bitince kaldırılacaklar:
#   - bu dosya (api/usd_backfill.py)
#   - app.py'deki import satırı + /api/usd-backfill/* route'ları (2 adet)
#   - index.html'deki #usd-backfill-section bloğu + <script src="js/usd-backfill.js">
#   - js/usd-backfill.js dosyası
# ═══════════════════════════════════════════════════════════════════

import io
import base64
import pdfplumber
from flask import request, jsonify
from api.db import get_conn
from api.kur import get_tcmb_kurlar
from api.invoice.helpers import (
    _normalize_pdf_text, _extract_pdf_amount, _extract_amount_near_keywords,
)

USD_ULKELER = {'KAZAKİSTAN', 'GÜRCİSTAN'}


def parse_pdf_fast(pdf_bytes):
    """Sadece 1. sayfa + son 2 sayfayı okur (hız için) — fallback yok."""
    result = {'navlun': 0.0, 'sigorta': 0.0, 'kur': 0.0}
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            page_count = len(pdf.pages)
            idxs = sorted(set([0, page_count - 2, page_count - 1]) & set(range(page_count)))
            texts = [_normalize_pdf_text(pdf.pages[i].extract_text() or '') for i in idxs]
            text = ' '.join(t for t in texts if t).strip()

            result['navlun'] = _extract_pdf_amount(text, [
                r'\bNAVLUN(?:\s+(?:BEDEL[İI]|BEDELI|TUTAR[İI]|TUTARI|ÜCRET[İI]|UCRETI))?(?:\s*\([^)]*\))?\s*[:.]?\s*(?:TRY|TL|₺)?\s*([\d.,]+)',
                r'\bFREIGHT(?:\s+(?:AMOUNT|COST|CHARGE|VALUE))?(?:\s*\([^)]*\))?\s*[:.]?\s*(?:TRY|TL|₺)?\s*([\d.,]+)',
            ]) or _extract_amount_near_keywords(text, [r'\bNAVLUN\b', r'\bFREIGHT\b', r'\bTA[SŞ]IMA\b'])

            result['sigorta'] = _extract_pdf_amount(text, [
                r'\bS[İI]G(?:ORTA)?(?:\s+(?:BEDEL[İI]|BEDELI|TUTAR[İI]|TUTARI|ÜCRET[İI]|UCRETI))?\.?(?:\s*\([^)]*\))?\s*[:.]?\s*(?:TRY|TL|₺)?\s*([\d.,]+)',
                r'\bINSURANCE(?:\s+(?:AMOUNT|COST|CHARGE|VALUE))?(?:\s*\([^)]*\))?\s*[:.]?\s*(?:TRY|TL|₺)?\s*([\d.,]+)',
            ]) or _extract_amount_near_keywords(text, [r'\bS[İI]GORTA\b', r'\bSIGORTA\b', r'\bINSURANCE\b'])

            result['kur'] = _extract_pdf_amount(text, [
                r'[*\-]?\s*KUR\s+B[İI]LG[İI]S[İI]\s*[:.]?\s*(?:TRY|EUR|USD)?\s*([\d.,]+)',
            ])
    except Exception as e:
        result['_hata'] = str(e)
    return result


def get_usd_missing_shipments():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute('''
        SELECT id, ihracat_dosya_no, fatura_no, ulke, yukleme_tarihi
        FROM shipments
        WHERE upper(ulke) IN ('KAZAKİSTAN', 'GÜRCİSTAN')
          AND (usd_kuru IS NULL OR usd_kuru = 0)
        ORDER BY ulke, id
    ''')
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [
        {'id': r[0], 'ihracat_dosya_no': r[1], 'fatura_no': r[2],
         'ulke': r[3], 'yukleme_tarihi': str(r[4]) if r[4] else None}
        for r in rows
    ]


def usd_backfill_list():
    return jsonify({'success': True, 'shipments': get_usd_missing_shipments()})


def usd_backfill_upload():
    body = request.get_json() or {}
    sid = body.get('id')
    pdf_b64 = body.get('pdf', '')
    if not sid or not pdf_b64:
        return jsonify({'success': False, 'error': 'id ve pdf zorunlu'}), 400

    conn = get_conn()
    cur = conn.cursor()
    cur.execute('SELECT ulke FROM shipments WHERE id = %s', (int(sid),))
    row = cur.fetchone()
    if not row:
        cur.close(); conn.close()
        return jsonify({'success': False, 'error': 'Sevkiyat bulunamadı'}), 404

    ulke = str(row[0] or '').strip().upper()
    if ulke not in USD_ULKELER:
        cur.close(); conn.close()
        return jsonify({'success': False, 'error': f'{ulke} için bu işlem geçerli değil'}), 400

    pdf_bytes = base64.b64decode(pdf_b64)
    pdf_fields = parse_pdf_fast(pdf_bytes)

    navlun_pdf = float(pdf_fields.get('navlun') or 0)
    sigorta_pdf = float(pdf_fields.get('sigorta') or 0)
    pdf_kur = float(pdf_fields.get('kur') or 0)

    if navlun_pdf <= 0 and sigorta_pdf <= 0:
        cur.close(); conn.close()
        return jsonify({'success': False, 'error': 'PDF içinde navlun/sigorta tutarı bulunamadı', 'pdfFields': pdf_fields}), 422

    kurlar = get_tcmb_kurlar()
    api_eur_kuru = float(kurlar.get('TRY', 0) or 0)
    api_usd_per_eur = float(kurlar.get('USD', 0) or 1)
    api_try_usd = (api_eur_kuru / api_usd_per_eur) if api_usd_per_eur else 0

    usd_kuru = pdf_kur if pdf_kur > 0 else api_try_usd
    if usd_kuru <= 0:
        cur.close(); conn.close()
        return jsonify({'success': False, 'error': 'USD kuru hesaplanamadı'}), 422

    navlun_usd = navlun_pdf / usd_kuru
    sigorta_usd = sigorta_pdf / usd_kuru

    cur.execute('''
        UPDATE shipments SET navlun_usd = %s, sigorta_usd = %s, usd_kuru = %s
        WHERE id = %s
    ''', (round(navlun_usd, 2), round(sigorta_usd, 2), round(usd_kuru, 4), int(sid)))
    conn.commit()
    cur.close()
    conn.close()

    return jsonify({
        'success': True,
        'navlun_usd': round(navlun_usd, 2),
        'sigorta_usd': round(sigorta_usd, 2),
        'usd_kuru': round(usd_kuru, 4),
        'pdfFields': pdf_fields,
    })


def usd_backfill_manual_excel(rows):
    """
    Excel'den fatura_no + manuel navlun_usd/sigorta_usd okuyup
    navlun_eur ve eur_kuru üzerinden TRY'ye geri gidip usd_kuru hesaplar.
    rows: [{fatura_no, navlun_usd, sigorta_usd}]
    """
    conn = get_conn()
    cur = conn.cursor()
    guncellenen, atlanan, hatalar = 0, 0, []

    for i, row in enumerate(rows):
        try:
            fatura_no = str(row.get('fatura_no', '')).strip()
            navlun_usd_in = row.get('navlun_usd')
            sigorta_usd_in = row.get('sigorta_usd')

            if not fatura_no or navlun_usd_in in (None, '', 0):
                atlanan += 1
                hatalar.append(f'Satır {i+1}: fatura_no veya navlun_usd boş, atlandı.')
                continue

            navlun_usd_in = float(navlun_usd_in)
            sigorta_usd_in = float(sigorta_usd_in) if sigorta_usd_in not in (None, '') else 0.0

            cur.execute('''
                SELECT id, ulke, navlun_eur, eur_kuru
                FROM shipments WHERE fatura_no = %s
            ''', (fatura_no,))
            found = cur.fetchone()
            if not found:
                atlanan += 1
                hatalar.append(f'{fatura_no}: kayıt bulunamadı.')
                continue

            sid, ulke, navlun_eur, eur_kuru = found
            ulke_norm = str(ulke or '').strip().upper()
            if ulke_norm not in USD_ULKELER:
                atlanan += 1
                hatalar.append(f'{fatura_no}: {ulke_norm} için bu işlem geçerli değil.')
                continue

            navlun_eur = float(navlun_eur or 0)
            eur_kuru = float(eur_kuru or 0)
            navlun_try = navlun_eur * eur_kuru

            if navlun_try <= 0 or navlun_usd_in <= 0:
                atlanan += 1
                hatalar.append(f'{fatura_no}: navlun_eur/eur_kuru veya girilen navlun_usd geçersiz.')
                continue

            usd_kuru = navlun_try / navlun_usd_in

            cur.execute('''
                UPDATE shipments SET navlun_usd = %s, sigorta_usd = %s, usd_kuru = %s
                WHERE id = %s
            ''', (round(navlun_usd_in, 2), round(sigorta_usd_in, 2), round(usd_kuru, 4), sid))
            guncellenen += 1

        except Exception as e:
            hatalar.append(f'Satır {i+1}: {str(e)}')

    conn.commit()
    cur.close()
    conn.close()
    return guncellenen, atlanan, hatalar


def usd_backfill_manual_excel_route():
    body = request.get_json() or {}
    rows = body.get('rows', [])
    if not rows:
        return jsonify({'success': False, 'error': 'Satır listesi boş'}), 400
    guncellenen, atlanan, hatalar = usd_backfill_manual_excel(rows)
    return jsonify({'success': True, 'guncellenen': guncellenen, 'atlanan': atlanan, 'hatalar': hatalar})
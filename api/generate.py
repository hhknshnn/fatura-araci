import sys as _sys, os as _os
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))

from http.server import BaseHTTPRequestHandler
import json
import base64
import io
import traceback

import pandas as pd

from invoice.helpers   import parse_pdf
from invoice.constants import EXCEPTION_SKUS

# ── Engine importları ─────────────────────────────────────────────────────────
from invoice.try_engine import (
    generate_rs, generate_kz, generate_ru,
    generate_ba, generate_ge,
)
from invoice.eur_engine import (
    generate_xk, generate_mk, generate_be,
    generate_de, generate_nl,
)
from invoice.usd_engine import (
    generate_iq, generate_ly, generate_lr,
    generate_lb, generate_uz,
)
from invoice.cy_engine import generate_cy


# ── Dispatcher ────────────────────────────────────────────────────────────────

def dispatch(ulke_kodu, df, df_original, grup_kilolari, hedef_brut, hedef_net,
             depo_tipi, exception_skus, logo_bytes, pdf_fields,
             eur_kuru=1.0, usd_kuru=1.0):
    """
    Ülke koduna göre doğru engine fonksiyonunu çağırır.
    Dönen tuple: (excel_bytes, fatura_no, master_bytes, price_list_bytes|None, mill_test_bytes|None)
    """
    kw = dict(
        grup_kilolari=grup_kilolari,
        hedef_brut=hedef_brut,
        exception_skus=exception_skus,
        logo_bytes=logo_bytes,
        pdf_fields=pdf_fields,
        hedef_net=hedef_net,
        depo_tipi=depo_tipi,
        df_original=df_original,
    )

    # ── TRY ───────────────────────────────────────────────────────────────────
    if ulke_kodu == 'rs':
        excel_out, fatura_no, master_out = generate_rs(df, **kw)
        return excel_out, fatura_no, master_out, None, None

    if ulke_kodu == 'ba':
        excel_out, fatura_no, master_out = generate_ba(df, **kw)
        return excel_out, fatura_no, master_out, None, None

    if ulke_kodu == 'ge':
        excel_out, fatura_no, master_out = generate_ge(df, **kw)
        return excel_out, fatura_no, master_out, None, None

    if ulke_kodu == 'kz':
        # Kazakistan — price_list PDF ekstra
        excel_out, fatura_no, master_out, price_list_out = generate_kz(df, **kw)
        return excel_out, fatura_no, master_out, price_list_out, None

    if ulke_kodu == 'ru':
        excel_out, fatura_no, master_out = generate_ru(df, **kw)
        return excel_out, fatura_no, master_out, None, None

    # ── EUR ───────────────────────────────────────────────────────────────────
    if ulke_kodu == 'xk':
        excel_out, fatura_no, master_out = generate_xk(df, eur_kuru=eur_kuru, **kw)
        return excel_out, fatura_no, master_out, None, None

    if ulke_kodu == 'mk':
        excel_out, fatura_no, master_out = generate_mk(df, eur_kuru=eur_kuru, **kw)
        return excel_out, fatura_no, master_out, None, None

    if ulke_kodu == 'de':
        excel_out, fatura_no, master_out = generate_de(df, eur_kuru=eur_kuru, **kw)
        return excel_out, fatura_no, master_out, None, None

    if ulke_kodu == 'nl':
        excel_out, fatura_no, master_out = generate_nl(df, eur_kuru=eur_kuru, **kw)
        return excel_out, fatura_no, master_out, None, None

    if ulke_kodu == 'be':
        # Belçika — mill_test PDF ekstra
        excel_out, fatura_no, master_out, mill_test_out = generate_be(df, eur_kuru=eur_kuru, **kw)
        return excel_out, fatura_no, master_out, None, mill_test_out

    # ── USD ───────────────────────────────────────────────────────────────────
    if ulke_kodu == 'iq':
        excel_out, fatura_no, master_out = generate_iq(df, usd_kuru=usd_kuru, **kw)
        return excel_out, fatura_no, master_out, None, None

    if ulke_kodu == 'ly':
        excel_out, fatura_no, master_out = generate_ly(df, usd_kuru=usd_kuru, **kw)
        return excel_out, fatura_no, master_out, None, None

    if ulke_kodu == 'lr':
        excel_out, fatura_no, master_out = generate_lr(df, usd_kuru=usd_kuru, **kw)
        return excel_out, fatura_no, master_out, None, None

    if ulke_kodu == 'lb':
        excel_out, fatura_no, master_out = generate_lb(df, usd_kuru=usd_kuru, **kw)
        return excel_out, fatura_no, master_out, None, None

    if ulke_kodu == 'uz':
        excel_out, fatura_no, master_out = generate_uz(df, **kw)
        return excel_out, fatura_no, master_out, None, None

    raise ValueError(f'Bilinmeyen ülke kodu: {ulke_kodu}')


# ── Vercel / Flask HTTP Handler ───────────────────────────────────────────────

class handler(BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin',  '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.end_headers()

    def do_POST(self):
        try:
            length     = int(self.headers.get('Content-Length', 0))
            body       = json.loads(self.rfile.read(length))
            ulke_kodu  = body.get('ulkeKodu', 'rs')

            # ── Kıbrıs — özel akış ───────────────────────────────────────────
            if ulke_kodu == 'cy':
                faturalar = body.get('faturalar', [])
                excel_out = generate_cy(
                    faturalar,
                    grup_kilolari  = body.get('grupKilolari', {}),
                    exception_skus = body.get('exceptionSkus', EXCEPTION_SKUS),
                )
                fatura_no = '_'.join(f.get('faturaNo', '') for f in faturalar)
                result = json.dumps({
                    'success':   True,
                    'excel':     base64.b64encode(excel_out).decode('utf-8'),
                    'master':    '',
                    'faturaNo':  fatura_no,
                    'pdfFields': {},
                })
                self._respond(200, result)
                return

            # ── Ortak veri hazırlığı ──────────────────────────────────────────
            excel_bytes    = base64.b64decode(body.get('excel', ''))
            logo_b64       = body.get('logo', '')
            logo_bytes     = base64.b64decode(logo_b64) if logo_b64 else None
            hedef_brut     = float(body.get('hedefBrut', 0))
            hedef_net      = float(body.get('hedefNet',  0))
            depo_tipi      = body.get('depoTipi', 'serbest')
            grup_kilolari  = body.get('grupKilolari', {})
            exception_skus = body.get('exceptionSkus', EXCEPTION_SKUS)
            eur_kuru       = float(body.get('eurKuru', 1.0))
            usd_kuru       = float(body.get('usdKuru', 1.0))

            # PDF parse
            pdf_b64    = body.get('pdf', '')
            pdf_fields = {'navlun': 0.0, 'sigorta': 0.0, 'kap': '', 'kur': 0.0}
            if pdf_b64:
                pdf_fields = parse_pdf(base64.b64decode(pdf_b64))

            # Excel oku
            df          = pd.read_excel(io.BytesIO(excel_bytes), engine='openpyxl')
            df_original = df.copy()

            # Dispatch
            excel_out, fatura_no, master_out, price_list_out, mill_test_out = dispatch(
                ulke_kodu, df, df_original,
                grup_kilolari, hedef_brut, hedef_net,
                depo_tipi, exception_skus, logo_bytes, pdf_fields,
                eur_kuru=eur_kuru, usd_kuru=usd_kuru,
            )

            # Response
            response_data = {
                'success':   True,
                'excel':     base64.b64encode(excel_out).decode('utf-8'),
                'master':    base64.b64encode(master_out).decode('utf-8'),
                'faturaNo':  fatura_no,
                'pdfFields': pdf_fields,
            }
            if price_list_out:
                response_data['priceList'] = base64.b64encode(price_list_out).decode('utf-8')
            if mill_test_out:
                response_data['millTest'] = base64.b64encode(mill_test_out).decode('utf-8')

            self._respond(200, json.dumps(response_data))

        except Exception as e:
            err = json.dumps({
                'success': False,
                'error':   str(e),
                'trace':   traceback.format_exc(),
            })
            self._respond(500, err)

    def _respond(self, code, body_str):
        encoded = body_str.encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type',                'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(encoded)

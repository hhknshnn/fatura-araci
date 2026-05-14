import base64
import io
import json
import os
import sys
import traceback

import pandas as pd
from flask import Flask, after_this_request, jsonify, request, send_file, send_from_directory
from api.shipments import shipments_get, shipments_post, shipments_put, shipments_delete, shipments_export
from api.kur import get_tcmb_kurlar

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(BASE_DIR, 'api'))

import evrak as evrak_mod
import generate as gen_mod
import taslak as taslak_mod

from api.db import init_db
from api.auth import auth_get, auth_post
from api.users import users_get, users_post, users_delete
from api.storage import storage_get, storage_post, storage_delete

def read_port():
    try:
        with open(os.path.join(BASE_DIR, 'config.json'), 'r', encoding='utf-8') as f:
            return int(json.load(f).get('port', 8080))
    except Exception:
        return 8080


app = Flask(__name__, static_folder=None)
init_db()

STATIC_DIRS = {'css', 'js', 'templates', 'fonts', 'assets', 'config'}


def _cors(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    return response


app.after_request(_cors)


@app.route('/')
def index():
    return send_file(os.path.join(BASE_DIR, 'index.html'))


@app.route('/config.json')
def serve_config_json():
    return send_file(os.path.join(BASE_DIR, 'config.json'), mimetype='application/json')


@app.route('/<path:filename>')
def static_files(filename):
    top = filename.split('/')[0]
    if top in STATIC_DIRS:
        return send_from_directory(BASE_DIR, filename)
    return jsonify({'error': 'Not found'}), 404


# ── /api/generate ─────────────────────────────────────────────────────────────

@app.route('/api/generate', methods=['GET', 'POST', 'OPTIONS'])
def api_generate():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    if request.method == 'GET':
        return jsonify({'status': 'ok', 'service': 'generate'})

    try:
        body           = request.get_json(force=True)
        excel_bytes    = base64.b64decode(body.get('excel', ''))
        logo_b64       = body.get('logo', '')
        logo_bytes     = base64.b64decode(logo_b64) if logo_b64 else None
        hedef_brut     = float(body.get('hedefBrut', 0))
        hedef_net      = float(body.get('hedefNet', 0))
        depo_tipi      = body.get('depoTipi', 'serbest')
        grup_kilolari  = body.get('grupKilolari', {})
        exception_skus = body.get('exceptionSkus', gen_mod.EXCEPTION_SKUS)
        ulke_kodu      = body.get('ulkeKodu', 'rs')
        eur_kuru       = float(body.get('eurKuru', 1.0))
        usd_kuru       = float(body.get('usdKuru', 1.0))

        pdf_fields = {'navlun': 0.0, 'sigorta': 0.0, 'kap': ''}
        pdf_b64    = body.get('pdf', '')
        if pdf_b64:
            pdf_fields = gen_mod.parse_pdf(base64.b64decode(pdf_b64))

        # ── Kıbrıs özel ──────────────────────────────────────────────────────
        if ulke_kodu == 'cy':
            faturalar = body.get('faturalar', [])
            excel_out = gen_mod.generate_excel_cy(faturalar, grup_kilolari, exception_skus)
            fatura_no = '_'.join(f.get('faturaNo', '') for f in faturalar)
            return jsonify({
                'success':   True,
                'excel':     base64.b64encode(excel_out).decode(),
                'master':    '',
                'faturaNo':  fatura_no,
                'pdfFields': {},
            })

        df          = pd.read_excel(io.BytesIO(excel_bytes), engine='openpyxl')
        df_original = df.copy()

        price_list_out = None
        mill_test_out  = None

        # ── Yeni dispatcher — hata alırsa eski koda düş ───────────────────
        try:
            excel_out, fatura_no, master_out, price_list_out, mill_test_out = \
                gen_mod.dispatch(
                    ulke_kodu, df, df_original, grup_kilolari, hedef_brut,
                    hedef_net, depo_tipi, exception_skus, logo_bytes,
                    pdf_fields, eur_kuru, usd_kuru
                )
        except NotImplementedError:
            print(f'[WARN] dispatch: {ulke_kodu} için eski kod kullanılıyor')
            kw = dict(hedef_net=hedef_net, depo_tipi=depo_tipi, df_original=df_original)
            if ulke_kodu == 'ba':
                excel_out, fatura_no, master_out = gen_mod.generate_excel_ba(
                    df, grup_kilolari, hedef_brut, exception_skus, logo_bytes, pdf_fields, **kw)
            elif ulke_kodu == 'ge':
                excel_out, fatura_no, master_out = gen_mod.generate_excel_ge(
                    df, grup_kilolari, hedef_brut, exception_skus, logo_bytes, pdf_fields, **kw)
            else:
                excel_out, fatura_no, master_out = gen_mod.generate_excel(
                    df, grup_kilolari, hedef_brut, exception_skus, logo_bytes, pdf_fields, **kw)

        resp = {
            'success':   True,
            'excel':     base64.b64encode(excel_out).decode(),
            'master':    base64.b64encode(master_out).decode(),
            'faturaNo':  fatura_no,
            'pdfFields': pdf_fields,
        }
        if price_list_out:
            resp['priceList'] = base64.b64encode(price_list_out).decode()
        if mill_test_out:
            resp['millTest'] = base64.b64encode(mill_test_out).decode()
        return jsonify(resp)

    except Exception as e:
        return jsonify({
            'success': False,
            'error':   str(e),
            'trace':   traceback.format_exc()
        }), 500

# ── /api/taslak ───────────────────────────────────────────────────────────────

@app.route('/api/taslak', methods=['GET', 'POST', 'OPTIONS'])
def api_taslak():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    if request.method == 'GET':
        return jsonify({'status': 'ok', 'service': 'taslak'})

    try:
        body = request.get_json(force=True)
        action = body.get('action', 'fill')

        if action == 'parsePdf':
            pdf_b64 = body.get('pdf', '')
            if not pdf_b64:
                raise ValueError('PDF verisi boş')
            pdf_fields = taslak_mod.parse_pdf_fields(base64.b64decode(pdf_b64))
            return jsonify({'success': True, 'pdfFields': pdf_fields})

        ulke_kodu  = body.get('ulkeKodu', 'rs')
        taslak_b64 = body.get('taslak', '')
        form_data  = body.get('formData', {})
        mense_data = body.get('menseData', None)

        if not taslak_b64:
            raise ValueError('Taslak Excel verisi boş')
        taslak_bytes = base64.b64decode(taslak_b64)

        config = taslak_mod.load_config(ulke_kodu)
        if config.get('tip') == 'kibris':
            excel_out, dosya_adi = taslak_mod.doldur_kibris(taslak_bytes, config, form_data)
        else:
            excel_out, dosya_adi = taslak_mod.doldur_taslak(
                taslak_bytes, config, form_data, mense_data)

        return jsonify({
            'success':  True,
            'excel':    base64.b64encode(excel_out).decode(),
            'dosyaAdi': dosya_adi,
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e), 'trace': traceback.format_exc()}), 500


# ── /api/evrak ────────────────────────────────────────────────────────────────

@app.route('/api/evrak', methods=['GET', 'POST', 'OPTIONS'])
def api_evrak():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    if request.method == 'GET':
        return jsonify({'status': 'ok', 'service': 'evrak'})

    try:
        body = request.get_json(force=True)
        ulke_kodu  = body.get('ulkeKodu', '')
        evrak_tipi = body.get('evrakTipi', '')
        form_data  = body.get('formData', {})

        if not ulke_kodu:
            raise ValueError('Ülke kodu boş')
        if not evrak_tipi:
            raise ValueError('Evrak tipi boş')

        pdf_bytes, dosya_adi = evrak_mod.generate_evrak_pdf(ulke_kodu, evrak_tipi, form_data)
        return jsonify({
            'success':  True,
            'pdf':      base64.b64encode(pdf_bytes).decode(),
            'dosyaAdi': dosya_adi,
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e), 'trace': traceback.format_exc()}), 500


@app.route('/api/auth', methods=['GET', 'POST', 'OPTIONS'])
def api_auth():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    if request.method == 'GET':
        return auth_get()
    return auth_post()


@app.route('/api/users', methods=['GET', 'POST', 'DELETE', 'OPTIONS'])
def api_users():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    if request.method == 'GET':
        return users_get()
    if request.method == 'DELETE':
        return users_delete()
    return users_post()


@app.route('/api/storage', methods=['GET', 'POST', 'DELETE', 'OPTIONS'])
def api_storage():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    if request.method == 'GET':
        return storage_get()
    if request.method == 'DELETE':
        return storage_delete()
    return storage_post()


@app.route('/api/shipments', methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'])
def api_shipments():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    if request.method == 'GET':
        return shipments_get()
    if request.method == 'PUT':
        return shipments_put()
    if request.method == 'DELETE':
        return shipments_delete()
    return shipments_post()
    
@app.route('/api/shipments/export', methods=['GET', 'OPTIONS'])
def api_shipments_export():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    return shipments_export()

@app.route('/api/kur', methods=['GET', 'OPTIONS'])
def api_kur():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    kurlar = get_tcmb_kurlar()
    return jsonify({'success': True, 'kurlar': kurlar})
# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    port = read_port()
    print(f'Sunucu başlıyor: http://localhost:{port}')
    app.run(host='0.0.0.0', port=port, debug=False)
import base64
import io
import json
import os
import sys
import traceback

import pandas as pd
from flask import Flask, jsonify, request, send_file, send_from_directory
from api.shipments import shipments_get, shipments_post, shipments_put, shipments_delete, shipments_export, bulk_import_shipments, bulk_update_shipments, bulk_delete_shipments, parse_kz_avr_pdf, parse_kz_avr_image, repair_shipment_freight
from api.landed_cost import landed_cost_get, landed_cost_export
from api.kur import get_tcmb_kurlar

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(BASE_DIR, 'api'))

import evrak as evrak_mod
import generate as gen_mod
import taslak as taslak_mod

from api.db import init_db, get_conn
from api.auth import auth_get, auth_post
from api.users import users_get, users_post, users_delete
from api.storage import storage_get, storage_post, storage_delete
from api.taslak_store import taslak_store_kaydet, taslak_store_liste, taslak_store_indir, taslak_store_sil
from api.shipments import group_shipments, ungroup_shipment, parse_rs_vergi_pdf, parse_rs_brokerage_pdf, parse_ge_broker_pdf, parse_ge_im_pdf, parse_ko_pdf, parse_de_vergi_pdf, parse_nl_broker_pdf, parse_kz_beyanname_pdf, parse_aksu_beyanname_pdf, parse_fr_pdf_import, bulk_import_fr_shipments, bulk_update_palet
from api.nebim import nebim_delivery_get, nebim_delivery_put

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
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
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
    # Bilinmeyen frontend rotaları için SPA entry point
    return send_file(os.path.join(BASE_DIR, 'index.html'))


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
            from invoice.cy_engine import generate_cy
            faturalar = body.get('faturalar', [])
            pl_out, master_out = generate_cy(
                faturalar,
                grup_kilolari  = grup_kilolari,
                exception_skus = exception_skus,
            )
            fatura_no = '_'.join(f.get('faturaNo', '') for f in faturalar)
            master_list = [
                {'fatura_no': m['fatura_no'], 'data': base64.b64encode(m['bytes']).decode(), 'kap': m.get('kap', '')}
                for m in master_out
            ]
            return jsonify({
                'success':    True,
                'excel':      base64.b64encode(pl_out).decode(),
                'masterList': master_list,
                'faturaNo':   fatura_no,
                'pdfFields':  {},
            })

        df          = pd.read_excel(io.BytesIO(excel_bytes), engine='openpyxl')
        df_original = df.copy()

        price_list_out = None
        mill_test_out  = None

        excel_out, fatura_no, master_out, price_list_out, mill_test_out = \
            gen_mod.dispatch(
                ulke_kodu, df, df_original, grup_kilolari, hedef_brut,
                hedef_net, depo_tipi, exception_skus, logo_bytes,
                pdf_fields, eur_kuru, usd_kuru
            )

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

@app.route('/api/shipments/repair-freight', methods=['POST', 'OPTIONS'])
def api_shipments_repair_freight():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    try:
        return repair_shipment_freight()
    except Exception as e:
        return jsonify({'success': False, 'error': str(e), 'trace': traceback.format_exc()}), 500

@app.route('/api/shipments/repair-usd', methods=['POST', 'OPTIONS'])
def api_shipments_repair_usd():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    try:
        body = request.get_json() or {}
        from api.shipments import repair_shipment_usd
        return repair_shipment_usd(sid=body.get('id'), fatura_no=body.get('fatura_no', ''))
    except Exception as e:
        return jsonify({'success': False, 'error': str(e), 'trace': traceback.format_exc()}), 500


@app.route('/api/shipments/bulk-repair-usd', methods=['POST', 'OPTIONS'])
def api_shipments_bulk_repair_usd():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    try:
        from api.shipments import bulk_repair_usd
        onarilan, atlanan, hatalar = bulk_repair_usd()
        return jsonify({'success': True, 'onarilan': onarilan, 'atlanan': atlanan, 'hatalar': hatalar})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e), 'trace': traceback.format_exc()}), 500


@app.route('/api/shipments/bulk-repair-freight-kzge', methods=['POST', 'OPTIONS'])
def api_shipments_bulk_repair_freight_kzge():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    try:
        from api.shipments import bulk_repair_freight_kz_ge
        onarilan, atlanan, hatalar = bulk_repair_freight_kz_ge()
        return jsonify({'success': True, 'onarilan': onarilan, 'atlanan': atlanan, 'hatalar': hatalar})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e), 'trace': traceback.format_exc()}), 500

        
@app.route('/api/shipments/bulk-import', methods=['POST', 'OPTIONS'])
def api_shipments_bulk_import():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    try:
        body = request.get_json(force=True)
        rows = body.get('rows', [])
        if not rows:
            return jsonify({'success': False, 'error': 'Satır listesi boş'}), 400
        eklenen, atlanan, hatalar = bulk_import_shipments(rows)
        return jsonify({
            'success': True,
            'eklenen': eklenen,
            'atlanan': atlanan,
            'hatalar': hatalar,
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/shipments/bulk-update', methods=['POST', 'OPTIONS'])
def api_shipments_bulk_update():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    try:
        body = request.get_json(force=True)
        rows = body.get('rows', [])
        if not rows:
            return jsonify({'success': False, 'error': 'Satır listesi boş'}), 400
        guncellenen, atlanan, hatalar = bulk_update_shipments(rows)
        return jsonify({
            'success': True,
            'guncellenen': guncellenen,
            'atlanan': atlanan,
            'hatalar': hatalar,
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/shipments/bulk-delete', methods=['POST', 'OPTIONS'])
def api_shipments_bulk_delete():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    try:
        body = request.get_json(force=True)
        ids  = body.get('ids', [])
        if not ids:
            return jsonify({'success': False, 'error': 'id listesi boş'}), 400
        deleted = bulk_delete_shipments(ids)
        return jsonify({'success': True, 'silinen': deleted})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    
@app.route('/api/shipments/export', methods=['GET', 'OPTIONS'])
def api_shipments_export():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    return shipments_export()


@app.route('/api/nebim-delivery', methods=['GET', 'PUT', 'OPTIONS'])
def api_nebim_delivery():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    if request.method == 'PUT':
        return nebim_delivery_put()
    return nebim_delivery_get()


@app.route('/api/landed-cost', methods=['GET', 'OPTIONS'])
def api_landed_cost():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    return landed_cost_get()


@app.route('/api/landed-cost/export', methods=['GET', 'OPTIONS'])
def api_landed_cost_export():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    return landed_cost_export()

@app.route('/api/taslak-store/kaydet', methods=['POST', 'OPTIONS'])
def api_taslak_store_kaydet():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    return taslak_store_kaydet()

@app.route('/api/taslak-store/liste', methods=['GET', 'OPTIONS'])
def api_taslak_store_liste():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    return taslak_store_liste()

@app.route('/api/taslak-store/indir/<int:taslak_id>', methods=['GET', 'OPTIONS'])
def api_taslak_store_indir(taslak_id):
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    return taslak_store_indir(taslak_id)

@app.route('/api/taslak-store/sil/<int:taslak_id>', methods=['DELETE', 'OPTIONS'])
def api_taslak_store_sil(taslak_id):
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    return taslak_store_sil(taslak_id)

@app.route('/api/shipments/parse-vergi-pdf', methods=['POST', 'OPTIONS'])
def api_parse_vergi_pdf():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    try:
        body    = request.get_json(force=True)
        pdf_b64 = body.get('pdf', '')
        if not pdf_b64:
            return jsonify({'success': False, 'error': 'PDF boş'}), 400

        pdf_bytes = base64.b64decode(pdf_b64)

        # Anlık RSD/EUR kuru çek
        import urllib.request as _urllib
        url = 'https://api.exchangerate-api.com/v4/latest/EUR'
        req = _urllib.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with _urllib.urlopen(req, timeout=5) as resp:
            rates = json.loads(resp.read()).get('rates', {})
        rsd_per_eur = float(rates.get('RSD', 0))

        def to_eur(rsd):
            if not rsd_per_eur:
                return 0.0
            return round(rsd / rsd_per_eur, 2)

        # PDF tipini otomatik tanı
        with __import__('pdfplumber').open(__import__('io').BytesIO(pdf_bytes)) as pdf:
            text = ' '.join((p.extract_text() or '') for p in pdf.pages)

        if 'CARINA' in text or 'POREZ NA DODATU VREDNOST' in text:
            # Gümrük/vergi faturası
            vergi = parse_rs_vergi_pdf(pdf_bytes)
            return jsonify({
                'success': True,
                'tip': 'vergi',
                'rsd': {'carina': vergi['carina'], 'pdv': vergi['pdv'], 'svega': vergi['svega']},
                'eur': {'gumruk_vergisi': to_eur(vergi['carina']), 'kdv': to_eur(vergi['pdv'])},
                'kur': {'rsd_per_eur': rsd_per_eur},
            })

        elif 'troškovi' in text or 'troskovi' in text.lower():
            # Brokerage/spediter faturası
            brokerage = parse_rs_brokerage_pdf(pdf_bytes)
            return jsonify({
                'success': True,
                'tip': 'brokerage',
                'rsd': {'nasi_troskovi': brokerage['nasi_troskovi']},
                'eur': {'brokerage': to_eur(brokerage['nasi_troskovi'])},
                'kur': {'rsd_per_eur': rsd_per_eur},
            })

        else:
            return jsonify({'success': False, 'error': 'PDF tipi tanınamadı. Gümrük veya spediter faturası yükleyin.'}), 400

    except Exception as e:
        return jsonify({'success': False, 'error': str(e), 'trace': traceback.format_exc()}), 500

@app.route('/api/shipments/parse-ge-pdf', methods=['POST', 'OPTIONS'])
def api_parse_ge_pdf():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    try:
        body    = request.get_json(force=True)
        pdf_b64 = body.get('pdf', '')
        if not pdf_b64:
            return jsonify({'success': False, 'error': 'PDF boş'}), 400

        pdf_bytes = base64.b64decode(pdf_b64)

        # Anlık GEL/EUR kuru çek
        import urllib.request as _urllib
        url = 'https://api.exchangerate-api.com/v4/latest/EUR'
        req = _urllib.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with _urllib.urlopen(req, timeout=5) as resp:
            rates = json.loads(resp.read()).get('rates', {})
        gel_per_eur = float(rates.get('GEL', 0))

        def to_eur(gel):
            if not gel_per_eur:
                return 0.0
            return round(gel / gel_per_eur, 2)

        # PDF tipini belirle
        import pdfplumber as _pdfplumber, io as _io
        with _pdfplumber.open(_io.BytesIO(pdf_bytes)) as pdf:
            text = ' '.join((p.extract_text() or '') for p in pdf.pages)

        # Gebrüder Weiss broker faturası
        if 'საბროკერო' in text or 'Gebr' in text or 'ინვოისი' in text:
            broker = parse_ge_broker_pdf(pdf_bytes)
            return jsonify({
                'success':  True,
                'tip':      'broker',
                'gel':      {'brokerage': broker['brokerage']},
                'eur':      {'brokerage': to_eur(broker['brokerage'])},
                'kur':      {'gel_per_eur': gel_per_eur},
            })

        # İthalat beyannamesi (IM)
        elif 'შემოსავლების სამსახური' in text or 'სულ ჯამი' in text:
            im = parse_ge_im_pdf(pdf_bytes)
            return jsonify({
                'success':  True,
                'tip':      'im',
                'gel':      {'kdv': im['kdv'], 'vergi': im['vergi'], 'toplam': im['toplam']},
                'eur':      {'kdv': to_eur(im['kdv']), 'vergi': to_eur(im['vergi'])},
                'kur':      {'gel_per_eur': gel_per_eur},
            })

        else:
            return jsonify({'success': False, 'error': 'PDF tipi tanınamadı. GW broker faturası veya IM beyannamesi yükleyin.'}), 400

    except Exception as e:
        return jsonify({'success': False, 'error': str(e), 'trace': traceback.format_exc()}), 500

@app.route('/api/shipments/parse-ko-pdf', methods=['POST', 'OPTIONS'])
def api_parse_ko_pdf():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    try:
        body    = request.get_json(force=True)
        pdf_b64 = body.get('pdf', '')
        if not pdf_b64:
            return jsonify({'success': False, 'error': 'PDF boş'}), 400

        pdf_bytes = base64.b64decode(pdf_b64)
        ko = parse_ko_pdf(pdf_bytes)

        if not ko['vergi'] and not ko['kdv']:
            return jsonify({'success': False, 'error': 'PDF tipi tanınamadı. Kosova gümrük ödeme emri (Urdhërpagesë) yükleyin.'}), 400

        return jsonify({
            'success': True,
            'eur':     {'vergi': ko['vergi'], 'kdv': ko['kdv'], 'toplam': ko['toplam']},
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e), 'trace': traceback.format_exc()}), 500

@app.route('/api/shipments/parse-de-pdf', methods=['POST', 'OPTIONS'])
def api_parse_de_pdf():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    try:
        body    = request.get_json(force=True)
        pdf_b64 = body.get('pdf', '')
        if not pdf_b64:
            return jsonify({'success': False, 'error': 'PDF boş'}), 400

        pdf_bytes = base64.b64decode(pdf_b64)
        de = parse_de_vergi_pdf(pdf_bytes)

        if not any(de.values()):
            return jsonify({'success': False, 'error': 'PDF tipi tanınamadı. Almanya gümrük faturası (Rechnung/Vorauskassa) yükleyin.'}), 400

        return jsonify({
            'success': True,
            'eur':     {
                'gumruk_vergisi': de['gumruk_vergisi'],
                'kdv':            de['kdv'],
                'brokerage':      de['brokerage'],
                'other_costs':    de['other_costs'],
            },
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e), 'trace': traceback.format_exc()}), 500

@app.route('/api/shipments/parse-nl-pdf', methods=['POST', 'OPTIONS'])
def api_parse_nl_pdf():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    try:
        body    = request.get_json(force=True)
        pdf_b64 = body.get('pdf', '')
        if not pdf_b64:
            return jsonify({'success': False, 'error': 'PDF boş'}), 400

        pdf_bytes = base64.b64decode(pdf_b64)
        nl = parse_nl_broker_pdf(pdf_bytes)

        if not any(nl.values()):
            return jsonify({'success': False, 'error': 'PDF tipi tanınamadı. NedLine Logistics gümrük/broker faturası yükleyin.'}), 400

        return jsonify({
            'success': True,
            'eur':     {
                'brokerage': nl['brokerage'],
                'vergi':     nl['vergi'],
            },
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e), 'trace': traceback.format_exc()}), 500

@app.route('/api/shipments/parse-aksu-pdf', methods=['POST', 'OPTIONS'])
def api_parse_aksu_pdf():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    try:
        body    = request.get_json(force=True)
        pdf_b64 = body.get('pdf', '')
        if not pdf_b64:
            return jsonify({'success': False, 'error': 'PDF boş'}), 400

        pdf_bytes = base64.b64decode(pdf_b64)

        # 1. PDF parse — tüm faturaları çek
        faturalar = parse_aksu_beyanname_pdf(pdf_bytes)
        if not faturalar:
            return jsonify({'success': False, 'error': 'PDF\'den fatura bilgisi çıkarılamadı'}), 400

        # 2. Veritabanında eşleştir ve güncelle
        conn = get_conn()
        cur  = conn.cursor()

        eslesen, atlanan, hatalar = 0, 0, []

        for f in faturalar:
            ref_no    = f.get('ref_no')
            fatura_no = f.get('fatura_no')
            tutar_tl  = f.get('tutar_tl', 0)

            if not tutar_tl:
                atlanan += 1
                hatalar.append(f'{ref_no or fatura_no}: tutar çıkarılamadı')
                continue

            # Önce fatura_no ile eşleştir, yoksa ihracat_dosya_no ile dene
            shipment_id = None
            eur_kuru    = 0.0

            if fatura_no:
                cur.execute(
                    'SELECT id, eur_kuru FROM shipments WHERE fatura_no = %s',
                    (fatura_no,)
                )
                row = cur.fetchone()
                if row:
                    shipment_id = row[0]
                    eur_kuru    = float(row[1] or 0)

            if not shipment_id and ref_no:
                cur.execute(
                    'SELECT id, eur_kuru FROM shipments WHERE ihracat_dosya_no = %s',
                    (ref_no,)
                )
                row = cur.fetchone()
                if row:
                    shipment_id = row[0]
                    eur_kuru    = float(row[1] or 0)

            if not shipment_id:
                atlanan += 1
                hatalar.append(f'{ref_no or fatura_no}: eşleşen kayıt bulunamadı')
                continue

            tutar_eur = round(tutar_tl / eur_kuru, 2) if eur_kuru else 0.0

            cur.execute('''
                UPDATE shipments
                SET ihracat_beyanname_tl  = %s,
                    ihracat_beyanname_eur = %s
                WHERE id = %s
            ''', (tutar_tl, tutar_eur, shipment_id))
            eslesen += 1
            hatalar.append(f'✓ REF:{ref_no} / FATURA:{fatura_no} → {tutar_tl:,.2f} TL / {tutar_eur:,.2f} EUR güncellendi')

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({
            'success':  True,
            'eslesen':  eslesen,
            'atlanan':  atlanan,
            'hatalar':  hatalar,
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e), 'trace': traceback.format_exc()}), 500
    
@app.route('/api/shipments/bulk-update-palet', methods=['POST', 'OPTIONS'])
def api_bulk_update_palet():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    try:
        body = request.get_json(force=True)
        rows = body.get('rows', [])
        if not rows:
            return jsonify({'success': False, 'error': 'Satır listesi boş'}), 400
        guncellenen, atlanan, hatalar = bulk_update_palet(rows)
        return jsonify({
            'success':     True,
            'guncellenen': guncellenen,
            'atlanan':     atlanan,
            'hatalar':     hatalar,
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/shipments/parse-kz-pdf', methods=['POST', 'OPTIONS'])
def api_parse_kz_pdf():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    try:
        body    = request.get_json(force=True)
        pdf_b64   = body.get('pdf', '')
        image_b64 = body.get('image', '')

        # Gümrük beyannamesi mi (ДЕКЛАРАЦИЯ НА ТОВАРЫ), yoksa AVR/broker faturası mı — PDF ise ayırt et
        if pdf_b64 and not image_b64:
            import pdfplumber as _pdfplumber
            pdf_bytes = base64.b64decode(pdf_b64)
            try:
                with _pdfplumber.open(io.BytesIO(pdf_bytes)) as _pdf:
                    _check_text = _pdf.pages[0].extract_text() or ''
            except Exception:
                _check_text = ''

            if 'ДЕКЛАРАЦИЯ НА ТОВАРЫ' in _check_text or 'ПОДРОБНОСТИ ПОДСЧЕТА' in _check_text:
                b = parse_kz_beyanname_pdf(pdf_bytes)
                if not b['vergi'] and not b['kdv']:
                    return jsonify({'success': False, 'error': 'Beyanname okunamadı. "В ПОДРОБНОСТИ ПОДСЧЕТА" bölümü bulunamadı.'}), 422

                kzt_per_eur = 0.0
                try:
                    import urllib.request as _urllib
                    url = 'https://api.exchangerate-api.com/v4/latest/EUR'
                    req = _urllib.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                    with _urllib.urlopen(req, timeout=5) as resp:
                        rates = json.loads(resp.read()).get('rates', {})
                    kzt_per_eur = float(rates.get('KZT', 0) or 0)
                except Exception as kur_err:
                    print(f'[KZ beyanname] Kur hatası: {kur_err}')

                def to_eur(kzt):
                    return round(kzt / kzt_per_eur, 2) if kzt_per_eur else 0.0

                return jsonify({
                    'success': True,
                    'tip':     'beyanname',
                    'kzt':     {'vergi': b['vergi'], 'kdv': b['kdv']},
                    'eur':     {'vergi': to_eur(b['vergi']), 'kdv': to_eur(b['kdv'])},
                    'kur':     {'kzt_per_eur': kzt_per_eur},
                })

        if image_b64:
            result = parse_kz_avr_image(base64.b64decode(image_b64))
        elif pdf_b64:
            result = parse_kz_avr_pdf(base64.b64decode(pdf_b64))
        else:
            return jsonify({'success': False, 'error': 'PDF veya görsel boş'}), 400
        if result.get('_hata') or not result.get('brokerage_kzt'):
            return jsonify({
                'success': False,
                'error': result.get('_hata') or 'Итого satırı okunamadı.',
            }), 422

        return jsonify({
            'success':         True,
            'brokerage_kzt':   result['brokerage_kzt'],
            'other_costs_kzt': result['other_costs_kzt'],
            'brokerage_eur':   result['brokerage_eur'],
            'other_costs_eur': result['other_costs_eur'],
            'kzt_per_eur':     result['kzt_per_eur'],
            'kalemler':        result['kalemler'],
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e), 'trace': traceback.format_exc()}), 500

@app.route('/api/shipments/parse-fr-pdf', methods=['POST', 'OPTIONS'])
def api_parse_fr_pdf():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    return parse_fr_pdf_import()

@app.route('/api/shipments/bulk-import-fr', methods=['POST', 'OPTIONS'])
def api_bulk_import_fr():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    return bulk_import_fr_shipments()

@app.route('/api/kur', methods=['GET', 'OPTIONS'])
def api_kur():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    kurlar = get_tcmb_kurlar()
    return jsonify({'success': True, 'kurlar': kurlar})
# ── Main ──────────────────────────────────────────────────────────────────────

@app.route('/api/shipments/group', methods=['POST', 'OPTIONS'])
def api_shipments_group():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    body = request.get_json() or {}
    ids  = body.get('ids', [])
    if not ids:
        return jsonify({'success': False, 'error': 'id listesi boş'}), 400
    sefer_id = group_shipments(ids)
    return jsonify({'success': True, 'sefer_id': sefer_id})


@app.route('/api/shipments/ungroup', methods=['POST', 'OPTIONS'])
def api_shipments_ungroup():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    body = request.get_json() or {}
    sid  = body.get('id')
    if not sid:
        return jsonify({'success': False, 'error': 'id gerekli'}), 400
    ungroup_shipment(int(sid))
    return jsonify({'success': True})

if __name__ == '__main__':
    port = read_port()
    print(f'Sunucu başlıyor: http://localhost:{port}')
    app.run(host='0.0.0.0', port=port, debug=False)
    

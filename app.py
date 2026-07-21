import base64
import io
import json
import logging
import os
import sys

import pandas as pd
from flask import Flask, jsonify, request, send_file, send_from_directory, g
from api.shipments import shipments_get, shipments_post, shipments_put, shipments_delete, shipments_export, bulk_import_shipments, bulk_update_shipments, bulk_delete_shipments, parse_kz_avr_pdf, parse_kz_avr_image, repair_shipment_freight
from api.landed_cost import landed_cost_get, landed_cost_export
from api.kur import get_tcmb_kurlar

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(BASE_DIR, 'api'))

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger('fatura-araci')

import evrak as evrak_mod
import generate as gen_mod
import taslak as taslak_mod

from api.db import init_db, get_conn
from api.auth import auth_get, auth_post, require_auth
from api.users import users_get, users_post, users_delete
from api.storage import storage_get, storage_post, storage_delete
from api.taslak_store import taslak_store_kaydet, taslak_store_liste, taslak_store_indir, taslak_store_sil
from api.shipments import group_shipments, ungroup_shipment, parse_rs_vergi_pdf, parse_rs_brokerage_pdf, parse_ge_broker_pdf, parse_ge_im_pdf, parse_ko_pdf, parse_de_vergi_pdf, parse_nl_broker_pdf, parse_kz_beyanname_pdf, parse_aksu_beyanname_pdf, parse_fr_pdf_import, bulk_import_fr_shipments, bulk_update_palet
from api.nebim import nebim_delivery_get, nebim_delivery_put
from api.audit import log_action, audit_log_get, audit_log_export
from api.maliyet.meta import maliyet_meta_get, maliyet_kalem_post, maliyet_kalem_put, maliyet_kalem_delete, maliyet_depo_ayar_put
from api.maliyet.tarife import maliyet_tarife_get, maliyet_tarife_post, maliyet_tarife_delete
from api.maliyet.hareket import maliyet_hareket_get, maliyet_hareket_bulk_post, maliyet_hareket_import_post, maliyet_hareket_delete
from api.maliyet.hesap import maliyet_beklenen_get, maliyet_karsilastirma_get, maliyet_analiz_get, maliyet_depolama_get
from api.maliyet.fatura import (maliyet_fatura_get, maliyet_fatura_post,
    maliyet_fatura_put, maliyet_fatura_delete, maliyet_fatura_pdf_post,
    maliyet_gercek_get)
from api.maliyet.rapor import maliyet_rapor_get, maliyet_tarife_rapor_get

def read_port():
    try:
        with open(os.path.join(BASE_DIR, 'config.json'), 'r', encoding='utf-8') as f:
            return int(json.load(f).get('port', 8080))
    except Exception:
        return 8080


app = Flask(__name__, static_folder=None)
init_db()

STATIC_DIRS = {'css', 'js', 'templates', 'fonts', 'assets', 'config'}
PERMISSIONS_PORTAL_PATH = os.path.join(BASE_DIR, 'data', 'permissions_portal.json')

DEFAULT_PERMISSIONS_PORTAL = {
    'title': 'Admin Portalı',
    'subtitle': '',
    'roles': [
        {
            'key': 'viewer',
            'label': 'Görüntüleyici',
            'subtitle': '',
            'icon': '',
            'description': '',
        },
        {
            'key': 'editor',
            'label': 'Düzenleyici',
            'subtitle': '',
            'icon': '',
            'description': '',
        },
        {
            'key': 'admin',
            'label': 'Admin',
            'subtitle': '',
            'icon': '',
            'description': '',
        },
    ],
    'features': [
        {
            'title': 'Dashboard ve raporları görüntüleme',
            'detail': '',
            'icon': '',
            'roles': ['viewer', 'editor', 'admin'],
        },
        {
            'title': 'Fatura ve evrak üretme',
            'detail': '',
            'icon': '',
            'roles': ['editor', 'admin'],
        },
        {
            'title': 'Sevkiyat oluşturma ve güncelleme',
            'detail': '',
            'icon': '',
            'roles': ['editor', 'admin'],
        },
        {
            'title': 'Sevkiyat silme ve toplu gruplama',
            'detail': '',
            'icon': '',
            'roles': ['editor', 'admin'],
        },
        {
            'title': 'Nebim irsaliye hazırlığı',
            'detail': '',
            'icon': '',
            'roles': ['viewer', 'editor', 'admin'],
        },
        {
            'title': 'Toplu içe aktarım',
            'detail': '',
            'icon': '',
            'roles': ['admin'],
        },
        {
            'title': 'Kullanıcı yönetimi',
            'detail': '',
            'icon': '',
            'roles': ['admin'],
        },
        {
            'title': 'İşlem kayıtları',
            'detail': '',
            'icon': '',
            'roles': ['admin'],
        },
    ],
}


def _read_permissions_portal():
    try:
        with open(PERMISSIONS_PORTAL_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except FileNotFoundError:
        data = DEFAULT_PERMISSIONS_PORTAL
    except Exception:
        logger.error("Yetki portalı okunamadı", exc_info=True)
        data = DEFAULT_PERMISSIONS_PORTAL
    return _normalize_permissions_portal(data)


def _normalize_permissions_portal(data):
    data = data if isinstance(data, dict) else {}
    roles = data.get('roles') if isinstance(data.get('roles'), list) else DEFAULT_PERMISSIONS_PORTAL['roles']
    features = data.get('features') if isinstance(data.get('features'), list) else DEFAULT_PERMISSIONS_PORTAL['features']
    allowed_roles = {'viewer', 'editor', 'admin'}

    normalized_roles = []
    for role in roles:
        if not isinstance(role, dict):
            continue
        key = str(role.get('key', '')).strip()
        if key not in allowed_roles:
            continue
        normalized_roles.append({
            'key': key,
            'label': str(role.get('label') or key).strip()[:80],
            'subtitle': str(role.get('subtitle') or '').strip()[:120],
            'icon': str(role.get('icon') or '').strip()[:60],
            'description': str(role.get('description') or '').strip()[:500],
        })
    if not normalized_roles:
        normalized_roles = DEFAULT_PERMISSIONS_PORTAL['roles']

    normalized_features = []
    for feature in features:
        if not isinstance(feature, dict):
            continue
        title = str(feature.get('title') or '').strip()
        if not title:
            continue
        feature_roles = feature.get('roles') if isinstance(feature.get('roles'), list) else []
        normalized_features.append({
            'title': title[:140],
            'detail': str(feature.get('detail') or '').strip()[:500],
            'icon': str(feature.get('icon') or '').strip()[:60],
            'roles': [r for r in feature_roles if r in allowed_roles],
        })

    return {
        'title': str(data.get('title') or DEFAULT_PERMISSIONS_PORTAL['title']).strip()[:120],
        'subtitle': str(data.get('subtitle') or DEFAULT_PERMISSIONS_PORTAL['subtitle']).strip()[:300],
        'roles': normalized_roles,
        'features': normalized_features,
    }


def _write_permissions_portal(data):
    os.makedirs(os.path.dirname(PERMISSIONS_PORTAL_PATH), exist_ok=True)
    with open(PERMISSIONS_PORTAL_PATH, 'w', encoding='utf-8') as f:
        json.dump(_normalize_permissions_portal(data), f, ensure_ascii=False, indent=2)

# Boş bırakılırsa (varsayılan) eski davranış korunur: tüm origin'lere izin verilir.
# Belirli origin'lere kısıtlamak için virgülle ayrılmış liste ver, örn:
#   CORS_ALLOWED_ORIGINS=https://fatura.ornek.com,https://app.ornek.com
_CORS_ALLOWED = [o.strip() for o in os.environ.get('CORS_ALLOWED_ORIGINS', '').split(',') if o.strip()]


def _cors(response):
    if _CORS_ALLOWED:
        origin = request.headers.get('Origin')
        if origin in _CORS_ALLOWED:
            response.headers['Access-Control-Allow-Origin'] = origin
            response.headers['Vary'] = 'Origin'
    else:
        response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    return response


app.after_request(_cors)


def _log_if_success(resp, action, description):
    """resp bir Flask Response (jsonify sonucu); success:true ise audit log'a yazar."""
    try:
        payload = resp[0].get_json(silent=True) if isinstance(resp, tuple) else resp.get_json(silent=True)
        if payload and payload.get('success'):
            log_action(getattr(g, 'user', None), action, description)
    except Exception:
        pass


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
@require_auth()
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
            pl_out, master_out, inv_out, uretici_pdf_out = generate_cy(
                faturalar,
                grup_kilolari  = grup_kilolari,
                exception_skus = exception_skus,
            )
            fatura_no = '_'.join(f.get('faturaNo', '') for f in faturalar)
            master_list = [
                {'fatura_no': m['fatura_no'], 'data': base64.b64encode(m['bytes']).decode(), 'kap': m.get('kap', '')}
                for m in master_out
            ]
            inv_list = [
                {'fatura_no': m['fatura_no'], 'data': base64.b64encode(m['bytes']).decode(), 'dosyaAdi': m['dosya_adi']}
                for m in inv_out
            ]
            uretici_pdf_list = [
                {'fatura_no': m['fatura_no'], 'data': base64.b64encode(m['bytes']).decode(), 'dosyaAdi': m['dosya_adi']}
                for m in uretici_pdf_out
            ]
            log_action(getattr(g, 'user', None), 'invoice_generate', f"Fatura üretti: {fatura_no} ({ulke_kodu})")
            return jsonify({
                'success':        True,
                'excel':          base64.b64encode(pl_out).decode(),
                'masterList':     master_list,
                'invList':        inv_list,
                'ureticiPdfList': uretici_pdf_list,
                'faturaNo':       fatura_no,
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
        log_action(getattr(g, 'user', None), 'invoice_generate', f"Fatura üretti: {fatura_no} ({ulke_kodu})")
        return jsonify(resp)

    except Exception as e:
        logger.error("İstek hatası: %s", request.path, exc_info=True)
        return jsonify({
            'success': False,
            'error':   str(e),
        }), 500

# ── /api/taslak ───────────────────────────────────────────────────────────────

@app.route('/api/taslak', methods=['GET', 'POST', 'OPTIONS'])
@require_auth()
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
        depo_tipi  = body.get('depoTipi', None)

        if not taslak_b64:
            raise ValueError('Taslak Excel verisi boş')
        taslak_bytes = base64.b64decode(taslak_b64)

        config = taslak_mod.load_config(ulke_kodu)
        if config.get('tip') == 'kibris':
            excel_out, dosya_adi = taslak_mod.doldur_kibris(taslak_bytes, config, form_data)
        else:
            excel_out, dosya_adi = taslak_mod.doldur_taslak(
                taslak_bytes, config, form_data, mense_data, depo_tipi)

        log_action(getattr(g, 'user', None), 'taslak_fill', f"Taslak doldurdu: {dosya_adi} ({ulke_kodu})")
        return jsonify({
            'success':  True,
            'excel':    base64.b64encode(excel_out).decode(),
            'dosyaAdi': dosya_adi,
        })

    except Exception as e:
        logger.error("İstek hatası: %s", request.path, exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


# ── /api/evrak ────────────────────────────────────────────────────────────────

@app.route('/api/evrak', methods=['GET', 'POST', 'OPTIONS'])
@require_auth()
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
        log_action(getattr(g, 'user', None), 'evrak_generate', f"Maliyet evrak üretti: {dosya_adi} ({ulke_kodu}/{evrak_tipi})")
        return jsonify({
            'success':  True,
            'pdf':      base64.b64encode(pdf_bytes).decode(),
            'dosyaAdi': dosya_adi,
        })

    except Exception as e:
        logger.error("İstek hatası: %s", request.path, exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


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
@require_auth()
def api_storage():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    if request.method == 'GET':
        return storage_get()
    if request.method == 'DELETE':
        return storage_delete()
    return storage_post()


@app.route('/api/shipments', methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'])
@require_auth()
def api_shipments():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    if request.method == 'GET':
        return shipments_get()
    if request.method == 'PUT':
        resp = shipments_put()
        _log_if_success(resp, 'shipment_update', f"Sevkiyat güncelledi: #{(request.get_json(silent=True) or {}).get('id', '?')}")
        return resp
    if request.method == 'DELETE':
        resp = shipments_delete()
        _log_if_success(resp, 'shipment_delete', f"Sevkiyat sildi: #{(request.get_json(silent=True) or {}).get('id', '?')}")
        return resp
    resp = shipments_post()
    _log_if_success(resp, 'shipment_create', "Yeni sevkiyat oluşturdu")
    return resp

@app.route('/api/shipments/repair-freight', methods=['POST', 'OPTIONS'])
@require_auth()
def api_shipments_repair_freight():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    try:
        return repair_shipment_freight()
    except Exception as e:
        logger.error("İstek hatası: %s", request.path, exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/shipments/repair-usd', methods=['POST', 'OPTIONS'])
@require_auth()
def api_shipments_repair_usd():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    try:
        body = request.get_json() or {}
        from api.shipments import repair_shipment_usd
        return repair_shipment_usd(sid=body.get('id'), fatura_no=body.get('fatura_no', ''))
    except Exception as e:
        logger.error("İstek hatası: %s", request.path, exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/shipments/bulk-repair-usd', methods=['POST', 'OPTIONS'])
@require_auth()
def api_shipments_bulk_repair_usd():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    try:
        from api.shipments import bulk_repair_usd
        onarilan, atlanan, hatalar = bulk_repair_usd()
        return jsonify({'success': True, 'onarilan': onarilan, 'atlanan': atlanan, 'hatalar': hatalar})
    except Exception as e:
        logger.error("İstek hatası: %s", request.path, exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/shipments/bulk-repair-freight-kzge', methods=['POST', 'OPTIONS'])
@require_auth()
def api_shipments_bulk_repair_freight_kzge():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    try:
        from api.shipments import bulk_repair_freight_kz_ge
        onarilan, atlanan, hatalar = bulk_repair_freight_kz_ge()
        return jsonify({'success': True, 'onarilan': onarilan, 'atlanan': atlanan, 'hatalar': hatalar})
    except Exception as e:
        logger.error("İstek hatası: %s", request.path, exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500

        
@app.route('/api/shipments/bulk-import', methods=['POST', 'OPTIONS'])
@require_auth(write=('admin',))
def api_shipments_bulk_import():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    try:
        body = request.get_json(force=True)
        rows = body.get('rows', [])
        if not rows:
            return jsonify({'success': False, 'error': 'Satır listesi boş'}), 400
        eklenen, atlanan, hatalar = bulk_import_shipments(rows)
        log_action(getattr(g, 'user', None), 'shipment_bulk_import', f"Toplu içe aktarım: {eklenen} sevkiyat eklendi")
        return jsonify({
            'success': True,
            'eklenen': eklenen,
            'atlanan': atlanan,
            'hatalar': hatalar,
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/shipments/bulk-update', methods=['POST', 'OPTIONS'])
@require_auth()
def api_shipments_bulk_update():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    try:
        body = request.get_json(force=True)
        rows = body.get('rows', [])
        if not rows:
            return jsonify({'success': False, 'error': 'Satır listesi boş'}), 400
        guncellenen, atlanan, hatalar = bulk_update_shipments(rows)
        log_action(getattr(g, 'user', None), 'shipment_bulk_update', f"Toplu güncelleme: {guncellenen} sevkiyat")
        return jsonify({
            'success': True,
            'guncellenen': guncellenen,
            'atlanan': atlanan,
            'hatalar': hatalar,
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/shipments/bulk-delete', methods=['POST', 'OPTIONS'])
@require_auth()
def api_shipments_bulk_delete():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    try:
        body = request.get_json(force=True)
        ids  = body.get('ids', [])
        if not ids:
            return jsonify({'success': False, 'error': 'id listesi boş'}), 400
        deleted = bulk_delete_shipments(ids)
        log_action(getattr(g, 'user', None), 'shipment_bulk_delete', f"Toplu silme: {deleted} sevkiyat")
        return jsonify({'success': True, 'silinen': deleted})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    
@app.route('/api/shipments/export', methods=['GET', 'OPTIONS'])
@require_auth()
def api_shipments_export():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    return shipments_export()


@app.route('/api/nebim-delivery', methods=['GET', 'PUT', 'OPTIONS'])
@require_auth()
def api_nebim_delivery():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    if request.method == 'PUT':
        return nebim_delivery_put()
    return nebim_delivery_get()


@app.route('/api/landed-cost', methods=['GET', 'OPTIONS'])
@require_auth()
def api_landed_cost():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    return landed_cost_get()


@app.route('/api/landed-cost/export', methods=['GET', 'OPTIONS'])
@require_auth()
def api_landed_cost_export():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    return landed_cost_export()


# ── MALİYET TAKİP (dış depo 3PL maliyetleri) ─────────────────────────────────

@app.route('/api/maliyet/meta', methods=['GET', 'OPTIONS'])
@require_auth()
def api_maliyet_meta():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    return maliyet_meta_get()


@app.route('/api/maliyet/kalem', methods=['POST', 'OPTIONS'])
@app.route('/api/maliyet/kalem/<int:kalem_id>', methods=['PUT', 'DELETE', 'OPTIONS'])
@require_auth()
def api_maliyet_kalem(kalem_id=None):
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    if request.method == 'POST':
        return maliyet_kalem_post()
    if request.method == 'PUT':
        return maliyet_kalem_put(kalem_id)
    return maliyet_kalem_delete(kalem_id)


@app.route('/api/maliyet/tarife', methods=['GET', 'POST', 'OPTIONS'])
@app.route('/api/maliyet/tarife/<int:tarife_id>', methods=['DELETE', 'OPTIONS'])
@require_auth()
def api_maliyet_tarife(tarife_id=None):
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    if request.method == 'GET':
        return maliyet_tarife_get()
    if request.method == 'POST':
        return maliyet_tarife_post()
    return maliyet_tarife_delete(tarife_id)


@app.route('/api/maliyet/depo-ayar', methods=['PUT', 'OPTIONS'])
@require_auth()
def api_maliyet_depo_ayar():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    return maliyet_depo_ayar_put()


@app.route('/api/maliyet/tarife/export', methods=['GET', 'OPTIONS'])
@require_auth()
def api_maliyet_tarife_export():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    return maliyet_tarife_rapor_get()


@app.route('/api/maliyet/hareket', methods=['GET', 'OPTIONS'])
@app.route('/api/maliyet/hareket/<int:hareket_id>', methods=['DELETE', 'OPTIONS'])
@require_auth()
def api_maliyet_hareket(hareket_id=None):
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    if request.method == 'GET':
        return maliyet_hareket_get()
    return maliyet_hareket_delete(hareket_id)


@app.route('/api/maliyet/hareket/bulk', methods=['POST', 'OPTIONS'])
@require_auth()
def api_maliyet_hareket_bulk():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    return maliyet_hareket_bulk_post()


@app.route('/api/maliyet/hareket/import', methods=['POST', 'OPTIONS'])
@require_auth()
def api_maliyet_hareket_import():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    return maliyet_hareket_import_post()


@app.route('/api/maliyet/beklenen', methods=['GET', 'OPTIONS'])
@require_auth()
def api_maliyet_beklenen():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    return maliyet_beklenen_get()


@app.route('/api/maliyet/karsilastirma', methods=['GET', 'OPTIONS'])
@require_auth()
def api_maliyet_karsilastirma():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    return maliyet_karsilastirma_get()


@app.route('/api/maliyet/depolama', methods=['GET', 'OPTIONS'])
@require_auth()
def api_maliyet_depolama():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    return maliyet_depolama_get()


@app.route('/api/maliyet/analiz', methods=['GET', 'OPTIONS'])
@require_auth()
def api_maliyet_analiz():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    return maliyet_analiz_get()


@app.route('/api/maliyet/rapor', methods=['GET', 'OPTIONS'])
@require_auth()
def api_maliyet_rapor():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    return maliyet_rapor_get()


@app.route('/api/maliyet/fatura', methods=['GET', 'POST', 'OPTIONS'])
@app.route('/api/maliyet/fatura/<int:fatura_id>', methods=['PUT', 'DELETE', 'OPTIONS'])
@require_auth()
def api_maliyet_fatura(fatura_id=None):
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    if request.method == 'GET':
        return maliyet_fatura_get()
    if request.method == 'POST':
        return maliyet_fatura_post()
    if request.method == 'PUT':
        return maliyet_fatura_put(fatura_id)
    return maliyet_fatura_delete(fatura_id)


@app.route('/api/maliyet/fatura/pdf-oku', methods=['POST', 'OPTIONS'])
@require_auth()
def api_maliyet_fatura_pdf_oku():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    return maliyet_fatura_pdf_post()


@app.route('/api/maliyet/gercek', methods=['GET', 'OPTIONS'])
@require_auth()
def api_maliyet_gercek():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    return maliyet_gercek_get()

@app.route('/api/taslak-store/kaydet', methods=['POST', 'OPTIONS'])
@require_auth()
def api_taslak_store_kaydet():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    return taslak_store_kaydet()

@app.route('/api/taslak-store/liste', methods=['GET', 'OPTIONS'])
@require_auth()
def api_taslak_store_liste():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    return taslak_store_liste()

@app.route('/api/taslak-store/indir/<int:taslak_id>', methods=['GET', 'OPTIONS'])
@require_auth()
def api_taslak_store_indir(taslak_id):
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    return taslak_store_indir(taslak_id)

@app.route('/api/taslak-store/sil/<int:taslak_id>', methods=['DELETE', 'OPTIONS'])
@require_auth()
def api_taslak_store_sil(taslak_id):
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    return taslak_store_sil(taslak_id)

@app.route('/api/shipments/parse-vergi-pdf', methods=['POST', 'OPTIONS'])
@require_auth()
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
        logger.error("İstek hatası: %s", request.path, exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/shipments/parse-ge-pdf', methods=['POST', 'OPTIONS'])
@require_auth()
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
        logger.error("İstek hatası: %s", request.path, exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/shipments/parse-ko-pdf', methods=['POST', 'OPTIONS'])
@require_auth()
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
        logger.error("İstek hatası: %s", request.path, exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/shipments/parse-de-pdf', methods=['POST', 'OPTIONS'])
@require_auth()
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
        logger.error("İstek hatası: %s", request.path, exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/shipments/parse-nl-pdf', methods=['POST', 'OPTIONS'])
@require_auth()
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
        logger.error("İstek hatası: %s", request.path, exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/shipments/parse-aksu-pdf', methods=['POST', 'OPTIONS'])
@require_auth(write=('admin',))
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
        logger.error("İstek hatası: %s", request.path, exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500
    
@app.route('/api/shipments/bulk-update-palet', methods=['POST', 'OPTIONS'])
@require_auth()
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
@require_auth()
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
        logger.error("İstek hatası: %s", request.path, exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/shipments/parse-fr-pdf', methods=['POST', 'OPTIONS'])
@require_auth(write=('admin',))
def api_parse_fr_pdf():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    return parse_fr_pdf_import()

@app.route('/api/shipments/bulk-import-fr', methods=['POST', 'OPTIONS'])
@require_auth(write=('admin',))
def api_bulk_import_fr():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    resp = bulk_import_fr_shipments()
    _log_if_success(resp, 'shipment_bulk_import', "Toplu içe aktarım (FR)")
    return resp

@app.route('/api/kur', methods=['GET', 'OPTIONS'])
@require_auth()
def api_kur():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    kurlar = get_tcmb_kurlar()
    return jsonify({'success': True, 'kurlar': kurlar})

@app.route('/api/audit-log', methods=['GET', 'OPTIONS'])
@require_auth(read=('admin',), write=('admin',))
def api_audit_log():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    return audit_log_get()

@app.route('/api/audit-log/export', methods=['GET', 'OPTIONS'])
@require_auth(read=('admin',), write=('admin',))
def api_audit_log_export():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    return audit_log_export()


@app.route('/api/permissions-portal', methods=['GET', 'PUT', 'OPTIONS'])
@require_auth(read=('admin',), write=('admin',))
def api_permissions_portal():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    if request.method == 'GET':
        return jsonify({'success': True, 'portal': _read_permissions_portal()})
    body = request.get_json(force=True) or {}
    portal = body.get('portal') if isinstance(body.get('portal'), dict) else body
    _write_permissions_portal(portal)
    log_action(getattr(g, 'user', None), 'permissions_portal_update', 'Yetki portalını güncelledi')
    return jsonify({'success': True, 'portal': _read_permissions_portal()})
# ── Main ──────────────────────────────────────────────────────────────────────

@app.route('/api/shipments/group', methods=['POST', 'OPTIONS'])
@require_auth()
def api_shipments_group():
    if request.method == 'OPTIONS':
        return app.make_default_options_response()
    body = request.get_json() or {}
    ids  = body.get('ids', [])
    if not ids:
        return jsonify({'success': False, 'error': 'id listesi boş'}), 400
    sefer_id = group_shipments(ids)
    log_action(getattr(g, 'user', None), 'shipment_group', f"{len(ids)} sevkiyatı gruplandı: {sefer_id}")
    return jsonify({'success': True, 'sefer_id': sefer_id})


@app.route('/api/shipments/ungroup', methods=['POST', 'OPTIONS'])
@require_auth()
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
    

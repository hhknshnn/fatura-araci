# api/storage.py
# Cloudflare R2 (dosya) + KV (metadata) entegrasyonu
# Tamamen bağımsız endpoint — diğer hiçbir dosyaya dokunmaz

from http.server import BaseHTTPRequestHandler
import json
import base64
import os
import traceback
import time
import boto3
from botocore.config import Config
import urllib.request
import urllib.parse

# ── CLOUDFLARE BAĞLANTI BİLGİLERİ ────────────────────────────────────────────
CF_ACCOUNT_ID    = os.environ.get('CF_ACCOUNT_ID', '')
CF_API_TOKEN     = os.environ.get('CF_API_TOKEN', '')
CF_R2_ACCESS_KEY = os.environ.get('CF_R2_ACCESS_KEY', '')
CF_R2_SECRET_KEY = os.environ.get('CF_R2_SECRET_KEY', '')
CF_R2_BUCKET     = os.environ.get('CF_R2_BUCKET', 'fatura-araci')
CF_KV_NAMESPACE  = os.environ.get('CF_KV_NAMESPACE_ID', '')

TTL_SECONDS = 36 * 60 * 60  # 36 saat

# ── R2 CLIENT ─────────────────────────────────────────────────────────────────
def get_r2_client():
    return boto3.client(
        's3',
        endpoint_url=f'https://{CF_ACCOUNT_ID}.r2.cloudflarestorage.com',
        aws_access_key_id=CF_R2_ACCESS_KEY,
        aws_secret_access_key=CF_R2_SECRET_KEY,
        config=Config(signature_version='s3v4'),
        region_name='auto',
    )

# ── KV YARDIMCILARI ───────────────────────────────────────────────────────────
def kv_base_url():
    return f'https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/storage/kv/namespaces/{CF_KV_NAMESPACE}'

def kv_headers():
    return {'Authorization': f'Bearer {CF_API_TOKEN}', 'Content-Type': 'application/json'}

def kv_list():
    url = kv_base_url() + '/keys'
    req = urllib.request.Request(url, headers=kv_headers())
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read()).get('result', [])

def kv_get(key):
    url = kv_base_url() + '/values/' + urllib.parse.quote(key, safe='')
    req = urllib.request.Request(url, headers=kv_headers())
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except Exception:
        return None

def kv_put(key, value, ttl=TTL_SECONDS):
    url = kv_base_url() + '/values/' + urllib.parse.quote(key, safe='') + f'?expiration_ttl={ttl}'
    body = json.dumps(value).encode('utf-8')
    req = urllib.request.Request(url, data=body, headers=kv_headers(), method='PUT')
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

def kv_delete(key):
    url = kv_base_url() + '/values/' + urllib.parse.quote(key, safe='')
    req = urllib.request.Request(url, headers=kv_headers(), method='DELETE')
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except Exception:
        return None

# ── R2 YARDIMCILARI ───────────────────────────────────────────────────────────
def r2_upload(key, data_bytes, content_type='application/octet-stream'):
    get_r2_client().put_object(Bucket=CF_R2_BUCKET, Key=key, Body=data_bytes, ContentType=content_type)

def r2_download(key):
    return get_r2_client().get_object(Bucket=CF_R2_BUCKET, Key=key)['Body'].read()

def r2_delete(key):
    get_r2_client().delete_object(Bucket=CF_R2_BUCKET, Key=key)

# ── KAYDET ────────────────────────────────────────────────────────────────────
def save_record(ulke, fatura_no, dosya_turu, excel_bytes=None, pdf_bytes=None,
                master_bytes=None, price_list_bytes=None, mill_test_bytes=None):
    timestamp = int(time.time())
    key_base  = f'{ulke}_{fatura_no}_{dosya_turu}_{timestamp}'
    r2_keys   = {}

    if excel_bytes:
        r2_key = f'{key_base}_invpl.xlsx'
        r2_upload(r2_key, excel_bytes,
                  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        r2_keys['excel'] = r2_key

    if pdf_bytes:
        r2_key = f'{key_base}_fatura.pdf'
        r2_upload(r2_key, pdf_bytes, 'application/pdf')
        r2_keys['pdf'] = r2_key

    if master_bytes:
        r2_key = f'{key_base}_master.xlsx'
        r2_upload(r2_key, master_bytes,
                  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        r2_keys['master'] = r2_key

    if price_list_bytes:
        r2_key = f'{key_base}_pricelist.pdf'
        r2_upload(r2_key, price_list_bytes, 'application/pdf')
        r2_keys['priceList'] = r2_key

    if mill_test_bytes:
        r2_key = f'{key_base}_milltest.pdf'
        r2_upload(r2_key, mill_test_bytes, 'application/pdf')
        r2_keys['millTest'] = r2_key

    metadata = {
        'ulke':      ulke,
        'faturaNo':  fatura_no,
        'dosyaTuru': dosya_turu,
        'tarih':     timestamp,
        'expiresAt': timestamp + TTL_SECONDS,
        'r2Keys':    r2_keys,
    }
    kv_put(key_base, metadata)
    return key_base

# ── LİSTELE ───────────────────────────────────────────────────────────────────
def list_records():
    now     = int(time.time())
    keys    = kv_list()
    records = []
    for k in keys:
        key_name = k.get('name', '')
        # user: ve session: key'lerine DOKUNMA
        if key_name.startswith('user:') or key_name.startswith('session:'):
            continue
        meta = kv_get(key_name)
        if not meta:
            continue
        if meta.get('expiresAt', 0) < now:
            _cleanup_record(key_name, meta)
            continue
        meta['key'] = key_name
        records.append(meta)
    records.sort(key=lambda x: x.get('tarih', 0), reverse=True)
    return records

# ── TEMİZLE ───────────────────────────────────────────────────────────────────
def _cleanup_record(key_name, meta):
    for r2_key in meta.get('r2Keys', {}).values():
        try:
            r2_delete(r2_key)
        except Exception:
            pass
    kv_delete(key_name)

# ── DOSYA GETİR ───────────────────────────────────────────────────────────────
def get_record_files(key_name):
    meta = kv_get(key_name)
    if not meta:
        raise ValueError('Kayıt bulunamadı')
    result = {'meta': meta, 'files': {}}
    for dosya_turu, r2_key in meta.get('r2Keys', {}).items():
        try:
            data = r2_download(r2_key)
            result['files'][dosya_turu] = base64.b64encode(data).decode('utf-8')
        except Exception:
            pass
    return result

# ── VERCEL HANDLER ────────────────────────────────────────────────────────────
class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.end_headers()

    def do_GET(self):
        try:
            from urllib.parse import urlparse, parse_qs
            qs  = parse_qs(urlparse(self.path).query)
            key = qs.get('key', [None])[0]

            if key:
                # Belirli bir kaydın dosyalarını getir
                data   = get_record_files(key)
                result = json.dumps({'success': True, **data})
            else:
                # Tüm kayıtları listele
                records = list_records()
                result  = json.dumps({'success': True, 'records': records})

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(result.encode('utf-8'))

        except Exception as e:
            self._error(e)

    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body   = json.loads(self.rfile.read(length))

            ulke       = body.get('ulke', '')
            fatura_no  = body.get('faturaNo', '')
            dosya_turu = body.get('dosyaTuru', 'inv_pl')
            excel_b64  = body.get('excel', '')
            pdf_b64    = body.get('pdf', '')

            if not ulke or not fatura_no:
                raise ValueError('ulke ve faturaNo zorunlu')

            excel_bytes      = base64.b64decode(excel_b64)                 if excel_b64                 else None
            pdf_bytes        = base64.b64decode(pdf_b64)                   if pdf_b64                   else None
            master_bytes     = base64.b64decode(body.get('master', ''))    if body.get('master')        else None
            price_list_bytes = base64.b64decode(body.get('priceList', '')) if body.get('priceList')     else None
            mill_test_bytes  = base64.b64decode(body.get('millTest', ''))  if body.get('millTest')      else None

            key = save_record(ulke, fatura_no, dosya_turu,
                            excel_bytes, pdf_bytes,
                            master_bytes, price_list_bytes, mill_test_bytes)

            result = json.dumps({'success': True, 'key': key})
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(result.encode('utf-8'))

        except Exception as e:
            self._error(e)

    def do_DELETE(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body   = json.loads(self.rfile.read(length))
            key    = body.get('key', '')
            if not key:
                raise ValueError('key zorunlu')
            meta = kv_get(key)
            if meta:
                _cleanup_record(key, meta)
            result = json.dumps({'success': True})
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(result.encode('utf-8'))
        except Exception as e:
            self._error(e)

    def _error(self, e):
        err = json.dumps({'success': False, 'error': str(e), 'trace': traceback.format_exc()})
        self.send_response(500)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(err.encode('utf-8'))

    def log_message(self, format, *args):
        pass
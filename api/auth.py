from http.server import BaseHTTPRequestHandler
import json
import os
import hashlib
import secrets
import time
import traceback
import urllib.request
import urllib.parse

# ── CLOUDFLARE BAĞLANTI ───────────────────────────────────────────────────────
CF_ACCOUNT_ID  = os.environ.get('CF_ACCOUNT_ID', '')
CF_API_TOKEN   = os.environ.get('CF_API_TOKEN', '')
CF_KV_NAMESPACE = os.environ.get('CF_KV_NAMESPACE_ID', '')

SESSION_TTL = 8 * 60 * 60  # 8 saat


# ── KV YARDIMCILARI ───────────────────────────────────────────────────────────
def kv_base_url():
    return (
        f'https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}'
        f'/storage/kv/namespaces/{CF_KV_NAMESPACE}'
    )

def kv_headers():
    return {
        'Authorization': f'Bearer {CF_API_TOKEN}',
        'Content-Type': 'application/json',
    }

def kv_get(key):
    url = kv_base_url() + '/values/' + urllib.parse.quote(key, safe='')
    req = urllib.request.Request(url, headers=kv_headers())
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except Exception:
        return None

def kv_put(key, value, ttl=None):
    qs = f'?expiration_ttl={ttl}' if ttl else ''
    url = kv_base_url() + '/values/' + urllib.parse.quote(key, safe='') + qs
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

def kv_list(prefix=''):
    url = kv_base_url() + '/keys'
    if prefix:
        url += '?prefix=' + urllib.parse.quote(prefix, safe='')
    req = urllib.request.Request(url, headers=kv_headers())
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read()).get('result', [])
    except Exception:
        return []


# ── ŞİFRE HASH ───────────────────────────────────────────────────────────────
def hash_password(password):
    return hashlib.sha256(password.encode('utf-8')).hexdigest()


# ── KULLANICI İŞLEMLERİ ───────────────────────────────────────────────────────
def get_user(username):
    return kv_get(f'user:{username.lower()}')

def create_user(username, password, display_name, role='user'):
    key = f'user:{username.lower()}'
    data = {
        'username':     username.lower(),
        'displayName':  display_name,
        'passwordHash': hash_password(password),
        'role':         role,
        'createdAt':    int(time.time()),
    }
    kv_put(key, data)
    return data



# ── SESSION İŞLEMLERİ ────────────────────────────────────────────────────────
def create_session(username, display_name, role):
    token = secrets.token_hex(32)
    data = {
        'username':    username,
        'displayName': display_name,
        'role':        role,
        'createdAt':   int(time.time()),
        'expiresAt':   int(time.time()) + SESSION_TTL,
    }
    kv_put(f'session:{token}', data, ttl=SESSION_TTL)
    return token, data

def get_session(token):
    if not token:
        return None
    data = kv_get(f'session:{token}')
    if not data:
        return None
    if data.get('expiresAt', 0) < int(time.time()):
        kv_delete(f'session:{token}')
        return None
    return data

def delete_session(token):
    kv_delete(f'session:{token}')


# ── TOKEN'DAN SESSION AL ──────────────────────────────────────────────────────
def get_token_from_headers(headers):
    for key in headers:
        if key.lower() == 'authorization':
            val = headers[key]
            if val.startswith('Bearer '):
                return val[7:]
    return None

# ── VERCEL HANDLER ────────────────────────────────────────────────────────────
class handler(BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_GET(self):
        """GET /api/auth → oturum kontrolü (me)"""
        try:
            token = get_token_from_headers(dict(self.headers))
            session = get_session(token)
            if not session:
                self._json({'success': False, 'error': 'Oturum geçersiz'}, 401)
                return
            self._json({
                'success':     True,
                'username':    session['username'],
                'displayName': session['displayName'],
                'role':        session['role'],
            })
        except Exception as e:
            self._error(e)

    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body   = json.loads(self.rfile.read(length))
            action = body.get('action', 'login')

            if action == 'login':
                self._handle_login(body)
            elif action == 'logout':
                self._handle_logout(body)
            elif action == 'change_password':
                self._handle_change_password(body)
            else:
                self._json({'success': False, 'error': 'Bilinmeyen action'}, 400)

        except Exception as e:
            self._error(e)

    def _handle_login(self, body):
        username = str(body.get('username', '')).strip().lower()
        password = str(body.get('password', '')).strip()

        if not username or not password:
            self._json({'success': False, 'error': 'Kullanıcı adı ve şifre gerekli'}, 400)
            return

        user = get_user(username)
        if not user:
            self._json({'success': False, 'error': 'Kullanıcı adı veya şifre hatalı'}, 401)
            return

        if user['passwordHash'] != hash_password(password):
            self._json({'success': False, 'error': 'Kullanıcı adı veya şifre hatalı'}, 401)
            return

        token, session = create_session(username, user['displayName'], user['role'])
        self._json({
            'success':     True,
            'token':       token,
            'username':    username,
            'displayName': user['displayName'],
            'role':        user['role'],
        })

    def _handle_logout(self, body):
        token = body.get('token', '') or get_token_from_headers(dict(self.headers))
        if token:
            delete_session(token)
        self._json({'success': True})

    def _handle_change_password(self, body):
        token = get_token_from_headers(dict(self.headers))
        session = get_session(token)
        if not session:
            self._json({'success': False, 'error': 'Oturum geçersiz'}, 401)
            return

        old_password = str(body.get('oldPassword', '')).strip()
        new_password = str(body.get('newPassword', '')).strip()

        if not old_password or not new_password:
            self._json({'success': False, 'error': 'Eski ve yeni şifre gerekli'}, 400)
            return

        if len(new_password) < 4:
            self._json({'success': False, 'error': 'Şifre en az 4 karakter olmalı'}, 400)
            return

        user = get_user(session['username'])
        if not user or user['passwordHash'] != hash_password(old_password):
            self._json({'success': False, 'error': 'Mevcut şifre hatalı'}, 401)
            return

        user['passwordHash'] = hash_password(new_password)
        kv_put(f'user:{session["username"]}', user)
        self._json({'success': True})

    def _json(self, data, status=200):
        body = json.dumps(data).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')

    def _error(self, e):
        body = json.dumps({
            'success': False,
            'error':   str(e),
            'trace':   traceback.format_exc(),
        }).encode('utf-8')
        self.send_response(500)
        self.send_header('Content-Type', 'application/json')
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        pass

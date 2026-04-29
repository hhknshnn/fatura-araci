from http.server import BaseHTTPRequestHandler
import json
import os
import hashlib
import time
import traceback
import urllib.request
import urllib.parse

# ── CLOUDFLARE BAĞLANTI ───────────────────────────────────────────────────────
CF_ACCOUNT_ID   = os.environ.get('CF_ACCOUNT_ID', '')
CF_API_TOKEN    = os.environ.get('CF_API_TOKEN', '')
CF_KV_NAMESPACE = os.environ.get('CF_KV_NAMESPACE_ID', '')

SESSION_TTL = 8 * 60 * 60


# ── KV YARDIMCILARI (auth.py ile aynı, bağımsız kopyası) ─────────────────────
def kv_base_url():
    return (
        f'https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}'
        f'/storage/kv/namespaces/{CF_KV_NAMESPACE}'
    )

def kv_headers():
    return {
        'Authorization': f'Bearer {CF_API_TOKEN}',
        'Content-Type':  'application/json',
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


# ── SESSION KONTROLÜ ──────────────────────────────────────────────────────────
def get_token_from_headers(headers):
    auth = headers.get('Authorization', '') or headers.get('authorization', '')
    if auth.startswith('Bearer '):
        return auth[7:]
    return None

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

def require_admin(headers):
    """Admin session kontrolü. Session döner ya da None."""
    token   = get_token_from_headers(headers)
    session = get_session(token)
    if not session:
        return None, 'Oturum geçersiz'
    if session.get('role') != 'admin':
        return None, 'Bu işlem için admin yetkisi gerekli'
    return session, None


# ── KULLANICI İŞLEMLERİ ───────────────────────────────────────────────────────
def get_all_users():
    keys  = kv_list(prefix='user:')
    users = []
    for k in keys:
        key_name = k.get('name', '')
        user = kv_get(key_name)
        if user:
            safe = {
                'username':    user.get('username', ''),
                'displayName': user.get('displayName', ''),
                'role':        user.get('role', 'user'),
                'createdAt':   user.get('createdAt', 0),
            }
            users.append(safe)
    users.sort(key=lambda u: u.get('createdAt', 0))
    return users

def user_exists(username):
    return kv_get(f'user:{username.lower()}') is not None

def create_user(username, password, display_name, role='user'):
    key  = f'user:{username.lower()}'
    data = {
        'username':     username.lower(),
        'displayName':  display_name,
        'passwordHash': hash_password(password),
        'role':         role,
        'createdAt':    int(time.time()),
    }
    kv_put(key, data)
    return data

def delete_user(username):
    kv_delete(f'user:{username.lower()}')

def reset_password(username, new_password):
    user = kv_get(f'user:{username.lower()}')
    if not user:
        return False
    user['passwordHash'] = hash_password(new_password)
    kv_put(f'user:{username.lower()}', user)
    return True

def update_role(username, new_role):
    user = kv_get(f'user:{username.lower()}')
    if not user:
        return False
    user['role'] = new_role
    kv_put(f'user:{username.lower()}', user)
    return True


# ── VERCEL HANDLER ────────────────────────────────────────────────────────────
class handler(BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_GET(self):
        """Tüm kullanıcıları listele — admin only"""
        try:
            session, err = require_admin(dict(self.headers))
            if err:
                self._json({'success': False, 'error': err}, 401)
                return
            users = get_all_users()
            self._json({'success': True, 'users': users})
        except Exception as e:
            self._error(e)

    def do_POST(self):
        """Kullanıcı ekle — admin only"""
        try:
            session, err = require_admin(dict(self.headers))
            if err:
                self._json({'success': False, 'error': err}, 401)
                return

            length = int(self.headers.get('Content-Length', 0))
            body   = json.loads(self.rfile.read(length))
            action = body.get('action', 'create')

            if action == 'create':
                self._handle_create(body)
            elif action == 'reset_password':
                self._handle_reset_password(body)
            elif action == 'update_role':
                self._handle_update_role(body)
            else:
                self._json({'success': False, 'error': 'Bilinmeyen action'}, 400)

        except Exception as e:
            self._error(e)

    def do_DELETE(self):
        """Kullanıcı sil — admin only, kendi hesabını silemez"""
        try:
            session, err = require_admin(dict(self.headers))
            if err:
                self._json({'success': False, 'error': err}, 401)
                return

            length = int(self.headers.get('Content-Length', 0))
            body   = json.loads(self.rfile.read(length))
            username = str(body.get('username', '')).strip().lower()

            if not username:
                self._json({'success': False, 'error': 'username gerekli'}, 400)
                return

            if username == session['username']:
                self._json({'success': False, 'error': 'Kendi hesabını silemezsin'}, 400)
                return

            if not user_exists(username):
                self._json({'success': False, 'error': 'Kullanıcı bulunamadı'}, 404)
                return

            delete_user(username)
            self._json({'success': True})

        except Exception as e:
            self._error(e)

    def _handle_create(self, body):
        username     = str(body.get('username', '')).strip().lower()
        password     = str(body.get('password', '')).strip()
        display_name = str(body.get('displayName', '')).strip()
        role         = str(body.get('role', 'user')).strip()

        if not username or not password or not display_name:
            self._json({'success': False, 'error': 'username, password, displayName gerekli'}, 400)
            return

        if len(password) < 4:
            self._json({'success': False, 'error': 'Şifre en az 4 karakter olmalı'}, 400)
            return

        if role not in ('admin', 'user'):
            role = 'user'

        if user_exists(username):
            self._json({'success': False, 'error': 'Bu kullanıcı adı zaten mevcut'}, 400)
            return

        user = create_user(username, password, display_name, role)
        self._json({
            'success': True,
            'user': {
                'username':    user['username'],
                'displayName': user['displayName'],
                'role':        user['role'],
            }
        })

    def _handle_reset_password(self, body):
        username     = str(body.get('username', '')).strip().lower()
        new_password = str(body.get('newPassword', '')).strip()

        if not username or not new_password:
            self._json({'success': False, 'error': 'username ve newPassword gerekli'}, 400)
            return

        if len(new_password) < 4:
            self._json({'success': False, 'error': 'Şifre en az 4 karakter olmalı'}, 400)
            return

        if not reset_password(username, new_password):
            self._json({'success': False, 'error': 'Kullanıcı bulunamadı'}, 404)
            return

        self._json({'success': True})

    def _handle_update_role(self, body):
        username = str(body.get('username', '')).strip().lower()
        new_role = str(body.get('role', 'user')).strip()

        if not username:
            self._json({'success': False, 'error': 'username gerekli'}, 400)
            return

        if new_role not in ('admin', 'user'):
            self._json({'success': False, 'error': 'Rol admin veya user olmalı'}, 400)
            return

        if not update_role(username, new_role):
            self._json({'success': False, 'error': 'Kullanıcı bulunamadı'}, 404)
            return

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
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')

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

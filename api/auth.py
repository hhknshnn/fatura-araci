# api/auth.py
# Kullanıcı girişi, oturum yönetimi — PostgreSQL tabanlı

import bcrypt
import secrets
import time
import traceback
from api.db import get_conn

SESSION_TTL = 8 * 60 * 60  # 8 saat
REMEMBER_SESSION_TTL = 30 * 24 * 60 * 60  # 30 gün

ROLES = ('admin', 'editor', 'viewer')


def normalize_role(role):
    """Eski 'user' rolünü editor'e eşitler; bilinmeyen rolleri güvenli tarafta (viewer) tutar."""
    if role == 'admin':
        return 'admin'
    if role in ('editor', 'user'):
        return 'editor'
    if role == 'viewer':
        return 'viewer'
    return 'viewer'


# ── ŞİFRE HASH ───────────────────────────────────────────────────────────────
def hash_password(password):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def check_password(password, hashed):
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))


# ── KULLANICI İŞLEMLERİ ───────────────────────────────────────────────────────
def get_user(username):
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute('SELECT username, display_name, password_hash, role FROM users WHERE username = %s', (username.lower(),))
    row = cur.fetchone()
    cur.close()
    conn.close()
    if not row:
        return None
    return {'username': row[0], 'displayName': row[1], 'passwordHash': row[2], 'role': row[3]}

def create_user(username, password, display_name, role='user'):
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute('''
        INSERT INTO users (username, display_name, password_hash, role, created_at)
        VALUES (%s, %s, %s, %s, %s)
    ''', (username.lower(), display_name, hash_password(password), role, int(time.time())))
    conn.commit()
    cur.close()
    conn.close()


# ── SESSION İŞLEMLERİ ────────────────────────────────────────────────────────
def create_session(username, display_name, role, remember_me=False):
    token = secrets.token_hex(32)
    now   = int(time.time())
    ttl   = REMEMBER_SESSION_TTL if remember_me else SESSION_TTL
    conn  = get_conn()
    cur   = conn.cursor()
    cur.execute('''
        INSERT INTO sessions (token, username, display_name, role, created_at, expires_at)
        VALUES (%s, %s, %s, %s, %s, %s)
    ''', (token, username, display_name, role, now, now + ttl))
    conn.commit()
    cur.close()
    conn.close()
    return token

def get_session(token):
    if not token:
        return None
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute('SELECT username, display_name, role, expires_at FROM sessions WHERE token = %s', (token,))
    row = cur.fetchone()
    cur.close()
    conn.close()
    if not row:
        return None
    if row[3] < int(time.time()):
        delete_session(token)
        return None
    return {'username': row[0], 'displayName': row[1], 'role': row[2], 'expiresAt': row[3]}

def delete_session(token):
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute('DELETE FROM sessions WHERE token = %s', (token,))
    conn.commit()
    cur.close()
    conn.close()


# ── TOKEN'DAN SESSION AL ──────────────────────────────────────────────────────
def get_token_from_headers(headers):
    auth = headers.get('Authorization', '') or headers.get('authorization', '')
    if auth.startswith('Bearer '):
        return auth[7:]
    return None

def get_session_from_headers(headers):
    token = get_token_from_headers(headers)
    return get_session(token)

def require_roles(headers, allowed_roles):
    session = get_session_from_headers(headers)
    if not session:
        return None, 'Oturum geçersiz'
    if normalize_role(session.get('role')) not in allowed_roles:
        return None, 'Bu işlem için yetkiniz yok'
    return session, None

def require_admin(headers):
    return require_roles(headers, {'admin'})


# ── FLASK ROUTE FONKSİYONLARI ─────────────────────────────────────────────────
from functools import wraps
from flask import request, jsonify, g


def require_auth(read=ROLES, write=('admin', 'editor')):
    """Route dekoratörü: OPTIONS'ı geçirir, GET/HEAD için `read`, diğer metodlar için
    `write` rol setini kontrol eder. Yetkiliyse session'ı flask.g.user'a koyar."""
    read_roles  = set(read)
    write_roles = set(write)

    def decorator(view_func):
        @wraps(view_func)
        def wrapped(*args, **kwargs):
            if request.method == 'OPTIONS':
                return view_func(*args, **kwargs)

            allowed = read_roles if request.method in ('GET', 'HEAD') else write_roles
            session, err = require_roles(dict(request.headers), allowed)
            if err:
                status = 401 if session is None and err == 'Oturum geçersiz' else 403
                return jsonify({'success': False, 'error': err}), status

            g.user = session
            return view_func(*args, **kwargs)
        return wrapped
    return decorator

def auth_get():
    """GET /api/auth — oturum kontrolü"""
    token   = get_token_from_headers(dict(request.headers))
    session = get_session(token)
    if not session:
        return jsonify({'success': False, 'error': 'Oturum geçersiz'}), 401
    return jsonify({
        'success': True,
        'session': session,
        'username': session.get('username'),
        'displayName': session.get('displayName'),
        'role': session.get('role'),
        'expiresAt': session.get('expiresAt'),
    })

def auth_post():
    """POST /api/auth — login / logout / change_password"""
    body   = request.get_json() or {}
    action = body.get('action', 'login')

    if action == 'login':
        return _handle_login(body)
    elif action == 'logout':
        return _handle_logout(body)
    elif action == 'change_password':
        return _handle_change_password(body)
    else:
        return jsonify({'success': False, 'error': 'Bilinmeyen action'}), 400

# ── LOGIN RATE LIMIT ─────────────────────────────────────────────────────────
# Basit bellek-içi sayaç: IP + kullanıcı adı başına başarısız deneme sayısı.
_LOGIN_ATTEMPTS = {}
LOGIN_MAX_ATTEMPTS = 5
LOGIN_WINDOW_SECONDS = 5 * 60

def _login_rate_key(username):
    ip = request.headers.get('X-Forwarded-For', request.remote_addr or '').split(',')[0].strip()
    return f'{ip}:{username}'

def _is_rate_limited(username):
    key = _login_rate_key(username)
    now = time.time()
    attempts = [t for t in _LOGIN_ATTEMPTS.get(key, []) if now - t < LOGIN_WINDOW_SECONDS]
    _LOGIN_ATTEMPTS[key] = attempts
    return len(attempts) >= LOGIN_MAX_ATTEMPTS

def _register_failed_attempt(username):
    key = _login_rate_key(username)
    _LOGIN_ATTEMPTS.setdefault(key, []).append(time.time())

def _clear_attempts(username):
    _LOGIN_ATTEMPTS.pop(_login_rate_key(username), None)


def _handle_login(body):
    username = str(body.get('username', '')).strip().lower()
    password = str(body.get('password', '')).strip()
    remember_me = bool(body.get('rememberMe'))

    if not username or not password:
        return jsonify({'success': False, 'error': 'Kullanıcı adı ve şifre gerekli'}), 400

    if _is_rate_limited(username):
        return jsonify({'success': False, 'error': 'Çok fazla başarısız deneme. Birkaç dakika sonra tekrar deneyin.'}), 429

    user = get_user(username)
    if not user or not check_password(password, user['passwordHash']):
        _register_failed_attempt(username)
        return jsonify({'success': False, 'error': 'Kullanıcı adı veya şifre hatalı'}), 401

    _clear_attempts(username)
    token = create_session(username, user['displayName'], user['role'], remember_me)
    from api.audit import log_action
    log_action(
        {'username': username, 'displayName': user['displayName'], 'role': user['role']},
        'login', f"{user['displayName']} giriş yaptı"
    )
    return jsonify({
        'success':     True,
        'token':       token,
        'username':    username,
        'displayName': user['displayName'],
        'role':        user['role'],
    })

def _handle_logout(body):
    token = body.get('token', '') or get_token_from_headers(dict(request.headers))
    if token:
        session = get_session(token)
        if session:
            from api.audit import log_action
            log_action(session, 'logout', f"{session.get('displayName')} çıkış yaptı")
        delete_session(token)
    return jsonify({'success': True})

def _handle_change_password(body):
    token   = get_token_from_headers(dict(request.headers))
    session = get_session(token)
    if not session:
        return jsonify({'success': False, 'error': 'Oturum geçersiz'}), 401

    old_password = str(body.get('oldPassword', '')).strip()
    new_password = str(body.get('newPassword', '')).strip()

    if not old_password or not new_password:
        return jsonify({'success': False, 'error': 'Eski ve yeni şifre gerekli'}), 400

    if len(new_password) < 4:
        return jsonify({'success': False, 'error': 'Şifre en az 4 karakter olmalı'}), 400

    user = get_user(session['username'])
    if not user or not check_password(old_password, user['passwordHash']):
        return jsonify({'success': False, 'error': 'Mevcut şifre hatalı'}), 401

    conn = get_conn()
    cur  = conn.cursor()
    cur.execute('UPDATE users SET password_hash = %s WHERE username = %s',
                (hash_password(new_password), session['username']))
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({'success': True})

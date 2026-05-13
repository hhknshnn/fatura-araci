# api/auth.py
# Kullanıcı girişi, oturum yönetimi — PostgreSQL tabanlı

import json
import hashlib
import bcrypt
import secrets
import time
import traceback
from api.db import get_conn

SESSION_TTL = 8 * 60 * 60  # 8 saat


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
def create_session(username, display_name, role):
    token = secrets.token_hex(32)
    now   = int(time.time())
    conn  = get_conn()
    cur   = conn.cursor()
    cur.execute('''
        INSERT INTO sessions (token, username, display_name, role, created_at, expires_at)
        VALUES (%s, %s, %s, %s, %s, %s)
    ''', (token, username, display_name, role, now, now + SESSION_TTL))
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

def require_admin(headers):
    session = get_session_from_headers(headers)
    if not session:
        return None, 'Oturum geçersiz'
    if session.get('role') != 'admin':
        return None, 'Admin yetkisi gerekli'
    return session, None


# ── FLASK ROUTE FONKSİYONLARI ─────────────────────────────────────────────────
from flask import request, jsonify

def auth_get():
    """GET /api/auth — oturum kontrolü"""
    token   = get_token_from_headers(dict(request.headers))
    session = get_session(token)
    if not session:
        return jsonify({'success': False, 'error': 'Oturum geçersiz'}), 401
    return jsonify({'success': True, 'session': session})

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

def _handle_login(body):
    username = str(body.get('username', '')).strip().lower()
    password = str(body.get('password', '')).strip()

    if not username or not password:
        return jsonify({'success': False, 'error': 'Kullanıcı adı ve şifre gerekli'}), 400

    user = get_user(username)
    if not user or not check_password(password, user['passwordHash']):
        return jsonify({'success': False, 'error': 'Kullanıcı adı veya şifre hatalı'}), 401

    token = create_session(username, user['displayName'], user['role'])
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

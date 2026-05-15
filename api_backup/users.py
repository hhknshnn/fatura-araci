# api/users.py
# Kullanıcı yönetimi — PostgreSQL tabanlı, admin only

import time
from flask import request, jsonify
from api.db import get_conn
from api.auth import hash_password, require_admin, get_session_from_headers


# ── KULLANICI İŞLEMLERİ ───────────────────────────────────────────────────────
def get_all_users():
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute('SELECT username, display_name, role, created_at FROM users ORDER BY created_at')
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [{'username': r[0], 'displayName': r[1], 'role': r[2], 'createdAt': r[3]} for r in rows]

def user_exists(username):
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute('SELECT 1 FROM users WHERE username = %s', (username.lower(),))
    exists = cur.fetchone() is not None
    cur.close()
    conn.close()
    return exists

def delete_user(username):
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute('DELETE FROM users WHERE username = %s', (username.lower(),))
    conn.commit()
    cur.close()
    conn.close()

def reset_password(username, new_password):
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute('UPDATE users SET password_hash = %s WHERE username = %s',
                (hash_password(new_password), username.lower()))
    updated = cur.rowcount > 0
    conn.commit()
    cur.close()
    conn.close()
    return updated

def update_role(username, new_role):
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute('UPDATE users SET role = %s WHERE username = %s',
                (new_role, username.lower()))
    updated = cur.rowcount > 0
    conn.commit()
    cur.close()
    conn.close()
    return updated


# ── FLASK ROUTE FONKSİYONLARI ─────────────────────────────────────────────────
def users_get():
    """GET /api/users — tüm kullanıcıları listele, admin only"""
    session, err = require_admin(dict(request.headers))
    if err:
        return jsonify({'success': False, 'error': err}), 401
    return jsonify({'success': True, 'users': get_all_users()})

def users_post():
    """POST /api/users — kullanıcı ekle/düzenle, admin only"""
    session, err = require_admin(dict(request.headers))
    if err:
        return jsonify({'success': False, 'error': err}), 401

    body   = request.get_json() or {}
    action = body.get('action', 'create')

    if action == 'create':
        return _handle_create(body)
    elif action == 'reset_password':
        return _handle_reset_password(body)
    elif action == 'update_role':
        return _handle_update_role(body)
    else:
        return jsonify({'success': False, 'error': 'Bilinmeyen action'}), 400

def users_delete():
    """DELETE /api/users — kullanıcı sil, admin only"""
    session, err = require_admin(dict(request.headers))
    if err:
        return jsonify({'success': False, 'error': err}), 401

    body     = request.get_json() or {}
    username = str(body.get('username', '')).strip().lower()

    if not username:
        return jsonify({'success': False, 'error': 'username gerekli'}), 400
    if username == session['username']:
        return jsonify({'success': False, 'error': 'Kendi hesabını silemezsin'}), 400
    if not user_exists(username):
        return jsonify({'success': False, 'error': 'Kullanıcı bulunamadı'}), 404

    delete_user(username)
    return jsonify({'success': True})


def _handle_create(body):
    username     = str(body.get('username', '')).strip().lower()
    password     = str(body.get('password', '')).strip()
    display_name = str(body.get('displayName', '')).strip()
    role         = str(body.get('role', 'user')).strip()

    if not username or not password or not display_name:
        return jsonify({'success': False, 'error': 'username, password, displayName gerekli'}), 400
    if len(password) < 4:
        return jsonify({'success': False, 'error': 'Şifre en az 4 karakter olmalı'}), 400
    if role not in ('admin', 'user'):
        role = 'user'
    if user_exists(username):
        return jsonify({'success': False, 'error': 'Bu kullanıcı adı zaten mevcut'}), 400

    from api.auth import create_user
    create_user(username, password, display_name, role)
    return jsonify({'success': True, 'user': {'username': username, 'displayName': display_name, 'role': role}})

def _handle_reset_password(body):
    username     = str(body.get('username', '')).strip().lower()
    new_password = str(body.get('newPassword', '')).strip()

    if not username or not new_password:
        return jsonify({'success': False, 'error': 'username ve newPassword gerekli'}), 400
    if len(new_password) < 4:
        return jsonify({'success': False, 'error': 'Şifre en az 4 karakter olmalı'}), 400
    if not reset_password(username, new_password):
        return jsonify({'success': False, 'error': 'Kullanıcı bulunamadı'}), 404

    return jsonify({'success': True})

def _handle_update_role(body):
    username = str(body.get('username', '')).strip().lower()
    new_role = str(body.get('role', 'user')).strip()

    if not username:
        return jsonify({'success': False, 'error': 'username gerekli'}), 400
    if new_role not in ('admin', 'user'):
        return jsonify({'success': False, 'error': 'Rol admin veya user olmalı'}), 400
    if not update_role(username, new_role):
        return jsonify({'success': False, 'error': 'Kullanıcı bulunamadı'}), 404

    return jsonify({'success': True})

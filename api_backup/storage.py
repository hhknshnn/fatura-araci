# api/storage.py
# Dosya kayıtları — local disk + PostgreSQL tabanlı

import os
import time
import json
import base64
from flask import request, jsonify
from api.db import get_conn

# ── DOSYA DEPOLAMA KLASÖRÜ ────────────────────────────────────────────────────
STORAGE_DIR = os.environ.get('STORAGE_DIR', '/var/fatura-storage')
TTL_SECONDS = 36 * 60 * 60  # 36 saat

def ensure_storage_dir():
    os.makedirs(STORAGE_DIR, exist_ok=True)


# ── KAYDET ────────────────────────────────────────────────────────────────────
def save_record(ulke, fatura_no, dosya_turu, excel_bytes=None, pdf_bytes=None,
                master_bytes=None, price_list_bytes=None, mill_test_bytes=None):
    ensure_storage_dir()
    timestamp = int(time.time())
    key_base  = f'{ulke}_{fatura_no}_{dosya_turu}_{timestamp}'
    file_paths = {}

    # Her dosyayı diske yaz
    dosyalar = {
        'excel':      (excel_bytes,      f'{key_base}_invpl.xlsx'),
        'pdf':        (pdf_bytes,        f'{key_base}_fatura.pdf'),
        'master':     (master_bytes,     f'{key_base}_master.xlsx'),
        'priceList':  (price_list_bytes, f'{key_base}_pricelist.pdf'),
        'millTest':   (mill_test_bytes,  f'{key_base}_milltest.pdf'),
    }

    for dosya_turu_key, (data, filename) in dosyalar.items():
        if data:
            filepath = os.path.join(STORAGE_DIR, filename)
            with open(filepath, 'wb') as f:
                f.write(data)
            file_paths[dosya_turu_key] = filepath

    # Metadata'yı PostgreSQL'e kaydet
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute('''
        INSERT INTO storage_records (key, ulke, fatura_no, dosya_turu, tarih, expires_at, file_paths)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
    ''', (key_base, ulke, fatura_no, dosya_turu, timestamp,
          timestamp + TTL_SECONDS, json.dumps(file_paths)))
    conn.commit()
    cur.close()
    conn.close()
    return key_base


# ── LİSTELE ───────────────────────────────────────────────────────────────────
def list_records():
    now  = int(time.time())
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute('''
        SELECT key, ulke, fatura_no, dosya_turu, tarih, expires_at, file_paths
        FROM storage_records
        WHERE expires_at > %s
        ORDER BY tarih DESC
    ''', (now,))
    rows = cur.fetchall()
    cur.close()
    conn.close()

    records = []
    for r in rows:
        records.append({
            'key':       r[0],
            'ulke':      r[1],
            'faturaNo':  r[2],
            'dosyaTuru': r[3],
            'tarih':     r[4],
            'expiresAt': r[5],
            'r2Keys':    r[6],
        })
    return records


# ── DOSYA GETİR ───────────────────────────────────────────────────────────────
def get_record_files(key_name):
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute('SELECT file_paths FROM storage_records WHERE key = %s', (key_name,))
    row = cur.fetchone()
    cur.close()
    conn.close()

    if not row:
        raise ValueError('Kayıt bulunamadı')

    file_paths = row[0]
    result = {'meta': {'key': key_name}, 'files': {}}
    for dosya_turu, filepath in file_paths.items():
        try:
            with open(filepath, 'rb') as f:
                result['files'][dosya_turu] = base64.b64encode(f.read()).decode('utf-8')
        except Exception:
            pass
    return result


# ── TEMİZLE ───────────────────────────────────────────────────────────────────
def cleanup_record(key_name):
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute('SELECT file_paths FROM storage_records WHERE key = %s', (key_name,))
    row = cur.fetchone()
    if row:
        for filepath in row[0].values():
            try:
                os.remove(filepath)
            except Exception:
                pass
        cur.execute('DELETE FROM storage_records WHERE key = %s', (key_name,))
        conn.commit()
    cur.close()
    conn.close()


# ── FLASK ROUTE FONKSİYONLARI ─────────────────────────────────────────────────
def storage_get():
    """GET /api/storage — kayıtları listele veya belirli kaydı getir"""
    key = request.args.get('key')
    if key:
        data = get_record_files(key)
        return jsonify({'success': True, **data})
    else:
        records = list_records()
        return jsonify({'success': True, 'records': records})

def storage_post():
    """POST /api/storage — yeni kayıt ekle"""
    body       = request.get_json() or {}
    ulke       = body.get('ulke', '')
    fatura_no  = body.get('faturaNo', '')
    dosya_turu = body.get('dosyaTuru', 'inv_pl')

    if not ulke or not fatura_no:
        return jsonify({'success': False, 'error': 'ulke ve faturaNo zorunlu'}), 400

    excel_bytes      = base64.b64decode(body['excel'])      if body.get('excel')      else None
    pdf_bytes        = base64.b64decode(body['pdf'])        if body.get('pdf')        else None
    master_bytes     = base64.b64decode(body['master'])     if body.get('master')     else None
    price_list_bytes = base64.b64decode(body['priceList'])  if body.get('priceList')  else None
    mill_test_bytes  = base64.b64decode(body['millTest'])   if body.get('millTest')   else None

    key = save_record(ulke, fatura_no, dosya_turu,
                      excel_bytes, pdf_bytes, master_bytes,
                      price_list_bytes, mill_test_bytes)
    return jsonify({'success': True, 'key': key})

def storage_delete():
    """DELETE /api/storage — kaydı ve dosyaları sil"""
    body = request.get_json() or {}
    key  = body.get('key', '')
    if not key:
        return jsonify({'success': False, 'error': 'key zorunlu'}), 400
    cleanup_record(key)
    return jsonify({'success': True})

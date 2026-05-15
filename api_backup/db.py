# api/db.py
# PostgreSQL bağlantısı ve tablo oluşturma işlemleri

import psycopg2
import psycopg2.extras
import os

# ── VERİTABANI BAĞLANTI BİLGİLERİ ───────────────────────────────────────────
DB_HOST = os.environ.get('DB_HOST', 'localhost')
DB_PORT = os.environ.get('DB_PORT', '5432')
DB_NAME = os.environ.get('DB_NAME', 'fatura_db')
DB_USER = os.environ.get('DB_USER', 'fatura_user')
DB_PASS = os.environ.get('DB_PASS', '')

def get_conn():
    """Yeni bir veritabanı bağlantısı döner."""
    return psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASS,
    )

def init_db():
    """Gerekli tabloları oluşturur, yoksa yaratır."""
    conn = get_conn()
    cur  = conn.cursor()

    # Kullanıcılar tablosu
    cur.execute('''
        CREATE TABLE IF NOT EXISTS users (
            username     TEXT PRIMARY KEY,
            display_name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            role         TEXT NOT NULL DEFAULT 'user',
            created_at   BIGINT NOT NULL
        )
    ''')

    # Oturumlar tablosu
    cur.execute('''
        CREATE TABLE IF NOT EXISTS sessions (
            token        TEXT PRIMARY KEY,
            username     TEXT NOT NULL,
            display_name TEXT NOT NULL,
            role         TEXT NOT NULL,
            created_at   BIGINT NOT NULL,
            expires_at   BIGINT NOT NULL
        )
    ''')

    # Dosya kayıtları tablosu
    cur.execute('''
        CREATE TABLE IF NOT EXISTS storage_records (
            key          TEXT PRIMARY KEY,
            ulke         TEXT NOT NULL,
            fatura_no    TEXT NOT NULL,
            dosya_turu   TEXT NOT NULL,
            tarih        BIGINT NOT NULL,
            expires_at   BIGINT NOT NULL,
            file_paths   JSONB NOT NULL DEFAULT '{}'
        )
    ''')

    conn.commit()
    cur.close()
    conn.close()
    print('Veritabanı tabloları hazır.')

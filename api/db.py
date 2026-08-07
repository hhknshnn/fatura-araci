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

    # Nebim v3 entegrasyon hazırlığı: shipment/fatura bazlı referans ve onay durumu.
    cur.execute('''
        CREATE TABLE IF NOT EXISTS nebim_delivery_refs (
            shipment_id       INTEGER PRIMARY KEY REFERENCES shipments(id) ON DELETE CASCADE,
            fatura_no         TEXT NOT NULL,
            fatura_ref_no     TEXT NOT NULL DEFAULT '',
            ready_for_nebim   BOOLEAN NOT NULL DEFAULT FALSE,
            nebim_status      TEXT NOT NULL DEFAULT 'pending',
            nebim_response    JSONB NOT NULL DEFAULT '{}',
            created_at        BIGINT NOT NULL,
            updated_at        BIGINT NOT NULL
        )
    ''')

    # İşlem kaydı (audit log): kim, ne zaman, ne yaptı — admin panelinde görüntülenir.
    cur.execute('''
        CREATE TABLE IF NOT EXISTS audit_log (
            id           SERIAL PRIMARY KEY,
            username     TEXT NOT NULL,
            display_name TEXT NOT NULL,
            role         TEXT NOT NULL,
            action       TEXT NOT NULL,
            description  TEXT NOT NULL,
            created_at   BIGINT NOT NULL
        )
    ''')
    cur.execute('CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log (created_at DESC)')

    # Ürün ara grubu -> standart birim kilo (kg). Menşe/GTİP akışlarında eksik
    # ağırlık girilirken kullanılıyor; tüm kullanıcılar için ortak tek kaynak
    # olsun diye burada tutuluyor (önceden her kullanıcının kendi localStorage'ında
    # ayrı ayrı tutuluyordu, bu da kullanıcılar arasında farklı kg değerlerine yol açıyordu).
    cur.execute('''
        CREATE TABLE IF NOT EXISTS group_weights (
            grup_adi     TEXT PRIMARY KEY,
            kilo         NUMERIC NOT NULL,
            updated_by   TEXT NOT NULL DEFAULT '',
            updated_at   BIGINT NOT NULL
        )
    ''')

    # NOT: `shipments` ve `taslak_dosyalar` tabloları burada CREATE EDİLMEZ —
    # mevcut prod veritabanında zaten var ve şeması (kolon sayısı/tipleri) bu
    # dosyanın dışında yönetiliyor. Sıfırdan bir ortam kurulacaksa bu iki tablo
    # ayrıca migrate edilmeli; aksi halde aşağıdaki ALTER TABLE satırları hata verir.

    # ── USD navlun/sigorta kolonları (v2026-07) ──────────────────────────
    cur.execute('ALTER TABLE shipments ADD COLUMN IF NOT EXISTS navlun_usd NUMERIC DEFAULT 0')
    cur.execute('ALTER TABLE shipments ADD COLUMN IF NOT EXISTS sigorta_usd NUMERIC DEFAULT 0')
    cur.execute('ALTER TABLE shipments ADD COLUMN IF NOT EXISTS usd_kuru NUMERIC DEFAULT 0')

    # fatura_no benzersizliği DB seviyesinde garanti edilmiyordu (aynı anda gelen
    # iki istek mükerrer kayıt oluşturabiliyordu). fatura_no boş/NULL olabilen
    # taslak kayıtları etkilenmesin diye kısmi (partial) unique index kullanılıyor.
    cur.execute('''
        CREATE UNIQUE INDEX IF NOT EXISTS shipments_fatura_no_unique_idx
        ON shipments (fatura_no)
        WHERE fatura_no IS NOT NULL AND fatura_no != ''
    ''')

    conn.commit()
    cur.close()
    conn.close()
    print('Veritabanı tabloları hazır.')

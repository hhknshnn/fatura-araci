-- ═══════════════════════════════════════════════════════════════════════════
-- Maliyet Takip modülü — migration 001: temel şema + başlangıç kalem seti
--
-- Çalıştırma:
--   sudo -u postgres psql -d fatura_db -f /root/fatura-araci/migrations/maliyet_takip_001.sql
--
-- Tekrar çalıştırılabilir (idempotent): CREATE IF NOT EXISTS + ON CONFLICT DO NOTHING.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Kalem tanımları ──────────────────────────────────────────────────────────
-- tip:
--   'hareket' : dönem içi miktar × birim fiyat
--   'storage' : palet/box bakiyesi × birim fiyat
--               (palet_gun | palet_hafta | palet_ay | box_gun)
--   'sabit'   : aylık sabit ücret (miktar girilmez)
--   'minimum' : Minimum Monthly Fee — ay toplamı bunun altındaysa bu uygulanır
CREATE TABLE IF NOT EXISTS maliyet_kalemleri (
    id                 SERIAL PRIMARY KEY,
    kod                TEXT UNIQUE NOT NULL,
    ad                 TEXT NOT NULL,
    birim_secenekleri  TEXT[] NOT NULL,
    tip                TEXT NOT NULL DEFAULT 'hareket'
                       CHECK (tip IN ('hareket', 'storage', 'sabit', 'minimum')),
    aktif              BOOLEAN NOT NULL DEFAULT TRUE,
    sira               INT NOT NULL DEFAULT 0
);

-- ── Versiyonlu tarifeler ─────────────────────────────────────────────────────
-- Fiyat değişince eski satır silinmez; yeni gecerli_baslangic ile yeni satır açılır.
-- Hesap motoru, hareket tarihine göre en güncel (<= tarih) versiyonu kullanır.
CREATE TABLE IF NOT EXISTS maliyet_tarifeleri (
    id                 SERIAL PRIMARY KEY,
    ulke               TEXT NOT NULL,
    kalem_id           INT NOT NULL REFERENCES maliyet_kalemleri(id),
    birim              TEXT NOT NULL,
    birim_fiyat        NUMERIC(12,4) NOT NULL CHECK (birim_fiyat >= 0),
    para_birimi        TEXT NOT NULL CHECK (para_birimi IN ('EUR', 'USD', 'TRY')),
    gecerli_baslangic  DATE NOT NULL,
    notlar             TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (ulke, kalem_id, gecerli_baslangic)
);
CREATE INDEX IF NOT EXISTS ix_maliyet_tarife_ulke ON maliyet_tarifeleri (ulke, kalem_id);

-- ── Günlük hareketler ────────────────────────────────────────────────────────
-- (tarih, ülke, kalem) benzersiz: hızlı toplu giriş ekranı upsert yapar.
CREATE TABLE IF NOT EXISTS maliyet_hareketleri (
    id          SERIAL PRIMARY KEY,
    tarih       DATE NOT NULL,
    ulke        TEXT NOT NULL,
    kalem_id    INT NOT NULL REFERENCES maliyet_kalemleri(id),
    miktar      NUMERIC(12,2) NOT NULL,
    notlar      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tarih, ulke, kalem_id)
);
CREATE INDEX IF NOT EXISTS ix_maliyet_hareket_ulke_tarih ON maliyet_hareketleri (ulke, tarih);

-- ── Depo ayarları (ülke başına) ──────────────────────────────────────────────
-- Storage periyodu (hafta/ay) ayrıca tutulmaz; storage tarife satırının
-- birimi (palet_gun / palet_hafta / palet_ay / box_gun) tek kaynak olarak kullanılır.
CREATE TABLE IF NOT EXISTS maliyet_depo_ayarlari (
    ulke            TEXT PRIMARY KEY,
    acilis_tarihi   DATE,
    acilis_bakiye   NUMERIC(12,2) NOT NULL DEFAULT 0,
    bakiye_yontemi  TEXT NOT NULL DEFAULT 'donem_sonu'
                    CHECK (bakiye_yontemi IN ('donem_sonu', 'donem_basi', 'gun_ortalama', 'maksimum'))
);

-- ── Gelen gerçek depo faturaları ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS maliyet_faturalari (
    id               SERIAL PRIMARY KEY,
    ulke             TEXT NOT NULL,
    fatura_no        TEXT NOT NULL,
    donem_baslangic  DATE NOT NULL,
    donem_bitis      DATE NOT NULL,
    tutar            NUMERIC(14,2) NOT NULL,
    para_birimi      TEXT NOT NULL CHECK (para_birimi IN ('EUR', 'USD', 'TRY')),
    fatura_tarihi    DATE,
    notlar           TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_maliyet_fatura_ulke ON maliyet_faturalari (ulke, donem_baslangic);

-- ── Başlangıç kalem seti ─────────────────────────────────────────────────────
INSERT INTO maliyet_kalemleri (kod, ad, birim_secenekleri, tip, sira) VALUES
    ('pallet_in',        'Pallet In',                          '{palet}',                'hareket',  10),
    ('pallet_out',       'Pallet Out',                         '{palet}',                'hareket',  20),
    ('box_in',           'Box In',                             '{koli}',                 'hareket',  30),
    ('box_out',          'Box Out',                            '{koli}',                 'hareket',  40),
    ('handling',         'Handling',                           '{palet,koli}',           'hareket',  50),
    ('store_transfer',   'Store Transfer per Pallet',          '{palet}',                'hareket',  60),
    ('storage',          'Storage',                            '{palet_gun,palet_hafta,palet_ay,box_gun}', 'storage',  70),
    ('order_processing', 'Order Processing Fee',               '{siparis}',              'hareket',  80),
    ('picking_line',     'Picking per Line',                   '{satir}',                'hareket',  90),
    ('labeling',         'Labeling / Relabeling',              '{adet}',                 'hareket', 100),
    ('repalletizing',    'Repalletizing / Shrink Wrap',        '{palet}',                'hareket', 110),
    ('pallet_exchange',  'Pallet Exchange (EUR palet)',        '{palet}',                'hareket', 120),
    ('devanning',        'Container Unloading (Devanning)',    '{konteyner}',            'hareket', 130),
    ('returns_handling', 'Returns Handling',                   '{palet,koli}',           'hareket', 140),
    ('waste_disposal',   'Waste Disposal',                     '{islem}',                'hareket', 150),
    ('admin_fee',        'Administration / Documentation Fee', '{ay}',                   'sabit',   160),
    ('min_monthly_fee',  'Minimum Monthly Fee',                '{ay}',                   'minimum', 170)
ON CONFLICT (kod) DO NOTHING;

-- ── Uygulama kullanıcısına yetkiler ──────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON
    maliyet_kalemleri, maliyet_tarifeleri, maliyet_hareketleri,
    maliyet_depo_ayarlari, maliyet_faturalari
TO fatura_user;
GRANT USAGE, SELECT ON
    maliyet_kalemleri_id_seq, maliyet_tarifeleri_id_seq,
    maliyet_hareketleri_id_seq, maliyet_faturalari_id_seq
TO fatura_user;

COMMIT;

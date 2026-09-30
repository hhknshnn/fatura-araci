-- ═══════════════════════════════════════════════════════════════════════════
-- Kazakistan sigorta bildirim formu — migration 001
--
-- KZ INV+PL üretiminde her faturanın sigorta formu bilgisi (kap, brüt, fatura TL,
-- ürün grupları) saklanır; gruplu sevkte (ANT + İHR) partner fatura buradan okunup
-- tek forma birleştirilir. Bkz. api/kz_sigorta.py.
--
-- Çalıştırma:
--   sudo -u postgres psql -d fatura_db < migrations/kz_sigorta_001.sql
-- İdempotent: CREATE IF NOT EXISTS. init_db() de aynı tabloyu oluşturur.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS kz_sigorta_bilgi (
    fatura_no       TEXT PRIMARY KEY,
    dosya_no        TEXT,
    depo_tipi       TEXT NOT NULL DEFAULT 'serbest',
    kap             INTEGER NOT NULL DEFAULT 0,
    brut_kg         NUMERIC(14,2) NOT NULL DEFAULT 0,
    fatura_tl       NUMERIC(16,2) NOT NULL DEFAULT 0,
    urun_gruplari   TEXT NOT NULL DEFAULT '',
    plaka           TEXT,
    yukleme_tarihi  DATE,
    guncelleme      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_kz_sigorta_bilgi_dosya ON kz_sigorta_bilgi (dosya_no);

GRANT SELECT, INSERT, UPDATE, DELETE ON kz_sigorta_bilgi TO fatura_user;

COMMIT;

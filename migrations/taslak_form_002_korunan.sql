-- ═══════════════════════════════════════════════════════════════════════════
-- Taslak form kalıcılığı — migration 002: korunan bayrağı
--
-- "Tut" ile korunan işaretlenen taslaklar 5 günlük otomatik silmeden muaf
-- tutulur (yalnız manuel silme). Mevcut kayıtlar default false ile etkilenmez.
--
-- Çalıştırma:
--   sudo -u postgres psql -d fatura_db -f /root/fatura-araci/migrations/taslak_form_002_korunan.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE taslak_form_kayitlari
    ADD COLUMN IF NOT EXISTS korunan BOOLEAN NOT NULL DEFAULT false;

COMMIT;

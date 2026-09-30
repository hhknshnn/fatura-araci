-- ═══════════════════════════════════════════════════════════════════════════
-- Navlun modülü — migration 004: gruplu ANT taslakları (eşleşme bekleyen)
--
-- Gruplu sevkte ANT taslağı partner sorulmadan "gruplu" işaretlenip indirilir;
-- nihai navlun/sigortası burada saklanır. İHR taslağında "Gruplu Sevkiyat"
-- açılınca aynı ülkenin eşleşmemiş (eslesen_dosya_no IS NULL) kayıtları
-- listelenir, biri seçilip İHR indirilince eşleşme yazılır ve mevcut
-- navlun_bekleyen_tahsis (kaynak=ANT, dosya=İHR) üzerinden sefer_id gruplanır.
--
-- Çalıştırma:
--   sudo -u postgres psql -d fatura_db < migrations/navlun_tanim_004.sql
-- İdempotent: CREATE IF NOT EXISTS.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS navlun_gruplu_ant (
    dosya_no          TEXT PRIMARY KEY,          -- ANT tam dosya no (örn 2026-470)
    ulke_kodu         TEXT NOT NULL,
    navlun            NUMERIC(12,2) NOT NULL DEFAULT 0,  -- ANT taslağının nihai navlunu
    sigorta           NUMERIC(12,2) NOT NULL DEFAULT 0,
    kap               TEXT NOT NULL DEFAULT '',
    eslesen_dosya_no  TEXT,                      -- eşleşen İHR dosya no (NULL = bekliyor)
    eslesme_tarihi    TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_navlun_gruplu_ant_bekleyen
    ON navlun_gruplu_ant (ulke_kodu) WHERE eslesen_dosya_no IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON navlun_gruplu_ant TO fatura_user;

COMMIT;

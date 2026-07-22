-- ═══════════════════════════════════════════════════════════════════════════
-- Navlun modülü — migration 003: navlun tanımı değişim arşivi
--
-- ulke_navlun bir ülkenin GÜNCEL navlun değerlerini tutar. Değer revize edilip
-- kaydedilince eski değerler bu tabloya arşivlenir; böylece geçmiş korunur ve
-- Navlun Tanımları ekranında değişim grafiği çizilebilir.
--
-- Çalıştırma:
--   sudo -u postgres psql -d fatura_db < migrations/navlun_tanim_003.sql
-- İdempotent: CREATE IF NOT EXISTS.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS ulke_navlun_gecmis (
    id                 SERIAL PRIMARY KEY,
    ulke_kodu          TEXT NOT NULL,
    para_birimi        TEXT NOT NULL,
    navlun_ihr         NUMERIC(12,2) NOT NULL DEFAULT 0,
    navlun_ant_ihr     NUMERIC(12,2) NOT NULL DEFAULT 0,
    navlun_ant         NUMERIC(12,2) NOT NULL DEFAULT 0,
    sigorta_baz        NUMERIC(12,2) NOT NULL DEFAULT 10,
    gecerli_baslangic  DATE,                              -- bu (eski) versiyonun geçerli olduğu tarih
    arsivlendi_at      TIMESTAMPTZ NOT NULL DEFAULT now() -- arşive alındığı an
);
CREATE INDEX IF NOT EXISTS ix_ulke_navlun_gecmis_ulke
    ON ulke_navlun_gecmis (ulke_kodu, gecerli_baslangic);

GRANT SELECT, INSERT, UPDATE, DELETE ON ulke_navlun_gecmis TO fatura_user;
GRANT USAGE, SELECT ON ulke_navlun_gecmis_id_seq TO fatura_user;

COMMIT;

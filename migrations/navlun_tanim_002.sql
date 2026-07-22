-- ═══════════════════════════════════════════════════════════════════════════
-- Navlun modülü — migration 002: taslak → Sevkiyatlar besleme köprüsü
--
-- Taslak ekranında hesaplanan navlun/sigorta, ilgili shipment kaydı henüz
-- oluşmadan üretilebilir (taslak akışı INV+PL'den önce gelir). Bu tablo
-- hesaplanan değeri dosya no bazında saklar; shipment oluşunca create_shipment
-- hook'u buradan okuyup doğru para birimi kolonuna yazar (uygulandi=TRUE).
--
-- Çalıştırma:
--   sudo -u postgres psql -d fatura_db < migrations/navlun_tanim_002.sql
-- İdempotent: CREATE IF NOT EXISTS.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS navlun_sevkiyat_hesap (
    dosya_no     TEXT PRIMARY KEY,          -- ihracat dosya no (örn 2026-100)
    ulke_kodu    TEXT NOT NULL,
    navlun       NUMERIC(12,2) NOT NULL DEFAULT 0,
    sigorta      NUMERIC(12,2) NOT NULL DEFAULT 0,
    para_birimi  TEXT NOT NULL DEFAULT 'EUR'
                 CHECK (para_birimi IN ('EUR', 'USD', 'TRY')),
    uygulandi    BOOLEAN NOT NULL DEFAULT FALSE,  -- shipment'a yazıldı mı
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Uygulama kullanıcısına yetki
GRANT SELECT, INSERT, UPDATE, DELETE ON navlun_sevkiyat_hesap TO fatura_user;

COMMIT;

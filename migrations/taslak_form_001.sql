-- ═══════════════════════════════════════════════════════════════════════════
-- Taslak form kalıcılığı — migration 001: temel tablo
--
-- "Fatura Üret" ekranında doldurulan ama henüz indirilmemiş taslak FORM
-- state'ini saklar (üretilmiş Excel'i saklayan taslak_dosyalar/taslak-store
-- ile karıştırılmasın — bu tablo eksik/tamamlanmamış girdileri tutar).
--
-- Çalıştırma:
--   sudo -u postgres psql -d fatura_db -f /root/fatura-araci/migrations/taslak_form_001.sql
--
-- Tekrar çalıştırılabilir (idempotent): CREATE IF NOT EXISTS.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS taslak_form_kayitlari (
    id                SERIAL PRIMARY KEY,
    kullanici         TEXT NOT NULL,
    ulke_kodu         TEXT NOT NULL,
    ulke_adi          TEXT NOT NULL DEFAULT '',
    depo_tipi         TEXT,
    referans_no       TEXT NOT NULL DEFAULT '',
    durum             TEXT NOT NULL DEFAULT 'eksik' CHECK (durum IN ('eksik', 'hazir')),
    form_data         JSONB NOT NULL DEFAULT '{}',
    olusturma_tarihi  TIMESTAMPTZ NOT NULL DEFAULT now(),
    guncelleme_tarihi TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_taslak_form_kullanici
    ON taslak_form_kayitlari (kullanici, guncelleme_tarihi DESC);

-- ── Uygulama kullanıcısına yetkiler ──────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON taslak_form_kayitlari TO fatura_user;
GRANT USAGE, SELECT ON taslak_form_kayitlari_id_seq TO fatura_user;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- Navlun/Sigorta otomatik hesaplama modülü — migration 001
--
-- İki tablo:
--   ulke_navlun            : kurumsal ülke başına 3 navlun değeri + sigorta bazı
--   navlun_bekleyen_tahsis : gruplu sevkiyatta partner dosyaya devreden kalan
--
-- Çalıştırma (postgres kullanıcısı /root'a erişemez, -f yerine < ile besle):
--   sudo -u postgres psql -d fatura_db < migrations/navlun_tanim_001.sql
--
-- Tekrar çalıştırılabilir (idempotent): CREATE IF NOT EXISTS + ON CONFLICT.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Ülke navlun tanımları ────────────────────────────────────────────────────
-- Her kurumsal ülke için 3 navlun senaryosu tutulur:
--   navlun_ihr      : sadece İhracat (komple İHR) sevki
--   navlun_ant_ihr  : aynı sevkte ANT + İHR (gruplu) — baz alınan değer
--   navlun_ant      : komple Antrepo/Transit (komple ANT) sevki
-- sigorta_baz para birimi cinsinden sabit sigorta tabanıdır (varsayılan 10).
CREATE TABLE IF NOT EXISTS ulke_navlun (
    ulke_kodu          TEXT PRIMARY KEY,
    para_birimi        TEXT NOT NULL DEFAULT 'EUR'
                       CHECK (para_birimi IN ('EUR', 'USD', 'TRY')),
    navlun_ihr         NUMERIC(12,2) NOT NULL DEFAULT 0,
    navlun_ant_ihr     NUMERIC(12,2) NOT NULL DEFAULT 0,
    navlun_ant         NUMERIC(12,2) NOT NULL DEFAULT 0,
    sigorta_baz        NUMERIC(12,2) NOT NULL DEFAULT 10,
    guncelleme_tarihi  DATE NOT NULL DEFAULT CURRENT_DATE
);

-- ── Gruplu sevkiyat bekleyen tahsis ──────────────────────────────────────────
-- Gruplu bir sevkin ilk taslağı kaydedilince, toplam maliyetten ilk taslağın
-- nihai (override edilmiş) değeri düşülür ve kalan burada partner dosya no'ya
-- saklanır. Partner taslağı açılınca alanlar bu satırdan otomatik doldurulur;
-- formülle yeniden hesaplanmaz. Anahtar: partner dosya no + yıl.
CREATE TABLE IF NOT EXISTS navlun_bekleyen_tahsis (
    id               SERIAL PRIMARY KEY,
    dosya_no         TEXT NOT NULL,            -- partner tam dosya no (örn 2026-101)
    yil              TEXT NOT NULL,            -- dosya no'nun yıl parçası (örn 2026)
    navlun           NUMERIC(12,2) NOT NULL DEFAULT 0,
    sigorta          NUMERIC(12,2) NOT NULL DEFAULT 0,
    para_birimi      TEXT NOT NULL DEFAULT 'EUR'
                     CHECK (para_birimi IN ('EUR', 'USD', 'TRY')),
    kaynak_dosya_no  TEXT NOT NULL,            -- kalanı üreten ilk taslağın dosya no'su
    kullanildi       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (dosya_no, yil)
);
CREATE INDEX IF NOT EXISTS ix_navlun_bekleyen_dosya
    ON navlun_bekleyen_tahsis (dosya_no, kullanildi);

-- ── Seed: navlun tanımları (01.04.2026) ──────────────────────────────────────
-- Sütun eşleşmesi:
--   Komple İhracat   → navlun_ihr
--   İhracat + Transit→ navlun_ant_ihr
--   Komple Transit   → navlun_ant
-- ulke_kodu değerleri config/countries.json ile birebir aynıdır.
INSERT INTO ulke_navlun
    (ulke_kodu, para_birimi, navlun_ihr, navlun_ant_ihr, navlun_ant, sigorta_baz, guncelleme_tarihi)
VALUES
    ('mk', 'EUR', 2250, 2700, 3000, 10, DATE '2026-04-01'),  -- Makedonya
    ('xk', 'EUR', 2450, 2900, 3200, 10, DATE '2026-04-01'),  -- Kosova
    ('rs', 'EUR', 2200, 2800, 3100, 10, DATE '2026-04-01'),  -- Sırbistan
    ('ba', 'EUR', 2900, 3200, 3400, 10, DATE '2026-04-01'),  -- Bosna
    ('kz', 'USD', 8300, 8500, 8500, 10, DATE '2026-04-01'),  -- Kazakistan
    ('ge', 'USD', 2650, 2850, 2850, 10, DATE '2026-04-01'),  -- Gürcistan
    ('be', 'EUR', 4400, 4600, 4600, 10, DATE '2026-04-01'),  -- Belçika
    ('nl', 'EUR', 4400, 4600, 4600, 10, DATE '2026-04-01')   -- Hollanda
ON CONFLICT (ulke_kodu) DO NOTHING;

-- ── Uygulama kullanıcısına yetkiler ──────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON
    ulke_navlun, navlun_bekleyen_tahsis
TO fatura_user;
GRANT USAGE, SELECT ON
    navlun_bekleyen_tahsis_id_seq
TO fatura_user;

COMMIT;

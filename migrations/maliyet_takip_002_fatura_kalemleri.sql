-- Maliyet faturalarını gerçek maliyet kalemlerine dağıtmak için detay tablosu.
-- Mevcut başlık kayıtları korunur; eski faturalar "dağıtılmamış" olarak görünür.

BEGIN;

-- Depo faturalarında sık görülen ve temel sette bulunmayan gerçek maliyetler.
INSERT INTO maliyet_kalemleri (kod, ad, birim_secenekleri, tip, sira) VALUES
    ('transport',      'Transport / Delivery', '{palet,islem}', 'hareket', 180),
    ('fuel_surcharge', 'Fuel Surcharge',       '{islem}',       'hareket', 190)
ON CONFLICT (kod) DO NOTHING;

CREATE TABLE IF NOT EXISTS maliyet_fatura_kalemleri (
    id            SERIAL PRIMARY KEY,
    fatura_id     INT NOT NULL REFERENCES maliyet_faturalari(id) ON DELETE CASCADE,
    kalem_id      INT NOT NULL REFERENCES maliyet_kalemleri(id),
    tarih         DATE,
    aciklama      TEXT NOT NULL,
    referans      TEXT,
    miktar        NUMERIC(14,4) NOT NULL DEFAULT 1 CHECK (miktar >= 0),
    birim_fiyat   NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (birim_fiyat >= 0),
    tutar         NUMERIC(14,2) NOT NULL CHECK (tutar >= 0),
    sira          INT NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_maliyet_fatura_kalem_fatura
    ON maliyet_fatura_kalemleri (fatura_id, sira, id);
CREATE INDEX IF NOT EXISTS ix_maliyet_fatura_kalem_kalem
    ON maliyet_fatura_kalemleri (kalem_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON maliyet_fatura_kalemleri TO fatura_user;
GRANT USAGE, SELECT ON maliyet_fatura_kalemleri_id_seq TO fatura_user;

COMMIT;

-- Bosna fatura dökümü: gümrük/vergi ve gecikme faizi kalemi.
BEGIN;

INSERT INTO maliyet_kalemleri (kod, ad, birim_secenekleri, tip, sira) VALUES
    ('taxes', 'Taxes / Customs', '{islem}', 'hareket', 200)
ON CONFLICT (kod) DO NOTHING;

COMMIT;

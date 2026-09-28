-- Bosna Excel Neto (BAM) tutarını fatura kaleminde saklar. Mevcut satırlar NULL kalır.
BEGIN;

ALTER TABLE maliyet_fatura_kalemleri
    ADD COLUMN IF NOT EXISTS tutar_bam NUMERIC(14,2);

COMMIT;

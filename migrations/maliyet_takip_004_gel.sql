-- Gürcistan GW faturaları GEL (Lari) cinsinden.
ALTER TABLE maliyet_faturalari DROP CONSTRAINT IF EXISTS maliyet_faturalari_para_birimi_check;
ALTER TABLE maliyet_faturalari
  ADD CONSTRAINT maliyet_faturalari_para_birimi_check
  CHECK (para_birimi = ANY (ARRAY['EUR'::text, 'USD'::text, 'TRY'::text, 'GEL'::text]));

ALTER TABLE maliyet_tarifeleri DROP CONSTRAINT IF EXISTS maliyet_tarifeleri_para_birimi_check;
ALTER TABLE maliyet_tarifeleri
  ADD CONSTRAINT maliyet_tarifeleri_para_birimi_check
  CHECK (para_birimi = ANY (ARRAY['EUR'::text, 'USD'::text, 'TRY'::text, 'GEL'::text]));

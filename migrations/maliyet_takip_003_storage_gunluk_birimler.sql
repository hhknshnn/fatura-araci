-- Storage tarifelerine günlük palet ve günlük box birimlerini ekler.
UPDATE maliyet_kalemleri
SET birim_secenekleri = ARRAY['palet_gun', 'palet_hafta', 'palet_ay', 'box_gun']
WHERE kod = 'storage';

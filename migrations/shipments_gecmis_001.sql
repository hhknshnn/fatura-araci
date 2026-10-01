-- shipments tablosundaki her UPDATE/DELETE öncesi eski satır 30 gün saklanır.
-- Geri almak için: SELECT eski_veri FROM shipments_gecmis WHERE shipment_id = <id> ORDER BY id DESC;
CREATE TABLE IF NOT EXISTS shipments_gecmis (
    id           BIGSERIAL PRIMARY KEY,
    shipment_id  INTEGER NOT NULL,
    islem        TEXT NOT NULL,
    eski_veri    JSONB NOT NULL,
    tarih        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_shipments_gecmis_sid ON shipments_gecmis (shipment_id, id DESC);
CREATE INDEX IF NOT EXISTS ix_shipments_gecmis_tarih ON shipments_gecmis (tarih);

CREATE OR REPLACE FUNCTION shipments_gecmis_kaydet() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD IS NOT DISTINCT FROM NEW THEN
        RETURN NEW;
    END IF;
    INSERT INTO shipments_gecmis (shipment_id, islem, eski_veri)
    VALUES (OLD.id, TG_OP, to_jsonb(OLD));
    -- Ara sıra 30 günü geçenleri temizle
    IF random() < 0.01 THEN
        DELETE FROM shipments_gecmis WHERE tarih < now() - interval '30 days';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_shipments_gecmis ON shipments;
CREATE TRIGGER trg_shipments_gecmis
    AFTER UPDATE OR DELETE ON shipments
    FOR EACH ROW EXECUTE FUNCTION shipments_gecmis_kaydet();

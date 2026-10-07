-- API грузовых операций. Источник координат AIS настраивается отдельно.
ALTER TABLE ferries ADD COLUMN IF NOT EXISTS api_provider text;
UPDATE ferries SET api_provider='FESCO', updated_at=now()
WHERE mmsi IN ('273329660','273343170') AND api_provider IS NULL;
-- FESCO NAVARIN отсутствовал в справочнике; существующие записи не заменяем.
INSERT INTO ferries (name,mmsi,imo,vessel_type,operator,api_provider)
VALUES ('FESCO NAVARIN','273343170','9296999','Container Ship','FESCO','FESCO')
ON CONFLICT (mmsi) DO NOTHING;

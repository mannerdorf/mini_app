-- Денormalized keys for pickup jobs (full payload remains in data jsonb).
BEGIN;

ALTER TABLE pickup_jobs
  ADD COLUMN IF NOT EXISTS zayavka_number text,
  ADD COLUMN IF NOT EXISTS cargo_number text,
  ADD COLUMN IF NOT EXISTS customer_inn text,
  ADD COLUMN IF NOT EXISTS sender_inn text;

UPDATE pickup_jobs
SET
  zayavka_number = NULLIF(btrim(data->>'zayavkaNumber'), ''),
  cargo_number = NULLIF(btrim(data->>'cargoNumber'), ''),
  customer_inn = NULLIF(btrim(data->>'customerInn'), ''),
  sender_inn = NULLIF(btrim(data->>'senderInn'), '')
WHERE zayavka_number IS NULL
  AND cargo_number IS NULL
  AND customer_inn IS NULL
  AND sender_inn IS NULL;

CREATE INDEX IF NOT EXISTS pickup_jobs_zayavka_number_idx
  ON pickup_jobs (zayavka_number)
  WHERE zayavka_number IS NOT NULL AND btrim(zayavka_number) <> '';

CREATE INDEX IF NOT EXISTS pickup_jobs_cargo_number_idx
  ON pickup_jobs (cargo_number)
  WHERE cargo_number IS NOT NULL AND btrim(cargo_number) <> '';

CREATE INDEX IF NOT EXISTS pickup_jobs_customer_inn_idx
  ON pickup_jobs (customer_inn)
  WHERE customer_inn IS NOT NULL AND btrim(customer_inn) <> '';

CREATE INDEX IF NOT EXISTS pickup_jobs_sender_inn_idx
  ON pickup_jobs (sender_inn)
  WHERE sender_inn IS NOT NULL AND btrim(sender_inn) <> '';

COMMIT;

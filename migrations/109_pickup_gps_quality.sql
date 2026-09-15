BEGIN;
ALTER TABLE pickup_driver_locations ADD COLUMN IF NOT EXISTS last_observed_at timestamptz;
ALTER TABLE pickup_driver_locations ADD COLUMN IF NOT EXISTS warning text NOT NULL DEFAULT '';
UPDATE pickup_driver_locations SET last_observed_at=measured_at WHERE last_observed_at IS NULL;
COMMIT;

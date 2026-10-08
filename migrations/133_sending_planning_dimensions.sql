BEGIN;
ALTER TABLE sending_plans ADD COLUMN IF NOT EXISTS vehicle_dimensions jsonb;
COMMENT ON COLUMN sending_plans.vehicle_dimensions IS 'Custom internal dimensions in metres, one set per compartment; null uses the TMS preset.';
COMMIT;

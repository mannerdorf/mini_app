BEGIN;
ALTER TABLE sending_plans ADD COLUMN IF NOT EXISTS departure_date text NOT NULL DEFAULT '' CHECK (departure_date='' OR departure_date ~ '^\d{4}-\d{2}-\d{2}$');
COMMENT ON COLUMN sending_plans.departure_date IS 'Ferry departure date; independent of the warehouse planning date.';
COMMIT;

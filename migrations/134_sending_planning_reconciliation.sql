BEGIN;
ALTER TABLE sending_plans ADD COLUMN IF NOT EXISTS reconciliation_checked_at timestamptz;
ALTER TABLE sending_plans ADD COLUMN IF NOT EXISTS fact_candidates jsonb NOT NULL DEFAULT '[]';
CREATE TABLE IF NOT EXISTS sending_plan_reconciliations (
 plan_id uuid PRIMARY KEY REFERENCES sending_plans(id) ON DELETE CASCADE,
 original_cargo jsonb NOT NULL,
 actual_cargo_numbers jsonb NOT NULL,
 released_cargo_numbers jsonb NOT NULL,
 other_actual_cargo_numbers jsonb NOT NULL DEFAULT '[]',
 sending jsonb NOT NULL,
 checked_at timestamptz NOT NULL DEFAULT now(),
 checked_by text NOT NULL
);
COMMENT ON TABLE sending_plan_reconciliations IS 'Frozen plan/fact comparison. Unshipped cargo reservations are released; the original plan remains in this audit.';
COMMIT;

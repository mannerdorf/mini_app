BEGIN;
CREATE TABLE IF NOT EXISTS plan_date_queue (
  cargo_number text PRIMARY KEY,
  target_date text NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','sending','verifying','done','uncertain','error')),
  requested_by text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  checks integer NOT NULL DEFAULT 0,
  next_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_error text
);
CREATE INDEX IF NOT EXISTS plan_date_queue_due ON plan_date_queue(next_at) WHERE state IN ('pending','verifying','sending');
COMMIT;

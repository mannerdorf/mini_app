BEGIN;
CREATE TABLE IF NOT EXISTS cargo_notification_queue (
  id bigserial PRIMARY KEY,
  dedupe_key text NOT NULL UNIQUE,
  cargo_number text NOT NULL,
  payload jsonb NOT NULL,
  source text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  next_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  last_error text
);
CREATE INDEX IF NOT EXISTS cargo_notification_queue_pending ON cargo_notification_queue(next_at,id) WHERE completed_at IS NULL;
CREATE INDEX IF NOT EXISTS cargo_notification_queue_cargo ON cargo_notification_queue(cargo_number,id) WHERE completed_at IS NULL;
COMMIT;

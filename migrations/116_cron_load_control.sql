CREATE TABLE IF NOT EXISTS cron_work_state (
  name text PRIMARY KEY, cursor jsonb NOT NULL DEFAULT '{}',
  next_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz,
  token text, failures integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS one_c_request_gate (
  id integer PRIMARY KEY CHECK(id=1), token text,
  lease_until timestamptz, next_at timestamptz NOT NULL DEFAULT now(),
  failures integer NOT NULL DEFAULT 0, background_pause_until timestamptz
);
INSERT INTO one_c_request_gate(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS one_c_request_waiters (
  token text PRIMARY KEY, priority integer NOT NULL,
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS one_c_request_waiters_order ON one_c_request_waiters(priority,created_at);

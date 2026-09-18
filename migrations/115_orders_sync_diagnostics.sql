-- Last orders refresh attempt; operational metadata only, no credentials or order payloads.
CREATE TABLE IF NOT EXISTS orders_sync_diagnostics (
  id integer PRIMARY KEY CHECK (id = 1),
  request_id text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  detail jsonb NOT NULL DEFAULT '{}'
);

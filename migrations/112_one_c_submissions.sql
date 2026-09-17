CREATE TABLE IF NOT EXISTS one_c_order_submissions (
  operation_key text PRIMARY KEY,
  request_hash text NOT NULL,
  state text NOT NULL CHECK (state IN ('sending','uncertain','succeeded')),
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

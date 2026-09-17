CREATE TABLE IF NOT EXISTS request_rate_limits (
  bucket_key text PRIMARY KEY,
  hits integer NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS request_rate_limits_expiry ON request_rate_limits(expires_at);

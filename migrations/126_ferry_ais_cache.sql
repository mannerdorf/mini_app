-- AIS source timestamps are kept inside payload; checked_at is our fetch time.
CREATE TABLE IF NOT EXISTS ferry_ais_cache (
  mmsi text PRIMARY KEY CHECK (mmsi ~ '^[0-9]{9}$'),
  payload jsonb NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now()
);

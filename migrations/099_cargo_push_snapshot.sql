-- Материализованный контекст push-шаблонов по перевозке (до отправки FCM/web/TG).
CREATE TABLE IF NOT EXISTS cargo_push_snapshot (
  customer_inn text NOT NULL,
  cargo_number text NOT NULL,
  state text,
  state_bill text,
  mest text,
  w text,
  pw text,
  volume text,
  sender text,
  receiver text,
  bill_number text,
  bill_sum text,
  auto_reg text,
  auto_type text,
  driver text,
  driver_tel text,
  plan_date text,
  plan_date_raw text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_mile_fetched_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_inn, cargo_number)
);

CREATE INDEX IF NOT EXISTS idx_cargo_push_snapshot_cargo_number
  ON cargo_push_snapshot (cargo_number);

CREATE INDEX IF NOT EXISTS idx_cargo_push_snapshot_updated_at
  ON cargo_push_snapshot (updated_at DESC);

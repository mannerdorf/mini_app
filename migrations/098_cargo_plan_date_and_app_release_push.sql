-- Плановая дата в cargo_last_state (diff из cache refresh) + dedupe app_update push.
ALTER TABLE cargo_last_state ADD COLUMN IF NOT EXISTS plan_date text;

CREATE TABLE IF NOT EXISTS app_release_push_state (
  platform text NOT NULL,
  version_code integer NOT NULL,
  version_name text NOT NULL DEFAULT '',
  notified_at timestamptz NOT NULL DEFAULT now(),
  devices_sent integer NOT NULL DEFAULT 0,
  PRIMARY KEY (platform, version_code)
);

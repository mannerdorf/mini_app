BEGIN;
CREATE TABLE IF NOT EXISTS sending_plans (
 id uuid PRIMARY KEY,
 planned_date text NOT NULL CHECK (planned_date ~ '^\d{4}-\d{2}-\d{2}$'),
 route text NOT NULL,
 mode text NOT NULL CHECK (mode IN ('auto','ferry','air')),
 vehicle_id text NOT NULL DEFAULT '',
 ferry_id bigint REFERENCES ferries(id),
 ferry_name text NOT NULL DEFAULT '',
 comment text NOT NULL DEFAULT '',
 revision integer NOT NULL DEFAULT 1,
 created_by text NOT NULL,
 updated_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((mode='air' AND vehicle_id='' AND ferry_id IS NULL) OR (mode='auto' AND vehicle_id<>'' AND ferry_id IS NULL) OR (mode='ferry' AND vehicle_id<>'' AND ferry_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS sending_plans_date_idx ON sending_plans(planned_date);
CREATE TABLE IF NOT EXISTS sending_plan_cargo (
 cargo_number text PRIMARY KEY CHECK (cargo_number ~ '^[1-9][0-9]{0,19}$'),
 plan_id uuid NOT NULL REFERENCES sending_plans(id) ON DELETE CASCADE,
 position integer NOT NULL,
 snapshot jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS sending_plan_cargo_plan_idx ON sending_plan_cargo(plan_id,position);
COMMENT ON TABLE sending_plans IS 'Рекомендательные планы кладовщика. Не создают документы отправки в 1С.';
COMMENT ON TABLE sending_plan_cargo IS 'Одна перевозка закрепляется только в одном плане, независимо от даты и пользователя.';
COMMIT;

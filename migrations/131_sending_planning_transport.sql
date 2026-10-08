BEGIN;
ALTER TABLE sending_plans ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '';
ALTER TABLE sending_plans ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false;
ALTER TABLE sending_plans ADD COLUMN IF NOT EXISTS source_key text;
CREATE UNIQUE INDEX IF NOT EXISTS sending_plans_source_idx ON sending_plans(source_key) WHERE source_key IS NOT NULL;
ALTER TABLE sending_plans DROP CONSTRAINT IF EXISTS sending_plans_mode_check;
ALTER TABLE sending_plans ADD CONSTRAINT sending_plans_mode_check CHECK (mode IN ('auto','roro','ferry','air',''));
ALTER TABLE sending_plans DROP CONSTRAINT IF EXISTS sending_plans_check;
ALTER TABLE sending_plans ADD CONSTRAINT sending_plans_check CHECK (
 (is_draft AND btrim(title)<>'' AND (mode<>'air' OR (vehicle_id='' AND ferry_id IS NULL)) AND (mode<>'auto' OR ferry_id IS NULL))
 OR (NOT is_draft AND btrim(route)<>'' AND (
  (mode='air' AND vehicle_id='' AND ferry_id IS NULL)
  OR (mode='auto' AND vehicle_id<>'' AND ferry_id IS NULL)
  OR (mode IN ('ferry','roro') AND vehicle_id<>'' AND ferry_id IS NOT NULL)
 ))
);
COMMENT ON COLUMN sending_plans.source_key IS 'Stable import key; repeated imports do not overwrite staff edits.';
COMMIT;

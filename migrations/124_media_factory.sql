BEGIN;
CREATE TABLE IF NOT EXISTS media_factory_settings (
 id integer PRIMARY KEY CHECK(id=1), generation_enabled boolean NOT NULL DEFAULT false,
 daily_budget_usd numeric NOT NULL DEFAULT 0 CHECK(daily_budget_usd>=0),
 input_usd_per_million numeric NOT NULL DEFAULT 0 CHECK(input_usd_per_million>=0),
 output_usd_per_million numeric NOT NULL DEFAULT 0 CHECK(output_usd_per_million>=0)
);
INSERT INTO media_factory_settings(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS media_factory_jobs (
 id bigserial PRIMARY KEY, plan_id integer NOT NULL REFERENCES media_content_plans(id), revision integer NOT NULL,
 kind text NOT NULL CHECK(kind IN ('check','generate')), fingerprint text NOT NULL UNIQUE,
 fact_ids jsonb NOT NULL, assignment jsonb NOT NULL, fact_pack jsonb NOT NULL,
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','held','done')),
 reasons jsonb NOT NULL DEFAULT '[]', result jsonb, result_revision integer,
 lease_token text, lease_until timestamptz, created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(plan_id,revision) REFERENCES media_content_revisions(plan_id,revision)
);
CREATE TABLE IF NOT EXISTS media_factory_attempts (
 id bigserial PRIMARY KEY, job_id bigint NOT NULL REFERENCES media_factory_jobs(id),
 started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 state text NOT NULL DEFAULT 'running', provider_started boolean NOT NULL DEFAULT false,
 reserved_usd numeric NOT NULL DEFAULT 0, estimated_usd numeric, input_tokens integer, output_tokens integer,
 model text, pricing jsonb, error_code text, lease_token text NOT NULL
);
CREATE INDEX IF NOT EXISTS media_factory_queue ON media_factory_jobs(state,created_at);
-- Cached legacy publisher cannot bypass current source checks.
CREATE OR REPLACE FUNCTION media_factory_publish_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF coalesce(current_setting('haulz.factory_publish',true),'') <> 'verified' THEN
  RAISE EXCEPTION 'Use source-verified publisher' USING ERRCODE='23514';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM media_factory_jobs j WHERE j.plan_id=NEW.plan_id AND j.revision=NEW.revision AND j.kind='check' AND j.state='done' AND j.reasons='[]'::jsonb) THEN
  RAISE EXCEPTION 'Current revision needs source check' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS media_factory_publish_guard ON media_site_publications;
CREATE TRIGGER media_factory_publish_guard BEFORE INSERT OR UPDATE ON media_site_publications FOR EACH ROW EXECUTE FUNCTION media_factory_publish_guard();
COMMIT;

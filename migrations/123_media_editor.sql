BEGIN;
ALTER TABLE media_content_plans ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1;
ALTER TABLE media_content_plans ADD COLUMN IF NOT EXISTS author_name text NOT NULL DEFAULT '';
ALTER TABLE media_content_plans ADD COLUMN IF NOT EXISTS source_notes text NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS media_content_revisions (
 plan_id integer NOT NULL REFERENCES media_content_plans(id), revision integer NOT NULL,
 snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), actor text NOT NULL,
 PRIMARY KEY(plan_id, revision)
);
CREATE TABLE IF NOT EXISTS media_site_publications (
 plan_id integer PRIMARY KEY REFERENCES media_content_plans(id), revision integer NOT NULL,
 slug text NOT NULL UNIQUE CHECK(slug ~ '^[a-z0-9][a-z0-9_-]{0,120}$'),
 snapshot jsonb NOT NULL, published_at timestamptz NOT NULL DEFAULT now(), published_by text NOT NULL,
 FOREIGN KEY(plan_id,revision) REFERENCES media_content_revisions(plan_id,revision)
);
INSERT INTO media_content_revisions(plan_id,revision,snapshot,actor)
SELECT id,revision,to_jsonb(p),coalesce(created_by,'migration') FROM media_content_plans p ON CONFLICT DO NOTHING;
-- Only existing actual site publications are carried forward, never TG-only plans.
INSERT INTO media_site_publications(plan_id,revision,slug,snapshot,published_at,published_by)
SELECT DISTINCT ON(lower(article_slug)) id,revision,lower(article_slug),to_jsonb(p),coalesce(published_at,updated_at),'migration'
FROM media_content_plans p WHERE status='published' AND channels @> '["site"]'::jsonb
AND article_slug ~* '^[a-z0-9][a-z0-9_-]{0,120}$' AND nullif(trim(body_markdown),'') IS NOT NULL
ORDER BY lower(article_slug), id DESC ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION media_editor_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND coalesce(current_setting('haulz.editor_actor',true),'')='' THEN
  RAISE EXCEPTION 'Update through the versioned editor' USING ERRCODE='23514';
 END IF;
 IF NEW.status='published' THEN
  RAISE EXCEPTION 'Publish through the versioned editor' USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' THEN NEW.revision=OLD.revision+1; END IF;
 NEW.updated_at=now(); RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS media_editor_guard ON media_content_plans;
CREATE TRIGGER media_editor_guard BEFORE INSERT OR UPDATE ON media_content_plans FOR EACH ROW EXECUTE FUNCTION media_editor_guard();
CREATE OR REPLACE FUNCTION media_editor_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO media_content_revisions(plan_id,revision,snapshot,actor)
 VALUES(NEW.id,NEW.revision,to_jsonb(NEW),coalesce(nullif(current_setting('haulz.editor_actor',true),''),NEW.created_by,'legacy-admin'));
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS media_editor_history ON media_content_plans;
CREATE TRIGGER media_editor_history AFTER INSERT OR UPDATE ON media_content_plans FOR EACH ROW EXECUTE FUNCTION media_editor_history();
CREATE OR REPLACE VIEW media_published_site_content AS
SELECT p.plan_id AS id, p.slug AS article_slug, p.snapshot->>'title' AS title,
p.snapshot->>'article_title' AS article_title, p.snapshot->>'meta_description' AS meta_description,
p.snapshot->>'body_markdown' AS body_markdown, p.snapshot->>'telegram_teaser' AS telegram_teaser,
p.snapshot->>'author_name' AS author_name, p.snapshot->>'source_notes' AS source_notes,
p.published_at, (p.snapshot->>'planned_date')::date AS planned_date,
'["site"]'::jsonb AS channels,'published'::text AS status FROM media_site_publications p;
COMMIT;

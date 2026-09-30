-- Operational state for the long-term media program. Editorial metadata stays in programManifest.ts.
CREATE TABLE IF NOT EXISTS media_program_tasks (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'review', 'blocked', 'done')),
  owner TEXT NOT NULL DEFAULT '' CHECK (length(owner) <= 160),
  notes TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 10000),
  evidence TEXT NOT NULL DEFAULT '' CHECK (length(evidence) <= 10000),
  updated_at TIMESTAMPTZ,
  updated_by TEXT,
  CHECK (status <> 'done' OR length(btrim(evidence)) > 0)
);

CREATE TABLE IF NOT EXISTS media_program_channels (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'not_connected' CHECK (status IN ('not_connected', 'configuring', 'connected', 'attention')),
  url TEXT NOT NULL DEFAULT '' CHECK (length(url) <= 2048),
  notes TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 10000),
  updated_at TIMESTAMPTZ,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS media_program_activity (
  id BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('task', 'channel')),
  entity_id TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  before_state JSONB NOT NULL,
  after_state JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  created_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS media_program_activity_created_idx ON media_program_activity (created_at DESC, id DESC);

-- Reapplying this migration never replaces an administrator's status or notes.
INSERT INTO media_program_tasks (id, status) VALUES
  ('T00', 'review'), ('T01', 'planned'), ('T02', 'planned'), ('T03', 'planned'),
  ('T04', 'planned'), ('T05', 'planned'), ('T06', 'planned'), ('T07', 'planned'),
  ('T08', 'planned'), ('T09', 'planned'), ('T10', 'planned'), ('T11', 'planned'),
  ('T12', 'planned'), ('T13', 'planned'), ('T14', 'planned'), ('T15', 'planned')
ON CONFLICT (id) DO NOTHING;

INSERT INTO media_program_channels (id) VALUES
  ('site'), ('telegram'), ('youtube'), ('vk'), ('yandex_webmaster'),
  ('google_search_console'), ('bing'), ('alice'), ('chatgpt'), ('perplexity')
ON CONFLICT (id) DO NOTHING;

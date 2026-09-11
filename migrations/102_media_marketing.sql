-- Медиа-маркетинг: SEO чек-лист, медиаплан, рекламные интеграции

CREATE TABLE IF NOT EXISTS media_seo_checklist (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  owner_action TEXT NOT NULL,
  doc_link TEXT,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS media_seo_checklist_state (
  checklist_id INT PRIMARY KEY REFERENCES media_seo_checklist(id) ON DELETE CASCADE,
  is_done BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS media_content_plans (
  id SERIAL PRIMARY KEY,
  planned_date DATE NOT NULL,
  title TEXT NOT NULL,
  brief TEXT NOT NULL DEFAULT '',
  target_keywords TEXT,
  channels JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'planned',
  article_slug TEXT,
  article_title TEXT,
  meta_description TEXT,
  body_markdown TEXT,
  telegram_teaser TEXT,
  email_subject TEXT,
  email_teaser TEXT,
  gpt_model TEXT,
  generated_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS media_content_plans_planned_date_idx ON media_content_plans (planned_date DESC);
CREATE INDEX IF NOT EXISTS media_content_plans_status_idx ON media_content_plans (status);

CREATE TABLE IF NOT EXISTS media_ad_placements (
  id SERIAL PRIMARY KEY,
  placement_type TEXT NOT NULL,
  partner_name TEXT NOT NULL,
  contact TEXT,
  platform TEXT,
  description TEXT,
  cost_amount NUMERIC(12, 2),
  cost_currency TEXT NOT NULL DEFAULT 'RUB',
  start_date DATE,
  end_date DATE,
  url TEXT,
  utm_campaign TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  metrics_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS media_ad_placements_status_idx ON media_ad_placements (status);
CREATE INDEX IF NOT EXISTS media_ad_placements_start_date_idx ON media_ad_placements (start_date DESC);

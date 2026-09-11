-- Unique slug for published blog articles
CREATE UNIQUE INDEX IF NOT EXISTS media_content_plans_article_slug_uidx
  ON media_content_plans (lower(article_slug))
  WHERE article_slug IS NOT NULL AND btrim(article_slug) <> '';

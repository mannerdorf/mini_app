import type { Pool } from "pg";

export type PublicBlogListItem = {
  slug: string;
  title: string;
  meta_description: string | null;
  published_at: string;
  planned_date: string | null;
  channels: unknown;
};

export type PublicBlogArticle = PublicBlogListItem & {
  body_markdown: string;
  telegram_teaser: string | null;
};

export async function listPublishedBlogArticles(pool: Pool, limit = 50): Promise<PublicBlogListItem[]> {
  const { rows } = await pool.query(
    `select article_slug as slug,
            coalesce(nullif(article_title, ''), title) as title,
            meta_description,
            published_at::text,
            planned_date::text,
            channels
     from media_content_plans
     where status = 'published'
       and article_slug is not null
       and nullif(trim(article_slug), '') is not null
       and nullif(trim(coalesce(body_markdown, '')), '') is not null
     order by coalesce(published_at, planned_date::timestamptz) desc nulls last, id desc
     limit $1`,
    [Math.min(100, Math.max(1, limit))],
  );
  return rows as PublicBlogListItem[];
}

export async function getPublishedBlogArticle(pool: Pool, slug: string): Promise<PublicBlogArticle | null> {
  const clean = String(slug || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
  if (!clean) return null;
  const { rows } = await pool.query(
    `select article_slug as slug,
            coalesce(nullif(article_title, ''), title) as title,
            meta_description,
            body_markdown,
            telegram_teaser,
            published_at::text,
            planned_date::text,
            channels
     from media_content_plans
     where status = 'published'
       and lower(article_slug) = $1
       and nullif(trim(coalesce(body_markdown, '')) , '') is not null
     limit 1`,
    [clean],
  );
  return (rows[0] as PublicBlogArticle) || null;
}

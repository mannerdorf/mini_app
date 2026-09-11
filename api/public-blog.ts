import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { initRequestContext, logError } from "./_lib/observability.js";
import { applyApiCors, respondCorsPreflight } from "./_lib/cors.js";
import { getPublishedBlogArticle, listPublishedBlogArticles } from "../lib/mediaMarketing/blogArticles.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (respondCorsPreflight(req, res)) return;
  applyApiCors(res);
  const ctx = initRequestContext(req, res, "public_blog");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  try {
    const pool = getPool();
    const slug = typeof req.query.slug === "string" ? req.query.slug : "";
    if (slug) {
      const article = await getPublishedBlogArticle(pool, slug);
      if (!article) {
        return res.status(404).json({ error: "Статья не найдена", request_id: ctx.requestId });
      }
      return res.status(200).json({
        article: {
          ...article,
          path: `/blog/${article.slug}`,
          url: `https://haulz.space/blog/${article.slug}`,
        },
        request_id: ctx.requestId,
      });
    }

    const limit = Number(req.query.limit) || 50;
    const articles = await listPublishedBlogArticles(pool, limit);
    return res.status(200).json({
      articles: articles.map((a) => ({
        ...a,
        path: `/blog/${a.slug}`,
        url: `https://haulz.space/blog/${a.slug}`,
      })),
      request_id: ctx.requestId,
    });
  } catch (e) {
    logError(ctx, "public_blog_failed", e);
    return res.status(500).json({ error: (e as Error)?.message || "Ошибка", request_id: ctx.requestId });
  }
}

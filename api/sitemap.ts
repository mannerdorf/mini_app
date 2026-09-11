import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { listPublishedBlogArticles } from "../lib/mediaMarketing/blogArticles.js";

const STATIC_URLS: Array<{ loc: string; changefreq: string; priority: string }> = [
  { loc: "https://haulz.space/", changefreq: "weekly", priority: "1.0" },
  { loc: "https://haulz.space/perevozka-moskva-kaliningrad", changefreq: "weekly", priority: "0.9" },
  { loc: "https://haulz.space/perevozka-kaliningrad-moskva", changefreq: "weekly", priority: "0.9" },
  { loc: "https://haulz.space/kalkulyator", changefreq: "weekly", priority: "0.8" },
  { loc: "https://haulz.space/faq", changefreq: "monthly", priority: "0.6" },
  { loc: "https://haulz.space/sklady", changefreq: "monthly", priority: "0.6" },
  { loc: "https://haulz.space/o-kompanii", changefreq: "monthly", priority: "0.5" },
  { loc: "https://haulz.space/blog", changefreq: "daily", priority: "0.8" },
];

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const urls = [...STATIC_URLS];
  try {
    const pool = getPool();
    const articles = await listPublishedBlogArticles(pool, 100);
    for (const a of articles) {
      urls.push({
        loc: `https://haulz.space/blog/${a.slug}`,
        changefreq: "monthly",
        priority: "0.7",
      });
    }
  } catch {
    /* static fallback */
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${escapeXml(u.loc)}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`,
  )
  .join("\n")}
</urlset>
`;

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");
  return res.status(200).send(body);
}

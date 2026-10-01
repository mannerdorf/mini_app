import { publishedServicePaths } from './serviceContent.js';
import type { Pool } from 'pg';
export const SITEMAP_PAGE_SIZE = 1000;
export const STATIC_SITEMAP_PATHS = ['/', '/perevozka-moskva-kaliningrad', '/perevozka-kaliningrad-moskva', '/kalkulyator', '/faq', '/sklady', '/o-kompanii', '/blog'];
export function staticSitemapPaths(now = new Date()): string[] { return [...STATIC_SITEMAP_PATHS, ...publishedServicePaths(now)]; }
const published = `select distinct lower(article_slug) as slug from media_content_plans
 where status = 'published' and article_slug ~* '^[a-z0-9][a-z0-9_-]{0,120}$'
 and nullif(trim(coalesce(body_markdown, '')), '') is not null`;
export async function countSitemapArticles(pool: Pool): Promise<number> {
 const {rows} = await pool.query(`select count(*)::int as count from (${published}) articles`);
 return Number(rows[0].count);
}
export async function sitemapArticlePaths(pool: Pool, page: number): Promise<string[]> {
 const {rows} = await pool.query(`${published} order by slug limit $1 offset $2`, [SITEMAP_PAGE_SIZE, (page - 1) * SITEMAP_PAGE_SIZE]);
 return rows.map(row => `/blog/${row.slug}`);
}
export function xmlEscape(value: string): string {
 return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
export function sitemapXml(paths: string[]): string {
 return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(path => `<url><loc>${xmlEscape('https://haulz.space' + path)}</loc></url>`).join('')}</urlset>`;
}
export function sitemapIndex(count: number): string {
 const pages = Math.ceil(count / SITEMAP_PAGE_SIZE);
 return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${Array.from({length:pages+1},(_,page)=>`<sitemap><loc>https://haulz.space/api/sitemap?page=${page}</loc></sitemap>`).join('')}</sitemapindex>`;
}

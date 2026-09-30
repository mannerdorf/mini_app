import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool } from './_db.js';
import { countSitemapArticles, sitemapArticlePaths, sitemapIndex, sitemapXml, STATIC_SITEMAP_PATHS } from '../lib/mediaMarketing/sitemapDocuments.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
 if (req.method !== 'GET' && req.method !== 'HEAD') {res.setHeader('Allow','GET, HEAD');return res.status(405).end();}
 const page = req.query.page;
 if (page !== undefined && (typeof page !== 'string' || !/^(0|[1-9]\d{0,6})$/.test(page))) return res.status(400).send('Invalid sitemap page');
 try {
  const body = page === '0' ? sitemapXml(STATIC_SITEMAP_PATHS) : page === undefined ? sitemapIndex(await countSitemapArticles(getPool())) : sitemapXml(await sitemapArticlePaths(getPool(),Number(page)));
  res.setHeader('Content-Type','application/xml; charset=utf-8');
  res.setHeader('Cache-Control','public, max-age=300');
  return req.method === 'HEAD' ? res.status(200).end() : res.status(200).send(body);
 } catch {
  // Never represent a database outage as a successful, incomplete sitemap.
  res.setHeader('Cache-Control','no-store');res.setHeader('Retry-After','60');
  return res.status(503).send('Sitemap temporarily unavailable');
 }
}

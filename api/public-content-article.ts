import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool } from './_db.js';
import { getPublishedBlogArticle } from '../lib/mediaMarketing/blogArticles.js';
import { publicBlogHtml } from '../lib/mediaMarketing/contentArticleHtml.js';
export default async function handler(req: VercelRequest, res: VercelResponse) {
 res.setHeader('Content-Type','text/html; charset=utf-8');
 if (req.method !== 'GET' && req.method !== 'HEAD') {res.setHeader('Allow','GET, HEAD');return res.status(405).end();}
 const slug = req.query.slug;
 if (typeof slug !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,120}$/i.test(slug)) {res.setHeader('Cache-Control','no-store');return res.status(404).end();}
 try {
  const article = await getPublishedBlogArticle(getPool(),slug);
  if (!article) {res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex');return res.status(404).end();}
  res.setHeader('Cache-Control','public, max-age=60');
  return req.method === 'HEAD' ? res.status(200).end() : res.status(200).send(publicBlogHtml(article));
 } catch {
  res.setHeader('Cache-Control','no-store');res.setHeader('Retry-After','60');
  return res.status(503).send('<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="robots" content="noindex"><title>Блог временно недоступен — HAULZ</title><h1>Не удалось загрузить статью</h1><p>Попробуйте немного позже.</p><a href="/">На главную</a></html>');
 }
}

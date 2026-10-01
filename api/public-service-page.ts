import type { VercelRequest, VercelResponse } from '@vercel/node';
import { SERVICE_CONTENT, isPublishedService } from '../lib/mediaMarketing/serviceContent.js';
import { publicServiceHtml } from '../lib/mediaMarketing/publicServiceHtml.js';
export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET, HEAD'); return res.status(405).end(); }
  const slug = req.query.slug;
  const service = typeof slug === 'string' && /^[a-z0-9][a-z0-9-]{0,120}$/.test(slug) ? SERVICE_CONTENT.find(s => s.slug === slug && isPublishedService(s)) : undefined;
  // A query parameter must never grant public access to drafts.
  if (!service) { res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Robots-Tag', 'noindex'); return res.status(404).end(); }
  res.setHeader('Cache-Control', 'no-cache');
  return req.method === 'HEAD' ? res.status(200).end() : res.status(200).send(publicServiceHtml(service));
}

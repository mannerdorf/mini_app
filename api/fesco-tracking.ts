import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool } from './_db.js';
import { verifyRegisteredUser } from '../lib/verifyRegisteredUser.js';
import { respondCorsPreflight } from './_lib/cors.js';
import { normalizeTrackingNumber, validTrackingNumber, requestFescoTracking } from '../lib/fesco/tracking.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (respondCorsPreflight(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Method not allowed' }); }
  const number = normalizeTrackingNumber(req.query.number);
  const ferryId = Number(req.query.ferryId);
  if (!validTrackingNumber(number) || !Number.isInteger(ferryId) || ferryId < 1) return res.status(400).json({ error: 'Укажите номер контейнера, коносамента или заказа' });
  try {
    const pool = getPool();
    const login = String(req.headers['x-login'] ?? '').trim().toLowerCase();
    const password = String(req.headers['x-password'] ?? '').trim();
    if (!login || !password || !await verifyRegisteredUser(pool, login, password)) return res.status(401).json({ error: 'Необходимо войти в кабинет' });
    const ferry = await pool.query('SELECT api_provider FROM ferries WHERE id=$1', [ferryId]);
    if (String(ferry.rows[0]?.api_provider ?? '').trim().toUpperCase() !== 'FESCO') return res.status(409).json({ error: 'Для этого судна трекинг API пока не подключён' });
    const token = (process.env.FESCO_API_TOKEN ?? '').trim().replace(/^Bearer\s+/i, '');
    if (!token || /[\r\n]/.test(token)) return res.status(503).json({ error: 'Токен FESCO не настроен на сервере' });
    const data = await requestFescoTracking(number, token);
    return res.status(200).json({ ok: true, provider: 'FESCO', number, data, fetchedAt: new Date().toISOString() });
  } catch (error) {
    // Only messages from our transport are safe to expose; database errors stay server-side.
    const message = error instanceof Error && /FESCO/.test(error.message) ? error.message : 'Не удалось загрузить трекинг';
    return res.status(502).json({ error: message });
  }
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool } from './_db.js';
import { respondCorsPreflight } from './_lib/cors.js';
import { authorizeServiceRefreshFrom1c } from '../lib/serviceRefreshFrom1c.js';
import { fetchClientTariffsFrom1c } from '../lib/clientTariffs1c.js';
import { POST_ZAYAVKA_URL } from '../lib/post1cZayavkaUpload.js';

/** Current client tariff slice; never exposed by the public tariff cache. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (respondCorsPreflight(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({error:'Method not allowed'});
  }
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({error:'Некорректный запрос'}); }
  }
  try {
    const auth = await authorizeServiceRefreshFrom1c(getPool(), {
      login:body?.login, password:body?.password,
      serviceMode:body?.serviceMode === true, isRegisteredUser:body?.isRegisteredUser === true,
    });
    if (!auth.ok) return res.status(auth.status).json({error:auth.error});
    const inn = String(body?.inn ?? '').trim();
    if (!/^\d{10}(\d{2})?$/.test(inn)) return res.status(400).json({error:'Выберите заказчика с ИНН из 10 или 12 цифр'});
    const base = (process.env.ONE_C_DELIVERY_BASE_URL || POST_ZAYAVKA_URL.replace(/PostZayavka2\/?$/, '')).replace(/\/$/, '');
    const url = `${base}/GetClientTariffs/?${new URLSearchParams({INN:inn})}`;
    let data: any;
    let upstreamStatus: number | undefined;
    try { data = await fetchClientTariffsFrom1c(url, async status => { upstreamStatus = status; }); }
    catch { return res.status(502).json({error: upstreamStatus === 404
      ? 'Метод GetClientTariffs пока недоступен в 1С. Требуется обновить веб-сервис 1С.'
      : 'Не удалось получить тарифы клиента из 1С. Проверьте доступность метода и выбранного заказчика.'}); }
    if (data?.Success !== true || String(data?.ИНН ?? '').trim() !== inn || !Array.isArray(data?.Тарифы)
      || data.Тарифы.some((row:unknown) => !row || typeof row !== 'object' || Array.isArray(row))) {
      return res.status(502).json({error:'Некорректный ответ тарифов клиента от 1С'});
    }
    return res.status(200).json({inn, tariffs:data.Тарифы, fetchedAt:new Date().toISOString()});
  } catch {
    return res.status(500).json({error:'Ошибка загрузки тарифов клиента'});
  }
}

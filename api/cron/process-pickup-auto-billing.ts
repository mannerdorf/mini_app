import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireCronAuth } from '../_lib/cronAuth.js';
import { getPool } from '../_db.js';
import { processPickupAutoBilling } from '../../lib/pickup/autoBilling.js';
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!['GET','POST'].includes(req.method || '')) return res.status(405).json({error:'Method not allowed'});
  const denied = requireCronAuth(req);
  if (denied) return res.status(denied.status).json({error:denied.error});
  try { return res.status(200).json({ok:true,...await processPickupAutoBilling(getPool())}); }
  catch { return res.status(503).json({error:'Не удалось обработать автоматические расчёты. Проверьте миграцию 119 и журнал сервера.'}); }
}

import type { VercelRequest,VercelResponse } from '@vercel/node';
import { getPool } from '../_db.js';
import { requireCronAuth } from '../_lib/cronAuth.js';
import { processCustomerOnboarding } from '../../lib/customerOnboarding.js';
export default async function handler(req:VercelRequest,res:VercelResponse) {
  if(!['GET','POST'].includes(req.method||''))return res.status(405).json({error:'Method not allowed'});
  const denied=requireCronAuth(req);if(denied)return res.status(denied.status).json({error:denied.error});
  try{return res.status(200).json({ok:true,...await processCustomerOnboarding(getPool())});}
  catch{return res.status(503).json({error:'Не удалось обработать регистрации. Проверьте миграцию 127 и журнал сервера.'});}
}

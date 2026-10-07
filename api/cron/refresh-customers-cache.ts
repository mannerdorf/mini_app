import type { VercelRequest,VercelResponse } from '@vercel/node';
import { getPool } from '../_db.js';
import { requireCronAuth } from '../_lib/cronAuth.js';
import { runCronWork } from '../../lib/cronWorkState.js';
import { fetchServiceJson } from '../../lib/documentCacheRefreshCore.js';
import { normalizeCacheCustomers,replaceCustomerCache } from '../../lib/customerCacheSync.js';
export default async function handler(req:VercelRequest,res:VercelResponse) {
  if(!['GET','POST'].includes(req.method||''))return res.status(405).json({error:'Method not allowed'});
  const denied=requireCronAuth(req);if(denied)return res.status(denied.status).json({error:denied.error});
  const login=process.env.PEREVOZKI_SERVICE_LOGIN,password=process.env.PEREVOZKI_SERVICE_PASSWORD;
  if(!login||!password)return res.status(503).json({error:'Сервисная авторизация 1С не настроена'});
  try {const pool=getPool();return res.status(200).json(await runCronWork(pool,'customers_sync',15,async()=>{
    const rows=normalizeCacheCustomers(await fetchServiceJson(login,password,'https://tdn.postb.ru/workbase/hs/DeliveryWebService/GETAPI?metod=Getcustomers'));
    await replaceCustomerCache(pool,rows);
    return {result:{ok:true,count:rows.length},cursor:{}};
  }));} catch {return res.status(502).json({error:'Не удалось обновить заказчиков. Предыдущий справочник сохранён.'});}
}

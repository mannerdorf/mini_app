import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool } from './_db.js';
import { respondCorsPreflight } from './_lib/cors.js';
import { authorizeServiceRefreshFrom1c } from '../lib/serviceRefreshFrom1c.js';
import { verifyRegisteredUser } from '../lib/verifyRegisteredUser.js';
import { resolveCompanyAccess, CompanyAccessError } from '../lib/companyAccess.js';
import { readPerevozkiByNumbersFromCache } from '../lib/documentCacheRead.js';
import { resolvePerevozkiRolesForInns } from '../lib/perevozkiPartyMatch.js';
import { annotateCargoPickupPhotos } from '../lib/pickup/cargoPhotoIndicator.js';
import { annotateCargoLastMile } from '../lib/pickup/cargoLastMile.js';

/** Authorized cargo lookup independent of the current document period. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (respondCorsPreflight(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  let body = req.body;
  try { if (typeof body === 'string') body = JSON.parse(body); }
  catch { return res.status(400).json({error:'Некорректный запрос'}); }
  if (!Array.isArray(body?.numbers) || body.numbers.length === 0 || body.numbers.length > 200 ||
      body.numbers.some((n:unknown) => typeof n !== 'string' || !/^\d{1,20}$/.test(n.trim()))) {
    return res.status(400).json({error:'Укажите от 1 до 200 номеров перевозок'});
  }
  const {login,password} = body;
  if (typeof login !== 'string' || !login.trim() || typeof password !== 'string' || !password) {
    return res.status(401).json({error:'Требуется авторизация'});
  }
  try {
    const pool=getPool();
    const key=login.trim().toLowerCase();
    const registered=await pool.query('SELECT login FROM registered_users WHERE lower(trim(login))=$1',[key]);
    let all=false;
    const inns=new Set<string>();
    if (body.serviceMode === true) {
      const access=await authorizeServiceRefreshFrom1c(pool,{login,password,serviceMode:true,isRegisteredUser:registered.rows.length>0});
      if (!access.ok) return res.status(access.status).json({error:access.error});
      all=true;
    } else if (registered.rows.length) {
      const user=await verifyRegisteredUser(pool,key,password);
      if (!user) return res.status(401).json({error:'Неверный логин или пароль'});
      all=user.accessAllInns;
      if(user.inn) inns.add(user.inn);
      const companies=await pool.query('SELECT inn FROM account_companies WHERE login=$1',[key]);
      companies.rows.forEach(row=>inns.add(String(row.inn??'').trim()));
    } else {
      const access=await resolveCompanyAccess(pool,login,password);
      access.customers.forEach(company=>inns.add(company.inn));
    }
    inns.delete('');
    const numbers=[...new Set<string>(body.numbers.map((n:string)=>n.trim()))];
    const stored=await readPerevozkiByNumbersFromCache(pool,numbers);
    const items=stored.filter(item=>all || resolvePerevozkiRolesForInns(item,inns).length>0);
    return res.status(200).json({items:await annotateCargoLastMile(pool,await annotateCargoPickupPhotos(pool,items))});
  } catch(error) {
    return res.status(error instanceof CompanyAccessError?error.status:500).json({error:error instanceof CompanyAccessError?error.message:'Не удалось загрузить сведения о перевозках'});
  }
}

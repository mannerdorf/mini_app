import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool } from './_db.js';
import { respondCorsPreflight } from './_lib/cors.js';
import { verifyRegisteredUser } from '../lib/verifyRegisteredUser.js';
import { enqueuePlanDates } from '../lib/planDateQueue.js';
import { getSuperAdminRequestContext, isVerifiedSuperAdmin } from '../lib/adminDocumentCacheAccess.js';
export default async function handler(req:VercelRequest,res:VercelResponse) {
 if(respondCorsPreflight(req,res)) return;
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
 let body:any=req.body;
 try {if(typeof body==='string') body=JSON.parse(body);}catch{return res.status(400).json({error:'Invalid JSON'});}
 const pool=getPool();
 const login=String(body?.login||req.headers['x-login']||'').trim().toLowerCase();
 try {
   const superAdmin=isVerifiedSuperAdmin(getSuperAdminRequestContext(req,body));
   if(!superAdmin) {
     const verified=await verifyRegisteredUser(pool,login,String(body?.password||req.headers['x-password']||''));
     if(!verified) return res.status(401).json({error:'Войдите в приложение'});
     const user=(await pool.query('SELECT permissions FROM registered_users WHERE login=$1 AND active=true',[login])).rows[0];
     if(user?.permissions?.eor!==true && user?.permissions?.supervisor!==true) return res.status(403).json({error:'Нет права изменять плановую дату'});
   }
   if(body?.action==='status') {
     const tasks=(await pool.query(`SELECT cargo_number,target_date,state,last_error,updated_at FROM plan_date_queue ORDER BY (state IN ('pending','sending','verifying','uncertain')) DESC,updated_at DESC LIMIT 100`)).rows;
     return res.status(200).json({tasks});
   }
   if(!Array.isArray(body?.cargoNumbers)) return res.status(400).json({error:'Выберите перевозки'});
   const tasks=await enqueuePlanDates(pool,body.cargoNumbers,body.date,login||'superadmin');
   return res.status(202).json({ok:true,queued:tasks.length,tasks});
 } catch(e) {
   if((e as {code?:string}).code==='42P01') return res.status(503).json({error:'Примените миграцию 120 — очередь плановых дат'});
   return res.status(400).json({error:(e as Error).message});
 }
}

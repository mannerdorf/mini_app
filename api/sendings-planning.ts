import type {VercelRequest,VercelResponse} from '@vercel/node';
import {getPool} from './_db.js';
import {respondCorsPreflight} from './_lib/cors.js';
import {verifyRegisteredUser} from '../lib/verifyRegisteredUser.js';
import {getSuperAdminRequestContext,isVerifiedSuperAdmin} from '../lib/adminDocumentCacheAccess.js';
import {PlanningError,readSendingPlans,saveSendingPlan,deleteSendingPlan} from '../lib/sendingPlanning.js';
import {chooseSendingPlanFact} from '../lib/sendingPlanningReconciliation.js';

export default async function handler(req:VercelRequest,res:VercelResponse) {
 if(respondCorsPreflight(req,res))return;
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 let body;
 try{body=typeof req.body==='string'?JSON.parse(req.body):req.body;}catch{return res.status(400).json({error:'Некорректный запрос'});}
 if(!body||typeof body!=='object'||Array.isArray(body))return res.status(400).json({error:'Некорректный запрос'});
 try{
  const pool=getPool(),login=String(body.login||req.headers['x-login']||'').trim().toLowerCase();
  if(!isVerifiedSuperAdmin(getSuperAdminRequestContext(req,body))){
   const verified=await verifyRegisteredUser(pool,login,String(body.password||req.headers['x-password']||''));
   if(!verified)return res.status(401).json({error:'Войдите в приложение'});
   const permissions=(await pool.query('SELECT permissions FROM registered_users WHERE lower(trim(login))=$1 AND active=true',[login])).rows[0]?.permissions;
   if(permissions?.haulz!==true&&permissions?.eor!==true&&permissions?.supervisor!==true)return res.status(403).json({error:'Планирование доступно сотрудникам с правом HAULZ, EOR или руководителя'});
  }
  if(body.action==='list')return res.status(200).json(await readSendingPlans(pool,body.from,body.to));
  if(body.action==='save')return res.status(200).json({id:await saveSendingPlan(pool,body.plan,login||'superadmin')});
  if(body.action==='reconcile')return res.status(200).json(await chooseSendingPlanFact(pool,body.id,body.revision,body.sendingKey,login||'superadmin'));
  if(body.action==='delete'){await deleteSendingPlan(pool,body.id,body.revision);return res.status(200).json({ok:true});}
  return res.status(400).json({error:'Неизвестное действие'});
 }catch(error){
  if(error instanceof PlanningError)return res.status(error.status).json({error:error.message});
  if((error as {code?:string}).code==='42P01')return res.status(503).json({error:'Планирование ещё не подключено на сервере'});
  console.error('[sendings-planning]',error instanceof Error?error.name:'Error');
  return res.status(500).json({error:'Не удалось сохранить или загрузить планирование. Повторите попытку.'});
 }
}

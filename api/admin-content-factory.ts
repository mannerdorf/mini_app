import type {VercelRequest,VercelResponse} from '@vercel/node';
import {getPool} from './_db.js';
import {getAdminTokenFromRequest,getAdminTokenPayload,verifyAdminToken} from '../lib/adminAuth.js';
import {enqueue,runOne} from '../lib/mediaMarketing/factoryQueue.js';
import {registry} from '../lib/mediaMarketing/factorySources.js';
import {generateWithFacts} from '../lib/mediaMarketing/factoryGenerator.js';
import {EditorError} from '../lib/mediaMarketing/editorStore.js';
export default async function handler(req:VercelRequest,res:VercelResponse){
 res.setHeader('Cache-Control','private, no-store');const token=getAdminTokenFromRequest(req);
 if(!verifyAdminToken(token))return res.status(401).json({error:'Требуется авторизация админа'});
 try{
  const pool=getPool();const actor=getAdminTokenPayload(token)?.login||'admin';
  if(req.method==='GET'){
   const id=Number(req.query.id);if(!Number.isSafeInteger(id)||id<1)throw new EditorError(400,'Нужен id материала');
   const jobs=(await pool.query('select * from media_factory_jobs where plan_id=$1 order by id desc limit 30',[id])).rows;
   const attempts=(await pool.query('select a.* from media_factory_attempts a join media_factory_jobs j on j.id=a.job_id where j.plan_id=$1 order by a.id desc limit 100',[id])).rows;
   const settings=(await pool.query('select * from media_factory_settings where id=1')).rows[0];
   return res.status(200).json({jobs,attempts,settings,facts:(await registry()).facts.map(f=>({id:f.id,claim:f.claim,status:f.status,valid_until:f.valid_until}))});
  }
  if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return res.status(405).end();}
  const b=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
  if(b.action==='run')return res.status(200).json(await runOne(pool,generateWithFacts));
  if(b.action==='enqueue')return res.status(200).json({job:await enqueue(pool,Number(b.id),Number(b.expected_revision),b.kind,b.fact_ids,actor)});
  if(b.action==='retry'){
   const id=Number(b.job_id);if(!Number.isSafeInteger(id)||id<1)throw new EditorError(400,'Нужен id задания');
   const r=await pool.query("update media_factory_jobs j set state='queued',reasons='[]',updated_at=now() where id=$1 and state='held' and not exists(select 1 from media_factory_attempts a where a.job_id=j.id and a.provider_started) and revision=(select revision from media_content_plans p where p.id=j.plan_id) returning id",[id]);
   if(!r.rows.length)throw new EditorError(409,'Повтор невозможен: версия изменилась или запрос модели уже был отправлен');return res.status(200).json({id});
  }
  throw new EditorError(400,'Неизвестное действие');
 }catch(e){return res.status(e instanceof EditorError?e.status:e instanceof SyntaxError?400:503).json({error:e instanceof EditorError?e.message:'Не удалось обработать очередь'});}
}

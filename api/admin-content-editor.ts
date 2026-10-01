import type {VercelRequest,VercelResponse} from '@vercel/node';
import {getPool} from './_db.js';
import {verifyAdminToken,getAdminTokenFromRequest,getAdminTokenPayload} from '../lib/adminAuth.js';
import {draftFields,readEditor,editContent,EditorError} from '../lib/mediaMarketing/editorStore.js';
import {generateMediaArticle} from '../lib/mediaMarketing/generateArticle.js';
export default async function handler(req:VercelRequest,res:VercelResponse){
 res.setHeader('Cache-Control','no-store');
 const token=getAdminTokenFromRequest(req);if(!verifyAdminToken(token))return res.status(401).json({error:'Требуется авторизация админа'});
 const actor=getAdminTokenPayload(token)?.login||'admin';
 try{
  const pool=getPool();const b=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
  if(req.method==='GET'){
   if(req.query.id){const id=Number(req.query.id);if(!Number.isSafeInteger(id)||id<=0)throw new EditorError(400,'Некорректный id');return res.status(200).json(await readEditor(pool,id));}
   return res.status(200).json({plans:(await pool.query('select p.*,s.revision as site_revision from media_content_plans p left join media_site_publications s on s.plan_id=p.id order by p.planned_date desc,p.id desc limit 200')).rows});
  }
  if(req.method==='POST'){
   const v=draftFields(b);if(!v.title||!v.planned_date)throw new EditorError(400,'Нужны тема и дата');
   const {rows}=await pool.query(`insert into media_content_plans(title,planned_date,brief,target_keywords,channels,created_by) values($1,$2::date,$3,$4,$5::jsonb,$6) returning *`,[v.title,v.planned_date,v.brief||'',v.target_keywords||'',v.channels||'[]',actor]);
   return res.status(201).json({plan:rows[0]});
  }
  if(req.method==='PATCH'){
   if(b.action==='generate'){
    const {plan}=await readEditor(pool,Number(b.id));if(plan.revision!==b.expected_revision)throw new EditorError(409,'Обновите версию перед генерацией');
    const generated=await generateMediaArticle({title:plan.title,brief:plan.brief,plannedDate:String(plan.planned_date).slice(0,10),targetKeywords:plan.target_keywords||'',channels:plan.channels});
    return res.status(200).json(await editContent(pool,Number(b.id),b.expected_revision,'generated',generated,actor));
   }
   return res.status(200).json(await editContent(pool,Number(b.id),b.expected_revision,String(b.action||'save'),b,actor));
  }
  res.setHeader('Allow','GET, POST, PATCH');return res.status(405).json({error:'Метод не поддерживается'});
 }catch(e){return res.status(e instanceof EditorError?e.status:500).json({error:e instanceof EditorError?e.message:'Не удалось сохранить материал. Проверьте доступность хранилища.'});}
}

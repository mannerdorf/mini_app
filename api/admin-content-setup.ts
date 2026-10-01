import type {VercelRequest,VercelResponse} from '@vercel/node';
import {readFileSync} from 'node:fs';
import {getPool} from './_db.js';
import {verifyAdminToken,getAdminTokenFromRequest} from '../lib/adminAuth.js';
/** Fixed, idempotent CMS schema installation. No caller-provided SQL or file paths. */
export default async function handler(req:VercelRequest,res:VercelResponse){
 res.setHeader('Cache-Control','no-store');
 if(!verifyAdminToken(getAdminTokenFromRequest(req)))return res.status(401).json({error:'Требуется авторизация админа'});
 if(req.method!=='GET'&&req.method!=='POST'){res.setHeader('Allow','GET, POST');return res.status(405).end();}
 try{
  const pool=getPool();
  if(req.method==='POST'){const client=await pool.connect();try{await client.query(readFileSync(new URL('../migrations/123_media_editor.sql',import.meta.url),'utf8'));}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}
  const {rows}=await pool.query("select to_regclass('media_content_revisions') is not null and to_regclass('media_site_publications') is not null as ready");
  return res.status(200).json({ready:rows[0].ready});
 }catch{return res.status(503).json({error:'Не удалось подготовить хранилище редактора'});}
}

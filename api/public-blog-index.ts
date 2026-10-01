import type {VercelRequest,VercelResponse} from '@vercel/node';
import {getPool} from './_db.js';
import {readBlogIndex,publicBlogIndexHtml} from '../lib/mediaMarketing/publicBlogIndex.js';
export default async function handler(req:VercelRequest,res:VercelResponse){
 res.setHeader('Content-Type','text/html; charset=utf-8');
 if(req.method!=='GET'&&req.method!=='HEAD'){res.setHeader('Allow','GET, HEAD');return res.status(405).end();}
 const raw=req.query.page??'1';
 if(typeof raw!=='string'||! /^[1-9]\d{0,5}$/.test(raw)){res.setHeader('Cache-Control','no-store');return res.status(400).end();}
 const page=Number(raw);
 try{
  const data=await readBlogIndex(getPool(),page);
  if(page>1&&!data.articles.length){res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex');return res.status(404).end();}
  res.setHeader('Cache-Control','public, max-age=60');
  return req.method==='HEAD'?res.status(200).end():res.status(200).send(publicBlogIndexHtml(data,page));
 }catch{
  res.setHeader('Cache-Control','no-store');res.setHeader('Retry-After','60');
  return req.method==='HEAD'?res.status(503).end():res.status(503).send('<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="robots" content="noindex"><title>Блог временно недоступен — HAULZ</title><h1>Не удалось загрузить статьи</h1><p>Попробуйте немного позже.</p><a href="/">На главную</a></html>');
 }
}

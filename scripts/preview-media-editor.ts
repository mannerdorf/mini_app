/** Isolated local UI fixture; never points at the production database or AI service. */
import {createServer} from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import {build} from 'esbuild';
import {PGlite} from '@electric-sql/pglite';
import type {Pool} from 'pg';
import {editContent,readEditor,EditorError} from '../lib/mediaMarketing/editorStore.js';
const db=new PGlite();
const pool={query:(s:string,p?:unknown[])=>db.query(s,p),connect:async()=>({query:(s:string,p?:unknown[])=>db.query(s,p),release(){}})} as unknown as Pool;
await db.exec(readFileSync('migrations/102_media_marketing.sql','utf8'));await db.exec(readFileSync('migrations/123_media_editor.sql','utf8'));
await db.exec("insert into media_content_plans(title,planned_date,channels) values('Локальная проверка редактора','2026-10-01','[\"site\"]')");
await editContent(pool,1,1,'save',{article_slug:'local-test',article_title:'Локальный тест: подготовка груза',meta_description:'Тестовый материал — не для публикации',body_markdown:'## Направление\nМосква — Калининград.\n\n## Расчёт\nУкажите параметры груза.',author_name:'Тестовый редактор',source_notes:'Локальная фикстура для проверки интерфейса'},'local-test');
mkdirSync('/tmp/haulz-editor-ui',{recursive:true});
await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{MediaPlanEditor}from'./src/features/admin/sections/MediaPlanEditor';createRoot(document.getElementById('root')).render(<MediaPlanEditor adminToken="local-fixture" id={1} onChanged={()=>{}}/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,outfile:'/tmp/haulz-editor-ui/app.js',define:{'process.env.NODE_ENV':'"development"'}});
createServer(async(req,res)=>{try{if(req.url?.startsWith('/api/admin-content-editor')){let b='';for await(const chunk of req)b+=chunk;const x=b?JSON.parse(b):{};const data=req.method==='PATCH'?await editContent(pool,1,x.expected_revision,x.action,x,'local-ui'):await readEditor(pool,1);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));return;}if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(readFileSync('/tmp/haulz-editor-ui/app.js'));return;}res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>body{font:16px/1.5 Arial;margin:24px;background:#f6f7f9;--color-border:#d7dce3;--color-bg-primary:white;--color-bg-secondary:#e8ebf0}*{box-sizing:border-box}button{padding:8px;cursor:pointer}textarea{resize:vertical}#root{max-width:950px;margin:auto}</style><h1>Локальная проверка CMS — без публикации на сайте</h1><div id="root"></div><script src="/app.js"></script>');}catch(e){res.statusCode=e instanceof EditorError?e.status:500;res.end(JSON.stringify({error:(e as Error).message}));}}).listen(9047,'127.0.0.1',()=>console.log('http://127.0.0.1:9047'));

import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import type {Pool} from 'pg';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const sourceState=vi.hoisted(()=>({reasons:[] as string[],registry:'fixed'}));
vi.mock('./factorySources',async(importOriginal)=>{const original=await importOriginal<typeof import('./factorySources')>();return {...original,collectFacts:async(ids:unknown)=>{if(!Array.isArray(ids)||!ids.length)throw Error('facts');return {policy:'test',registry_hash:sourceState.registry,captured_at:'2026-10-01T08:00:00Z',facts:[],sources:[],reasons:[...sourceState.reasons]};}};});
import {enqueue,runOne,recover,type Provider} from './factoryQueue';
import {editContent} from './factoryEditor';
import {editContent as legacyEdit} from './editorStore';
let db:PGlite,pool:Pool,dir:string;
const draft={article_slug:'example',article_title:'Подготовка груза',meta_description:'Укажите направление и параметры груза.',body_markdown:'## Направление\nМосква — Калининград.',author_name:'Тестовый редактор',source_notes:'Проверено по источнику',channels:['site']};
const provider:Provider=async()=>({content:{...draft,body_markdown:'## Параметры\nУкажите вес и размеры.'},input_tokens:100,output_tokens:80,model:'test'});
function bind(){pool={query:(s:string,p?:unknown[])=>db.query(s,p),connect:async()=>({query:(s:string,p?:unknown[])=>db.query(s,p),release(){}})} as unknown as Pool;}
async function row(){return (await db.query<any>('select * from media_factory_jobs order by id desc limit 1')).rows[0];}
beforeEach(async()=>{sourceState.reasons=[];sourceState.registry='fixed';dir=mkdtempSync(join(tmpdir(),'haulz-factory-'));db=new PGlite(dir);bind();for(const name of ['102_media_marketing','123_media_editor','124_media_factory'])await db.exec(readFileSync(new URL(`../../migrations/${name}.sql`,import.meta.url),'utf8'));await db.exec("insert into media_content_plans(title,planned_date) values('Тема','2026-10-01')");await editContent(pool,1,1,'save',draft,'test');},30000);
afterEach(async()=>{await db.close();rmSync(dir,{recursive:true,force:true});});
it('deduplicates enqueue and restores queued jobs after database/process restart',async()=>{const a=await enqueue(pool,1,2,'check',['route'],'test'),b=await enqueue(pool,1,2,'check',['route'],'test');expect(a.id).toBe(b.id);await db.close();db=new PGlite(dir);bind();expect((await runOne(pool)).processed).toBe(true);expect((await row()).state).toBe('done');expect((await db.query('select * from media_factory_jobs')).rows).toHaveLength(1);});
it('publishes only a checked current revision with human confirmation; old publisher cannot bypass',async()=>{
 await expect(editContent(pool,1,2,'publish',{confirm_review:true},'test')).rejects.toMatchObject({status:422});
 await enqueue(pool,1,2,'check',['route'],'test');await runOne(pool);
 await expect(legacyEdit(pool,1,2,'publish',{confirm_review:true},'test')).rejects.toThrow('source-verified');
 await expect(editContent(pool,1,2,'publish',{},'test')).rejects.toMatchObject({status:422});
 await editContent(pool,1,2,'publish',{confirm_review:true},'test');
 await editContent(pool,1,2,'save',{body_markdown:'## Новый текст\nНужна проверка.'},'test');await expect(editContent(pool,1,3,'publish',{confirm_review:true},'test')).rejects.toMatchObject({status:422});
 expect((await db.query<any>('select revision from media_site_publications')).rows[0].revision).toBe(2);
});
it('holds unavailable/conflicting facts and rechecks sources immediately before publication',async()=>{
 sourceState.reasons=['Источник недоступен'];await enqueue(pool,1,2,'check',['route'],'test');await runOne(pool);expect((await row()).state).toBe('held');await expect(editContent(pool,1,2,'publish',{confirm_review:true},'test')).rejects.toMatchObject({status:422});
 sourceState.reasons=[];sourceState.registry='new';await enqueue(pool,1,2,'check',['route'],'test');await runOne(pool);sourceState.reasons=['Конфликт источников'];await expect(editContent(pool,1,2,'publish',{confirm_review:true},'test')).rejects.toMatchObject({status:422});
});
it('recovers before-provider lease loss and holds uncertain charged attempts without retry',async()=>{
 const j=await enqueue(pool,1,2,'generate',['route'],'test');await db.query("update media_factory_jobs set state='running',lease_token='lost',lease_until=now()-interval '1 minute' where id=$1",[j.id]);await db.query("insert into media_factory_attempts(job_id,lease_token) values($1,'lost')",[j.id]);await recover(pool);expect((await row()).state).toBe('queued');
 await db.query("update media_factory_jobs set state='running',lease_token='sent',lease_until=now()-interval '1 minute' where id=$1",[j.id]);await db.query("insert into media_factory_attempts(job_id,lease_token,provider_started,reserved_usd) values($1,'sent',true,0.1)",[j.id]);await recover(pool);expect((await row()).state).toBe('held');expect(await runOne(pool,provider)).toEqual({processed:false});
});
it('disabled generation and zero/exhausted budget never call provider',async()=>{
 const fn=vi.fn(provider);await enqueue(pool,1,2,'generate',['route'],'test');await runOne(pool,fn);expect(fn).not.toHaveBeenCalled();expect((await row()).reasons.join()).toContain('выключена');
 await db.exec("update media_factory_settings set generation_enabled=true,input_usd_per_million=1,output_usd_per_million=1;update media_factory_jobs set state='queued'");await runOne(pool,fn);expect(fn).not.toHaveBeenCalled();expect((await row()).reasons.join()).toContain('бюджет');
});
it('successful mocked generation records cost/tokens and saves only a new draft',async()=>{
 await db.exec('update media_factory_settings set generation_enabled=true,daily_budget_usd=1,input_usd_per_million=1,output_usd_per_million=1');await enqueue(pool,1,2,'generate',['route'],'test');await runOne(pool,provider);expect((await row()).state).toBe('done');expect((await row()).result_revision).toBe(3);expect((await db.query('select * from media_site_publications')).rows).toHaveLength(0);const a=(await db.query<any>('select * from media_factory_attempts')).rows[0];expect(a.input_tokens).toBe(100);expect(Number(a.estimated_usd)).toBeCloseTo(0.00018);
 await expect(editContent(pool,1,3,'publish',{confirm_review:true},'test')).rejects.toMatchObject({status:422});
});
it('late generation keeps concurrent edits and retains held result for review',async()=>{
 await db.exec('update media_factory_settings set generation_enabled=true,daily_budget_usd=1,input_usd_per_million=1,output_usd_per_million=1');await enqueue(pool,1,2,'generate',['route'],'test');await runOne(pool,async(a,p)=>{await editContent(pool,1,2,'save',{body_markdown:'## Ручные изменения\nСохранить.'},'human');return provider(a,p);});expect((await row()).state).toBe('held');expect((await row()).result).not.toBeNull();expect((await db.query<any>('select body_markdown from media_content_plans')).rows[0].body_markdown).toContain('Ручные');
});
it('provider errors do not trigger retry and keep reserved budget as unknown expense',async()=>{
 await db.exec('update media_factory_settings set generation_enabled=true,daily_budget_usd=1,input_usd_per_million=1,output_usd_per_million=1');await enqueue(pool,1,2,'generate',['route'],'test');const fn=vi.fn(async()=>{throw Error('timeout');});await runOne(pool,fn);await runOne(pool,fn);expect(fn).toHaveBeenCalledTimes(1);const a=(await db.query<any>('select * from media_factory_attempts')).rows[0];expect(a.estimated_usd).toBeNull();expect(Number(a.reserved_usd)).toBeGreaterThan(0);expect(a.state).toBe('uncertain');
});
it('quality violations and registry drift keep generated material held',async()=>{
 await db.exec('update media_factory_settings set generation_enabled=true,daily_budget_usd=1,input_usd_per_million=1,output_usd_per_million=1');await enqueue(pool,1,2,'generate',['route'],'test');await runOne(pool,async(a,p)=>{sourceState.registry='changed';const result=await provider(a,p);result.content.telegram_teaser='Цена 1000 рублей';return result;});expect((await row()).state).toBe('held');expect((await row()).reasons.length).toBeGreaterThan(1);expect((await db.query<any>('select revision from media_content_plans')).rows[0].revision).toBe(2);
});

import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {EditorError,draftFields} from './editorStore.js';
import {collectFacts,hash,resultIssues,FACTORY_POLICY,type FactPack} from './factorySources.js';
type Job={id:number;plan_id:number;revision:number;kind:'check'|'generate';fact_ids:string[];fact_pack:FactPack;assignment:Record<string,unknown>;lease_token:string;result:Record<string,unknown>|null};
export type ProviderResult={content:Record<string,unknown>;input_tokens:number;output_tokens:number;model:string};
export type Provider=(assignment:Record<string,unknown>,pack:FactPack)=>Promise<ProviderResult>;
export async function enqueue(pool:Pool,id:number,revision:number,kind:unknown,ids:unknown,actor:string){
 if(!Number.isSafeInteger(id)||!Number.isSafeInteger(revision)||!['check','generate'].includes(String(kind)))throw new EditorError(400,'Нужны материал, версия и вид задания');
 const plan=(await pool.query('select * from media_content_plans where id=$1',[id])).rows[0];
 if(!plan)throw new EditorError(404,'Материал не найден');if(plan.revision!==revision)throw new EditorError(409,'Сначала обновите материал');
 const pack=await collectFacts(ids);const factIds=[...new Set(ids as string[])].sort();
 const fingerprint=hash(JSON.stringify([id,revision,kind,factIds,pack.registry_hash,FACTORY_POLICY]));
 const row=(await pool.query(`insert into media_factory_jobs(plan_id,revision,kind,fingerprint,fact_ids,assignment,fact_pack,created_by) values($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8) on conflict(fingerprint) do update set fingerprint=excluded.fingerprint returning *`,[id,revision,kind,fingerprint,JSON.stringify(factIds),JSON.stringify(plan),JSON.stringify(pack),actor])).rows[0];
 return row;
}
export async function recover(client:Pick<PoolClient,'query'>){
 // Pre-provider crashes are safe to retry. A sent request may have been charged: never silently repeat it.
 await client.query(`update media_factory_attempts a set state=case when provider_started then 'uncertain' else 'interrupted' end,finished_at=now(),error_code='lease_expired' from media_factory_jobs j where a.job_id=j.id and a.lease_token=j.lease_token and j.state='running' and j.lease_until<now() and a.finished_at is null`);
 await client.query(`update media_factory_jobs j set state=case when exists(select 1 from media_factory_attempts a where a.job_id=j.id and a.provider_started and a.lease_token=j.lease_token) then 'held' else 'queued' end,reasons=case when exists(select 1 from media_factory_attempts a where a.job_id=j.id and a.provider_started and a.lease_token=j.lease_token) then '["Ответ модели после прерывания неизвестен. Автоповтор выключен; проверьте расход у провайдера."]'::jsonb else '[]'::jsonb end,lease_token=null,lease_until=null,updated_at=now() where state='running' and lease_until<now()`);
}
async function claim(pool:Pool):Promise<Job|null>{
 const c=await pool.connect();try{await c.query('BEGIN');await c.query('select id from media_factory_settings where id=1 for update');await recover(c);
 if((await c.query("select 1 from media_factory_jobs where state='running' limit 1")).rows.length){await c.query('COMMIT');return null;}
 const j=(await c.query("select * from media_factory_jobs where state='queued' order by created_at,id for update skip locked limit 1")).rows[0];if(!j){await c.query('COMMIT');return null;}
 const token=randomUUID();await c.query("update media_factory_jobs set state='running',lease_token=$2,lease_until=now()+interval '5 minutes',updated_at=now() where id=$1",[j.id,token]);await c.query('insert into media_factory_attempts(job_id,lease_token) values($1,$2)',[j.id,token]);await c.query('COMMIT');return {...j,lease_token:token};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
async function finish(pool:Pool,j:Job,reasons:string[],pack:FactPack,result:ProviderResult|null=null){
 const c=await pool.connect();try{await c.query('BEGIN');const locked=(await c.query("select * from media_factory_jobs where id=$1 and lease_token=$2 and state='running' for update",[j.id,j.lease_token])).rows[0];if(!locked){await c.query('ROLLBACK');return;}
 const plan=(await c.query('select revision from media_content_plans where id=$1 for update',[j.plan_id])).rows[0];if(plan?.revision!==j.revision)reasons.push('Версия изменилась. Результат сохранён в задании, чужие правки не перезаписаны.');
 let outputRevision:null|number=null;
 if(result&&!reasons.length){
  const values=draftFields(result.content);const entries=Object.entries(values);if(!entries.length)reasons.push('Модель не вернула поля материала');
  else{await c.query("select set_config('haulz.editor_actor','factory-worker',true)");const set=entries.map(([key],i)=>`${key}=$${i+2}${key==='channels'?'::jsonb':''}`).join(',');
   outputRevision=(await c.query(`update media_content_plans set ${set},status='draft' where id=$1 returning revision`,[j.plan_id,...entries.map(([,v])=>v)])).rows[0].revision;
  }
 }
 await c.query(`update media_factory_jobs set state=$3,reasons=$4::jsonb,fact_pack=$5::jsonb,result=$6::jsonb,result_revision=$7,lease_token=null,lease_until=null,updated_at=now() where id=$1 and lease_token=$2`,[j.id,j.lease_token,reasons.length?'held':'done',JSON.stringify(reasons),JSON.stringify(pack),result?JSON.stringify(result.content):null,outputRevision]);
 await c.query("update media_factory_attempts set state=$3,finished_at=now(),error_code=$4 where job_id=$1 and lease_token=$2",[j.id,j.lease_token,reasons.length?'held':'done',reasons.length?'quality_or_source_hold':null]);await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
export async function runOne(pool:Pool,provider?:Provider){
 const j=await claim(pool);if(!j)return {processed:false};let pack=j.fact_pack;
 try{
  pack=await collectFacts(j.fact_ids);const reasons=[...pack.reasons];
  if(pack.registry_hash!==j.fact_pack.registry_hash)reasons.push('Реестр изменился после постановки задания. Создайте задание с актуальным пакетом.');
  if(j.kind==='check'){
   reasons.push(...resultIssues(j.assignment,pack));
   const duplicates=await pool.query("select plan_id from media_site_publications where plan_id<>$1 and snapshot->>'body_markdown'=$2 limit 1",[j.plan_id,j.assignment.body_markdown||'']);
   if(duplicates.rows.length)reasons.push('Текст дублирует опубликованный материал');
   await finish(pool,j,[...new Set(reasons)],pack);return {processed:true,id:j.id};
  }
  if(reasons.length){await finish(pool,j,reasons,pack);return {processed:true,id:j.id};}
  const c=await pool.connect();let canRun=false;
  try{await c.query('BEGIN');const settings=(await c.query('select * from media_factory_settings where id=1 for update')).rows[0];
   const active=(await c.query("select id from media_factory_jobs where id=$1 and lease_token=$2 and state='running' and lease_until>now() for update",[j.id,j.lease_token])).rows.length;
   if(!active){await c.query('COMMIT');return {processed:true,id:j.id,held:true};}
   // UTF-8 bytes + protocol allowance is deliberately conservative. Actual billing is not a guessed price.
   const inputBound=Buffer.byteLength(JSON.stringify(j.assignment)+JSON.stringify(pack),'utf8')+4096;
   const reserve=(inputBound*Number(settings.input_usd_per_million)+2048*Number(settings.output_usd_per_million))/1e6;
   const spent=Number((await c.query("select coalesce(sum(reserved_usd),0) as used from media_factory_attempts where started_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'")).rows[0].used);
   if(!provider||!settings.generation_enabled)reasons.push('Платная генерация выключена');
   else if(inputBound>30000)reasons.push('Слишком большое задание: сократите текст и источники');
   else if(Number(settings.input_usd_per_million)<=0||Number(settings.output_usd_per_million)<=0||Number(settings.daily_budget_usd)<=0||spent+reserve>Number(settings.daily_budget_usd))reasons.push('Не настроен тариф/бюджет или исчерпан дневной лимит');
   else{await c.query("update media_factory_attempts set provider_started=true,reserved_usd=$3,model='gpt-4o-mini',pricing=$4::jsonb where job_id=$1 and lease_token=$2",[j.id,j.lease_token,reserve,JSON.stringify(settings)]);canRun=true;}
   await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  if(!canRun){await finish(pool,j,reasons,pack);return {processed:true,id:j.id};}
  const result=await provider!(j.assignment,pack);
  const attempts=await pool.query('select pricing from media_factory_attempts where job_id=$1 and lease_token=$2',[j.id,j.lease_token]);const rates=attempts.rows[0].pricing;
  await pool.query('update media_factory_attempts set input_tokens=$3,output_tokens=$4,estimated_usd=$5 where job_id=$1 and lease_token=$2',[j.id,j.lease_token,result.input_tokens,result.output_tokens,(result.input_tokens*Number(rates.input_usd_per_million)+result.output_tokens*Number(rates.output_usd_per_million))/1e6]);
  pack=await collectFacts(j.fact_ids);const issues=resultIssues({...j.assignment,...result.content},pack);
  if(pack.registry_hash!==j.fact_pack.registry_hash)issues.push('Реестр изменился во время генерации');
  await finish(pool,j,issues,pack,result);return {processed:true,id:j.id};
 }catch{
  // Provider/network/parse errors can occur after billing. Retain reservation and never auto-retry.
  await pool.query("update media_factory_attempts set state='uncertain',error_code='worker_or_provider_error',finished_at=now() where job_id=$1 and lease_token=$2",[j.id,j.lease_token]);
  await pool.query("update media_factory_jobs set state='held',reasons='[\"Ошибка обработки. Если запрос модели начат, расход может быть неизвестен; повтор автоматически не выполняется.\"]'::jsonb,lease_token=null,lease_until=null,updated_at=now() where id=$1 and lease_token=$2",[j.id,j.lease_token]);return {processed:true,id:j.id,held:true};
 }
}
export async function publicationGate(client:PoolClient,id:number,revision:number){
 const j=(await client.query("select * from media_factory_jobs where plan_id=$1 and revision=$2 and kind='check' and state='done' order by id desc limit 1",[id,revision])).rows[0];
 if(!j)throw new EditorError(422,'Сначала выполните проверку источников этой версии в очереди');
 const fresh=await collectFacts(j.fact_ids);if(fresh.registry_hash!==j.fact_pack.registry_hash||fresh.reasons.length)throw new EditorError(422,'Источники изменились, недоступны или устарели. Нужна повторная проверка.');
 await client.query("select set_config('haulz.factory_publish','verified',true)");
}

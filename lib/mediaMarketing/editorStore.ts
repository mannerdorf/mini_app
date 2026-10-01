import type {Pool} from 'pg';
import {parseChannels} from './channels.js';
export class EditorError extends Error { constructor(public status:number,message:string){super(message);} }
const fields=['title','brief','planned_date','target_keywords','channels','article_slug','article_title','meta_description','body_markdown','telegram_teaser','email_subject','email_teaser','author_name','source_notes'] as const;
export function draftFields(input:Record<string,unknown>){
 const out:Record<string,unknown>={};
 for(const k of fields){if(input[k]===undefined)continue;if(k==='channels'){
  if(!Array.isArray(input[k])||parseChannels(input[k]).length!==input[k].length)throw new EditorError(400,'Неизвестный канал');out[k]=JSON.stringify([...new Set(input[k])]);
 }else {if(input[k]===null){out[k]='';continue;}if(typeof input[k]!=='string'||input[k].length>(k==='body_markdown'?100000:10000))throw new EditorError(400,`Некорректное поле ${k}`);out[k]=input[k];}}
 if('planned_date' in out && (!/^\d{4}-\d{2}-\d{2}$/.test(String(out.planned_date))||!Number.isFinite(Date.parse(String(out.planned_date)))||new Date(String(out.planned_date)).toISOString().slice(0,10)!==out.planned_date))throw new EditorError(400,'Некорректная дата');
 return out;
}
export function publicationErrors(plan:Record<string,unknown>):string[]{
 const errors:string[]=[];
 if(!parseChannels(plan.channels).includes('site'))errors.push('Для публикации выберите канал «Сайт / блог»');
 if(!/^[a-z0-9][a-z0-9_-]{0,120}$/.test(String(plan.article_slug||'')))errors.push('Адрес: строчные латинские буквы, цифры, дефис или подчёркивание');
 for(const [field,label] of [['article_title','Заголовок'],['meta_description','Краткий ответ / описание'],['body_markdown','Текст'],['author_name','Автор'],['source_notes','Источники и результат проверки фактов']])if(!String(plan[field]||'').trim())errors.push(`${label}: заполните поле`);
 if(/\]\(\s*(javascript|data):/i.test(String(plan.body_markdown||'')))errors.push('Недопустимая ссылка в тексте');
 return errors;
}
export async function readEditor(pool:Pool,id:number){
 const {rows}=await pool.query('select *,planned_date::text as planned_date from media_content_plans where id=$1',[id]);if(!rows[0])throw new EditorError(404,'Материал не найден');
 const publication=(await pool.query('select * from media_site_publications where plan_id=$1',[id])).rows[0]||null;
 const revisions=(await pool.query('select revision,created_at,actor from media_content_revisions where plan_id=$1 order by revision desc limit 100',[id])).rows;
 return {plan:rows[0],publication,revisions,errors:publicationErrors(rows[0])};
}
export async function editContent(pool:Pool,id:number,expected:number,action:string,input:Record<string,unknown>,actor:string){
 if(!Number.isSafeInteger(id)||id<=0||!Number.isSafeInteger(expected)||expected<1)throw new EditorError(400,'Нужны id и текущая версия');
 const client=await pool.connect();
 try{
  await client.query('BEGIN');await client.query("select set_config('haulz.editor_actor',$1,true)",[actor]);
  const old=(await client.query('select * from media_content_plans where id=$1 for update',[id])).rows[0];
  if(!old)throw new EditorError(404,'Материал не найден');if(old.revision!==expected)throw new EditorError(409,'Материал изменён другим редактором. Обновите его и сравните изменения.');
  if(action==='publish'){
   const errors=publicationErrors(old);if(input.confirm_review!==true)errors.push('Подтвердите проверку именно этой сохранённой версии');
   if(errors.length)throw new EditorError(422,errors.join('\n'));
   const live=(await client.query('select slug from media_site_publications where plan_id=$1',[id])).rows[0];
   if(live&&live.slug!==old.article_slug)throw new EditorError(422,'Адрес опубликованной статьи менять нельзя: сначала нужен план редиректа');
   await client.query(`insert into media_site_publications(plan_id,revision,slug,snapshot,published_by) values($1,$2,$3,$4::jsonb,$5)
    on conflict(plan_id) do update set revision=excluded.revision,snapshot=excluded.snapshot,published_at=now(),published_by=excluded.published_by`,[id,old.revision,old.article_slug,JSON.stringify(old),actor]);
  }else if(action==='save'||action==='restore'||action==='generated'){
   let source=input;
   if(action==='restore'){
    if(!Number.isSafeInteger(input.restore_revision)||Number(input.restore_revision)<1)throw new EditorError(400,'Некорректная версия');
    const prior=(await client.query('select snapshot from media_content_revisions where plan_id=$1 and revision=$2',[id,input.restore_revision])).rows[0];
    if(!prior)throw new EditorError(404,'Версия не найдена');source=prior.snapshot;
   }
   const changes=draftFields(source);const entries=Object.entries(changes);if(!entries.length)throw new EditorError(400,'Нет изменений');
   const assignments=entries.map(([k],i)=>`${k}=$${i+2}${k==='channels'?'::jsonb':''}`);
   await client.query(`update media_content_plans set ${assignments.join(',')},status='draft' where id=$1`,[id,...entries.map(([,v])=>v)]);
  }else throw new EditorError(400,'Неизвестное действие');
  await client.query('COMMIT');
 }catch(e){await client.query('ROLLBACK');if((e as {code?:string}).code==='23505')throw new EditorError(409,'Этот адрес уже опубликован для другого материала');throw e;}finally{client.release();}
 return readEditor(pool,id);
}

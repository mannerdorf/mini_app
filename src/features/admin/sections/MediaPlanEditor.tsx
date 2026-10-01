import React,{useState,useEffect} from 'react';
import {MediaFactoryQueue} from './MediaFactoryQueue';
import {adminAuthHeaders} from '../../../api/client/admin/auth';
import {markdownToSafeHtml} from '../../../../lib/mediaMarketing/safePublicMarkdown';
import {MEDIA_PUBLISH_CHANNELS} from '../../../../lib/mediaMarketing/channels';
type Draft={id:number;revision:number;title:string;article_title:string;article_slug:string;meta_description:string;body_markdown:string;author_name:string;source_notes:string;telegram_teaser:string;email_subject:string;email_teaser:string;channels:string[]};
type State={plan:Draft;publication:null|{revision:number;slug:string;snapshot:Draft;published_at:string};revisions:{revision:number;actor:string;created_at:string}[];errors:string[]};
const labels:Record<string,string>={article_title:'Заголовок',article_slug:'Адрес статьи',meta_description:'Краткий ответ / описание',author_name:'Автор',source_notes:'Источники и результат проверки фактов',body_markdown:'Текст (Markdown)',telegram_teaser:'Telegram: текст анонса',email_subject:'Email: тема',email_teaser:'Email: текст'};
export function MediaPlanEditor({adminToken,id,onChanged}:{adminToken:string;id:number;onChanged:()=>unknown}){
 const [data,setData]=useState<State|null>(null),[draft,setDraft]=useState<Draft|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[review,setReview]=useState(false),[preview,setPreview]=useState(false);
 const headers={...adminAuthHeaders(adminToken),'Content-Type':'application/json'};
 async function read(){const r=await fetch(`/api/admin-content-editor?id=${id}`,{headers});const d=await r.json();if(!r.ok)throw Error(d.error);setData(d);setDraft(d.plan);setReview(false);}
 useEffect(()=>{let active=true;fetch(`/api/admin-content-editor?id=${id}`,{headers}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);if(active){setData(d);setDraft(d.plan);}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[id,adminToken]);
 if(!data||!draft)return <p role="status">{error||'Загружаем редактор…'}</p>;
 const dirty=JSON.stringify(draft)!==JSON.stringify(data.plan);
 async function act(action:string,extra:Record<string,unknown>={}){
  if(!data||!draft)return;setBusy(true);setError('');
  try{const r=await fetch('/api/admin-content-editor',{method:'PATCH',headers,body:JSON.stringify({...(action==='save'?draft:{}),id,expected_revision:data.plan.revision,action,...extra})});const d=await r.json();if(!r.ok)throw Error(d.error);setData(d);setDraft(d.plan);setReview(false);onChanged();}catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 const update=(key:string,value:unknown)=>{setDraft(p=>p?{...p,[key]:value}:p);setReview(false);};
 return <section aria-label="Редактор материала" style={{border:'1px solid var(--color-border)',padding:20,borderRadius:16}}>
  <h3>Рабочая версия {data.plan.revision}</h3><p>{data.publication?`На сайте опубликована версия ${data.publication.revision}. Правки не меняют её до публикации.`:'На сайте ещё не опубликовано.'}</p>
  {error&&<p role="alert" style={{whiteSpace:'pre-wrap',color:'#b42318'}}>{error}</p>}
  <fieldset disabled={busy} style={{border:0,padding:0}}><legend>Содержание</legend>
  {Object.entries(labels).map(([key,label])=><label key={key} style={{display:'block',margin:'12px 0'}}>{label}<textarea aria-label={label} value={String(draft[key as keyof Draft]||'')} onChange={e=>update(key,e.target.value)} rows={key==='body_markdown'?14:key==='source_notes'?4:2} style={{display:'block',width:'100%',padding:10,font:'inherit',color:'inherit',background:'var(--color-bg-primary)',border:'1px solid var(--color-border)',borderRadius:8}}/></label>)}
  <p>Каналы подготовки материала</p>{MEDIA_PUBLISH_CHANNELS.map(c=><label key={c.id} style={{display:'inline-block',margin:'6px 12px 6px 0'}}><input type="checkbox" checked={draft.channels.includes(c.id)} onChange={e=>update('channels',e.target.checked?[...draft.channels,c.id]:draft.channels.filter(x=>x!==c.id))}/> {c.label}</label>)}
  <p>Сайт: {data.publication?'опубликован':'не опубликован'}. Остальные выбранные каналы: подготовка текста, отправка не выполнялась.</p>
  <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:16}}><button className="filter-button" onClick={()=>act('save')} disabled={!dirty}>Сохранить черновик</button><button className="filter-button" onClick={()=>setPreview(!preview)}>Предпросмотр и изменения</button><button className="filter-button" onClick={()=>read().catch(e=>setError(e.message))}>Обновить с сервера</button></div>
  {preview&&<><h4>Предпросмотр рабочего текста</h4><iframe title="Предпросмотр статьи" sandbox="" srcDoc={`<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>body{font:16px/1.7 Arial;padding:20px;overflow-wrap:anywhere}</style>${markdownToSafeHtml('# '+(draft.article_title||draft.title)+'\n\n'+(draft.meta_description||'')+'\n\n'+(draft.body_markdown||''))}`} style={{width:'100%',height:420,border:'1px solid #ddd'}}/><h4>Опубликованная версия → рабочая версия</h4><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(230px,1fr))',gap:12}}>{[data.publication?.snapshot,draft].map((p,i)=><pre key={i} style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:320,overflow:'auto',padding:12,background:'var(--color-bg-secondary)'}}>{i===0?'На сайте\n':'Рабочая версия\n'}{p?Object.entries(labels).map(([k,l])=>`${l}: ${String(p[k as keyof Draft]||'')}`).join('\n\n'):'Пока нет публикации'}</pre>)}</div></>}
  <MediaFactoryQueue adminToken={adminToken} id={id} revision={data.plan.revision} dirty={dirty} onChanged={onChanged}/>
  <p>{dirty?'Сначала сохраните изменения.':data.errors.join(' · ')}</p>
  <label><input type="checkbox" checked={review} onChange={e=>setReview(e.target.checked)} disabled={dirty}/> Проверил(а) предпросмотр, источники и факты сохранённой версии</label>
  <p><button className="filter-button" disabled={dirty||!preview||!review||data.errors.length>0} onClick={()=>act('publish',{confirm_review:true})}>Опубликовать сохранённую версию на сайт</button></p>
  {data.publication&&<a href={`/blog/${data.publication.slug}`} target="_blank" rel="noreferrer">Открыть опубликованную статью</a>}
  <h4>История версий</h4>{data.revisions.map(v=><div key={v.revision} style={{marginBottom:8}}>Версия {v.revision} · {v.actor} · {new Date(v.created_at).toLocaleString('ru-RU')} <button className="filter-button" disabled={dirty||v.revision===data.plan.revision} onClick={()=>act('restore',{restore_revision:v.revision})}>Восстановить в черновик</button></div>)}
  </fieldset>
 </section>;
}

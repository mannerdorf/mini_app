import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {EditorError} from './editorStore.js';
export const FACTORY_POLICY='haulz-facts-v1';
const root=fileURLToPath(new URL('../../',import.meta.url));
export const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export type Fact={id:string;claim:string;value:unknown;status:string;valid_until?:string;sources:{reference:string;sha256:string|null}[];limits:string};
export type FactPack={policy:string;registry_hash:string;captured_at:string;facts:Fact[];sources:{reference:string;expected:string|null;actual:string|null;state:string}[];reasons:string[]};
export async function registry(){return JSON.parse(await readFile(resolve(root,'docs/facts/haulz-facts-2026-10-01.json'),'utf8')) as {facts:Fact[]};}
async function deployedFrontendSources():Promise<Record<string,string>>{
 const r=await fetch('https://haulz.space/content-source-manifest.json',{redirect:'error',signal:AbortSignal.timeout(5000)});
 if(!r.ok)throw Error('Source manifest unavailable');
 const reader=r.body?.getReader();if(!reader)throw Error('Empty manifest');let text='',bytes=0;const decoder=new TextDecoder();
 try{while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.length;if(bytes>20000)throw Error('Oversized manifest');text+=decoder.decode(chunk.value,{stream:true});}}finally{await reader.cancel();}
 const parsed=JSON.parse(text);if(parsed.version!==1||!parsed.sources||typeof parsed.sources!=='object')throw Error('Invalid source manifest');return parsed.sources;
}
export async function collectFacts(ids:unknown,options:{now?:Date;load?:()=>Promise<{facts:Fact[]}>;read?:(path:string)=>Promise<string>;frontend?:()=>Promise<Record<string,string>>}={}):Promise<FactPack>{
 if(!Array.isArray(ids)||!ids.length||ids.length>20||ids.some(x=>typeof x!=='string'))throw new EditorError(400,'Выберите от 1 до 20 фактов');
 const selected=[...new Set(ids as string[])].sort();const now=options.now||new Date();
 const pack:FactPack={policy:FACTORY_POLICY,registry_hash:'',captured_at:now.toISOString(),facts:[],sources:[],reasons:[]};
 let r:{facts:Fact[]};try{r=await(options.load||registry)();pack.registry_hash=hash(JSON.stringify(r));}catch{pack.reasons.push('Реестр фактов недоступен');return pack;}
 let frontend:Record<string,string>|null=null;let frontendRead=false;
 for(const id of selected){
  const variants=r.facts.filter(f=>f.id===id);if(variants.length!==1){pack.reasons.push(`${id}: факт отсутствует или конфликтует`);continue;}
  const f=variants[0];pack.facts.push(f);
  if(!['owner_confirmed','code_verified'].includes(f.status))pack.reasons.push(`${id}: нет подтверждения`);
  if(!f.valid_until||!Number.isFinite(Date.parse(f.valid_until))||Date.parse(f.valid_until+'T00:00:00Z')<=now.getTime())pack.reasons.push(`${id}: истёк срок проверки`);
  if(!f.sources?.length)pack.reasons.push(`${id}: нет источников`);
  for(const source of f.sources||[]){
   if(pack.sources.some(s=>s.reference===source.reference&&s.expected===source.sha256))continue;
   let actual:string|null=null,state='unavailable';
   // Only fixed repository registry paths are read. No caller paths or network/SSRF.
   if(source.reference==='conversation:2026-10-01:owner-confirmed-all-listed-services'&&f.status==='owner_confirmed'&&!source.sha256){state='owner_confirmation';}
   else if(source.reference.startsWith('src/')&&source.sha256){
    if(!frontendRead){frontendRead=true;try{frontend=await(options.frontend||deployedFrontendSources)();}catch{/* unavailable manifest blocks publication */}}
    actual=frontend?.[source.reference]||null;state=actual?(actual===source.sha256?'verified':'conflict'):'unavailable';
   }
   else if(source.sha256&&/^[a-f0-9]{64}$/.test(source.sha256)&&!source.reference.includes('..')&&!source.reference.includes(':')){
    const path=resolve(root,source.reference);
    if(path.startsWith(root+sep)||path.startsWith(root.endsWith(sep)?root:root+sep))try{actual=hash(await(options.read||((p)=>readFile(p,'utf8')))(path));state=actual===source.sha256?'verified':'conflict';}catch{/* recorded below */}
   }
   pack.sources.push({reference:source.reference,expected:source.sha256,actual,state});
   if(!['verified','owner_confirmation'].includes(state))pack.reasons.push(`${id}: источник ${source.reference} ${state==='conflict'?'изменился — нужна сверка':'недоступен'}`);
  }
 }
 return pack;
}
export function resultIssues(plan:Record<string,unknown>,pack:FactPack):string[]{
 const issues=[...pack.reasons];const body=String(plan.body_markdown||'');
 const text=['article_title','meta_description','body_markdown','telegram_teaser','email_subject','email_teaser'].map(k=>String(plan[k]||'')).join('\n');
 if(!body.trim())issues.push('Нет текста для проверки');
 if(!/^##\s+/m.test(body))issues.push('Добавьте смысловые разделы H2');
 if(String(plan.meta_description||'').length>160)issues.push('Описание длиннее 160 символов');
 if(/\d[\d\s.,–—-]*\s*(?:₽|руб|дн|день|дней|час|сут|%)/i.test(text))issues.push('Числовое обещание цены, срока или результата требует отдельного подтверждённого расчёта');
 if(/гарантиру|гарантирован|сам[ыо]й (?:низк|быстр)|без исключений/i.test(text))issues.push('Безусловное обещание требует доказательств');
 if(/опасн|санкцион|акцизн|таможенн[а-я ]*(?:документ|деклара|правил)|код[а-я ]*ТН\s*ВЭД/i.test(text))issues.push('Специальные грузы и таможенные требования требуют экспертной проверки');
 if(/\]\(\s*(?:javascript|data):|<script|<iframe/i.test(text))issues.push('Недопустимое содержимое');
 return [...new Set(issues)];
}

import type { Pool } from 'pg';
import { createCipheriv,createDecipheriv,createHash,randomBytes,randomUUID } from 'node:crypto';
import { generatePassword,hashPassword } from './passwordUtils.js';
import { sendRegistrationEmail } from './sendRegistrationEmail.js';
import { sendLkAddTo1c } from './sendLkTo1c.js';
import { writeAuditLog } from './adminAuditLog.js';

const DEFAULT_PERMISSIONS = {
  cms_access: false,
  home: true,
  dashboard: true,
  cargo: true,
  doc_invoices: true,
  doc_acts: true,
  doc_orders: false,
  doc_sendings: false,
  doc_claims: false,
  doc_contracts: false,
  doc_acts_settlement: false,
  doc_tariffs: false,
  haulz: false,
  eor: false,
  chat: true,
  service_mode: false,
  analytics: false,
  supervisor: false,
};

export type Candidate={inn:string;customer_name:string;email:string;state:'new'|'pending'|'needs_review';reason?:string};
const normalize=(v:string)=>String(v||'').trim().toLowerCase();
export const autoRegistrationEnabled=()=>normalize(process.env.AUTO_REGISTER_FROM_CUSTOMERS||'')==='true';
function encryptionKey() {
  const secret=process.env.AUTO_REGISTER_ENCRYPTION_KEY||process.env.ADMIN_TOKEN_SECRET;
  if(!secret)throw new Error('Не задан ключ шифрования очереди регистрации');
  return createHash('sha256').update('haulz.customer-onboarding.v1:'+secret).digest();
}
export function sealPassword(password:string) {
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv);
  const body=Buffer.concat([cipher.update(password,'utf8'),cipher.final()]);
  return [iv,cipher.getAuthTag(),body].map(b=>b.toString('base64')).join('.');
}
function openPassword(value:string) {
  const [iv,tag,body]=value.split('.').map(v=>Buffer.from(v,'base64'));
  const cipher=createDecipheriv('aes-256-gcm',encryptionKey(),iv);cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(body),cipher.final()]).toString('utf8');
}
export async function collectCustomerCandidates(pool:Pool,q='') {
  const customers=(await pool.query(`SELECT inn,customer_name,email FROM cache_customers ORDER BY customer_name`)).rows;
  const users=(await pool.query('SELECT id,login,inn,active FROM registered_users')).rows;
  const companies=(await pool.query('SELECT login,inn FROM account_companies')).rows;
  const pending=(await pool.query('SELECT login,inn,needs_review,last_error FROM customer_onboarding WHERE NOT lk_done OR NOT email_done')).rows;
  const usersByLogin=new Map(users.map(u=>[normalize(u.login),u]));
  const linked=new Set(companies.map(c=>normalize(c.login)+'|'+c.inn));
  const jobs=new Map(pending.map(p=>[p.login,p]));
  const candidates:Candidate[]=[];let withEmail=0,validEmail=0,alreadyRegistered=0;
  for(const c of customers) {
    const email=normalize(c.email);if(email)withEmail++;
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))continue;validEmail++;
    const user=usersByLogin.get(email),queue=jobs.get(email);
    let candidate:Candidate|undefined;
    if(user&&user.inn!==c.inn&&!linked.has(email+'|'+c.inn))candidate={...c,email,state:'needs_review',reason:'Email уже используется. Требуется проверка доступа к этому ИНН.'};
    else if(queue&&queue.inn===c.inn)candidate={...c,email,state:queue.needs_review?'needs_review':'pending',reason:queue.last_error||'Регистрация создана, ожидаются завершение передачи в 1С и письмо.'};
    else if(user)alreadyRegistered++;
    else candidate={...c,email,state:'new'};
    if(candidate&&(!q||[c.inn,c.customer_name,email].some(v=>String(v).toLowerCase().includes(q.toLowerCase()))))candidates.push(candidate);
  }
  return {candidates,stats:{total:customers.length,withEmail,validEmail,alreadyRegistered}};
}

/** Creation, company access and delivery tasks are committed together. Same email never grants another INN. */
export async function enqueueCustomer(pool:Pool,c:Candidate) {
  const db=await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',['onboard:'+c.email]);
    const existing=(await db.query('SELECT id FROM registered_users WHERE lower(trim(login))=$1',[c.email])).rows;
    if(existing.length){await db.query('COMMIT');return false;}
    // Recheck cache under lock: never register a stale email supplied by the client.
    const current=(await db.query('SELECT email FROM cache_customers WHERE inn=$1 FOR SHARE',[c.inn])).rows[0];
    if(!current||normalize(current.email)!==c.email){await db.query('COMMIT');return false;}
    const password=generatePassword(12),cipher=sealPassword(password),hash=hashPassword(password);
    const user=(await db.query(`INSERT INTO registered_users(login,password_hash,inn,company_name,permissions,financial_access,access_all_inns)
      VALUES($1,$2,$3,$4,$5,true,false) RETURNING id`,[c.email,hash,c.inn,c.customer_name,JSON.stringify(DEFAULT_PERMISSIONS)])).rows[0];
    await db.query('INSERT INTO account_companies(login,inn,name) VALUES($1,$2,$3)',[c.email,c.inn,c.customer_name]);
    await db.query(`INSERT INTO customer_onboarding(login,inn,customer_name,user_id,password_cipher,initial_password_hash)
      VALUES($1,$2,$3,$4,$5,$6)`,[c.email,c.inn,c.customer_name,user.id,cipher,hash]);
    await db.query(`INSERT INTO admin_audit_log(action,target_type,target_id,details) VALUES('auto_user_register','user',$1,$2)`,[String(user.id),JSON.stringify({login:c.email,inn:c.inn,source:'customer_onboarding'})]);
    await db.query('COMMIT');return true;
  } catch(e) {await db.query('ROLLBACK');throw e;}finally{db.release();}
}
type Services={sendLk:typeof sendLkAddTo1c;sendEmail:typeof sendRegistrationEmail};
export async function processCustomerOnboarding(pool:Pool,options:{limit?:number;inns?:string[];services?:Services}={}) {
  if(!autoRegistrationEnabled())return {enabled:false,processed:0,created:0};
  const services=options.services??{sendLk:sendLkAddTo1c,sendEmail:sendRegistrationEmail};
  const configured=Number.parseInt(process.env.AUTO_REGISTER_MAX_PER_RUN||'10',10)||10;
  const limit=Math.max(1,Math.min(200,configured,options.limit||configured));
  const delay=Math.max(0,Math.min(30000,Number(process.env.AUTO_REGISTER_EMAIL_DELAY_MS)||0));
  let created=0,processed=0,email_sent=0,email_failed=0;
  const errors:string[]=[];
  const {candidates}=await collectCustomerCandidates(pool);
  const allowed=(c:Candidate)=>!options.inns?.length||options.inns.includes(c.inn);
  for(const c of candidates.filter(c=>c.state==='new'&&allowed(c)).slice(0,limit)) {
    try {if(await enqueueCustomer(pool,c))created++;}catch{errors.push('Не удалось создать пользователя и очередь регистрации');}
  }
  const started=Date.now();let sentOnce=false;
  while(processed<limit&&Date.now()-started<45000) {
    const token=randomUUID();
    const row=(await pool.query(`UPDATE customer_onboarding SET token=$1,lease_until=now()+interval '5 minutes',updated_at=now()
      WHERE login=(SELECT login FROM customer_onboarding WHERE NOT needs_review AND (NOT lk_done OR NOT email_done)
        AND next_at<=now() AND (lease_until IS NULL OR lease_until<now()) AND ($2::text[] IS NULL OR inn=ANY($2))
        ORDER BY next_at,created_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`,[token,options.inns?.length?options.inns:null])).rows[0];
    if(!row)break;processed++;
    const update=async(sql:string,values:unknown[]=[])=>pool.query(`UPDATE customer_onboarding SET ${sql},updated_at=now() WHERE login=$1 AND token=$2`,[row.login,token,...values]);
    try {
      const user=(await pool.query('SELECT active,password_hash,inn FROM registered_users WHERE id=$1 AND login=$2',[row.user_id,row.login])).rows[0];
      const linked=(await pool.query('SELECT 1 FROM account_companies WHERE login=$1 AND inn=$2',[row.login,row.inn])).rows.length;
      if(!user||user.active===false||(user.inn!==row.inn&&!linked)) {
        await update("needs_review=true,last_error='Требуется проверка пользователя и доступа к ИНН',token=NULL,lease_until=NULL");continue;
      }
      const failures:string[]=[];
      if(!row.lk_done) {
        const r=await services.sendLk({inn:row.inn,email:row.login});
        if(r.ok){await update('lk_done=true');await writeAuditLog(pool,{action:'integration_sendlk_sent',target_type:'user',target_id:row.user_id,details:{source:'customer_onboarding'}});}
        else {
          failures.push('Передача доступа в 1С не завершена');
          await writeAuditLog(pool,{action:'integration_sendlk_failed',target_type:'user',target_id:row.user_id,details:{source:'customer_onboarding',status:r.status??null}});
        }
      }
      if(!row.email_done) {
        if(user.password_hash!==row.initial_password_hash||!row.password_cipher) {
          await update("needs_review=true,last_error='Пароль изменён: требуется проверка отправки приглашения',token=NULL,lease_until=NULL");continue;
        }
        if(sentOnce&&delay)await new Promise(resolve=>setTimeout(resolve,delay));sentOnce=true;
        const r=await services.sendEmail(pool,row.login,row.login,openPassword(row.password_cipher),row.customer_name,{timeoutMs:15000});
        if(r.ok){email_sent++;await update('email_done=true,password_cipher=NULL');await writeAuditLog(pool,{action:'email_delivery_registration_sent',target_type:'user',target_id:row.user_id,details:{source:'customer_onboarding'}});}
        else {email_failed++;failures.push('Письмо приглашения не отправлено');await writeAuditLog(pool,{action:'email_delivery_registration_failed',target_type:'user',target_id:row.user_id,details:{source:'customer_onboarding'}});}
      }
      await update(`last_error=$3,attempts=attempts+1,next_at=CASE WHEN $3::text IS NULL THEN now() ELSE now()+least(360,power(2,least(attempts,7))*5)*interval '1 minute' END,token=NULL,lease_until=NULL`,[failures.join('; ')||null]);
    }catch {
      await update("last_error='Незавершённая регистрация: будет повторена',attempts=attempts+1,next_at=now()+interval '5 minutes',token=NULL,lease_until=NULL");errors.push('Незавершённый шаг регистрации сохранён для повтора');
    }
  }
  const remaining=(await collectCustomerCandidates(pool)).candidates;
  return {enabled:true,processed,created,skipped_existing:0,email_sent,email_failed,remaining_candidates:remaining.filter(c=>c.state!=='needs_review').length,needs_review:remaining.filter(c=>c.state==='needs_review').length,run_limit:limit,email_delay_ms:delay,email_jitter_ms:0,errors};
}

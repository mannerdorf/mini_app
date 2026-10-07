import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { collectCustomerCandidates,enqueueCustomer,processCustomerOnboarding } from './customerOnboarding';
import { normalizeCacheCustomers,replaceCustomerCache } from './customerCacheSync';
let db:PGlite;let pool:any;
const customer={inn:'7710431565',customer_name:'Заказчик',email:'new@example.ru',state:'new' as const};
const services={sendLk:vi.fn(async()=>({ok:true})),sendEmail:vi.fn(async()=>({ok:true}))};
beforeEach(async()=>{
 vi.stubEnv('AUTO_REGISTER_FROM_CUSTOMERS','true');vi.stubEnv('AUTO_REGISTER_ENCRYPTION_KEY','test-key');vi.stubEnv('AUTO_REGISTER_EMAIL_DELAY_MS','0');vi.stubEnv('AUTO_REGISTER_MAX_PER_RUN','10');
 services.sendLk.mockReset().mockResolvedValue({ok:true});services.sendEmail.mockReset().mockResolvedValue({ok:true});
 db=new PGlite();await db.exec(`
 CREATE TABLE registered_users(id bigserial PRIMARY KEY,login text UNIQUE,password_hash text,inn text,company_name text,permissions jsonb,financial_access boolean,access_all_inns boolean,active boolean DEFAULT true);
 CREATE TABLE account_companies(login text,inn text,name text,PRIMARY KEY(login,inn));
 CREATE TABLE admin_audit_log(id bigserial PRIMARY KEY,action text,target_type text,target_id text,details jsonb,created_at timestamptz DEFAULT now());
 CREATE TABLE cache_customers(inn text PRIMARY KEY,customer_name text,email text,fetched_at timestamptz DEFAULT now());
 `);await db.exec(readFileSync(new URL('../migrations/127_customer_onboarding.sql',import.meta.url),'utf8'));
 const query=async(sql:string,params:any[]=[])=>sql.includes('pg_advisory_xact_lock')?{rows:[]}:db.query(sql,params);
 pool={query,connect:async()=>({query,release:()=>{}})};
 await pool.query('INSERT INTO cache_customers(inn,customer_name,email) VALUES($1,$2,$3)',[customer.inn,customer.customer_name,customer.email]);
});
afterEach(async()=>{await db?.close();vi.unstubAllEnvs();});
it('commits creation, INN access and encrypted invitation together and resumes only the failed step',async()=>{
 services.sendLk.mockResolvedValueOnce({ok:false});
 const first=await processCustomerOnboarding(pool,{services});expect(first.created).toBe(1);expect(first.email_sent).toBe(1);
 const task:any=(await pool.query('SELECT * FROM customer_onboarding')).rows[0];
 expect(task.email_done).toBe(true);expect(task.lk_done).toBe(false);expect(task.password_cipher).toBeNull();
 const user:any=(await pool.query('SELECT * FROM registered_users')).rows[0];
 const {verifyPassword}=await import('./passwordUtils');
 expect(verifyPassword(services.sendEmail.mock.calls[0][3],user.password_hash)).toBe(true);
 await pool.query('UPDATE customer_onboarding SET next_at=now()');
 const second=await processCustomerOnboarding(pool,{services});expect(second.created).toBe(0);expect(second.processed).toBe(1);
 expect(services.sendEmail).toHaveBeenCalledTimes(1);expect(services.sendLk).toHaveBeenCalledTimes(2);
 expect((await pool.query('SELECT count(*) n FROM registered_users')).rows[0].n).toBe(1);
 expect((await collectCustomerCandidates(pool)).candidates).toHaveLength(0);
});
it('retries the same password after email failure without repeating successful SendLK',async()=>{
 services.sendEmail.mockResolvedValueOnce({ok:false});await processCustomerOnboarding(pool,{services});
 const before:any=(await pool.query('SELECT * FROM customer_onboarding')).rows[0];
 expect(before.password_cipher).not.toContain(services.sendEmail.mock.calls[0][3]);
 await pool.query('UPDATE customer_onboarding SET next_at=now()');await processCustomerOnboarding(pool,{services});
 expect(services.sendLk).toHaveBeenCalledTimes(1);expect(services.sendEmail.mock.calls[1][3]).toBe(services.sendEmail.mock.calls[0][3]);
});
it('does not reset a changed password or send old credentials',async()=>{
 services.sendEmail.mockResolvedValueOnce({ok:false});await processCustomerOnboarding(pool,{services});
 await pool.query("UPDATE registered_users SET password_hash='changed'");await pool.query('UPDATE customer_onboarding SET next_at=now()');
 await processCustomerOnboarding(pool,{services});expect(services.sendEmail).toHaveBeenCalledTimes(1);
 expect((await collectCustomerCandidates(pool)).candidates[0].state).toBe('needs_review');
});
it('does not give another INN access just because its email exists',async()=>{
 await enqueueCustomer(pool,customer);await pool.query("INSERT INTO cache_customers VALUES('1234567890','Другая компания',$1,now())",[customer.email]);
 const candidates=(await collectCustomerCandidates(pool)).candidates;expect(candidates.find(c=>c.inn==='1234567890')?.state).toBe('needs_review');
 await processCustomerOnboarding(pool,{services});
 expect((await pool.query("SELECT * FROM account_companies WHERE inn='1234567890'")).rows).toHaveLength(0);
});
it('rolls back the user and company if queue creation fails',async()=>{
 await db.exec("ALTER TABLE customer_onboarding ADD CONSTRAINT reject_test CHECK (login <> 'new@example.ru')");
 await expect(enqueueCustomer(pool,customer)).rejects.toThrow();
 expect((await pool.query('SELECT * FROM registered_users')).rows).toHaveLength(0);
 expect((await pool.query('SELECT * FROM account_companies')).rows).toHaveLength(0);
});
it('will not register an email changed since candidate selection',async()=>{
 await pool.query("UPDATE cache_customers SET email='different@example.ru'");expect(await enqueueCustomer(pool,customer)).toBe(false);
});
it('keeps cache on empty replies and rolls back an invalid snapshot',async()=>{
 await expect(replaceCustomerCache(pool,[])).rejects.toThrow();
 await expect(replaceCustomerCache(pool,[customer,customer])).rejects.toThrow();
 expect((await pool.query('SELECT * FROM cache_customers')).rows[0].email).toBe(customer.email);
 await replaceCustomerCache(pool,[{...customer,email:'updated@example.ru'}]);
 expect((await pool.query('SELECT * FROM cache_customers')).rows[0].email).toBe('updated@example.ru');
});
it('normalizes nested replies and INNs without dropping the email',()=>{
 expect(normalizeCacheCustomers({data:{Customers:[{INN:customer.inn,Name:'Имя',Email:' new@example.ru '}]}})).toEqual([{inn:customer.inn,customer_name:'Имя',email:customer.email}]);
 expect(normalizeCacheCustomers({Success:false,Error:'unavailable'})).toEqual([]);
});
it('respects disabled mode and a leased task',async()=>{
 vi.stubEnv('AUTO_REGISTER_FROM_CUSTOMERS','false');expect((await processCustomerOnboarding(pool,{services})).created).toBe(0);
 vi.stubEnv('AUTO_REGISTER_FROM_CUSTOMERS','true');await enqueueCustomer(pool,customer);
 await pool.query("UPDATE customer_onboarding SET lease_until=now()+interval '5 minutes',token='other'");
 expect((await processCustomerOnboarding(pool,{services})).processed).toBe(0);expect(services.sendEmail).not.toHaveBeenCalled();
});

it('does not retry before the due time and does not create duplicate users',async()=>{
 services.sendEmail.mockResolvedValue({ok:false});
 await processCustomerOnboarding(pool,{services});
 expect(await enqueueCustomer(pool,customer)).toBe(false);
 expect((await processCustomerOnboarding(pool,{services})).processed).toBe(0);
 expect(services.sendEmail).toHaveBeenCalledTimes(1);
});
it('respects the batch limit and leaves excess customers visible',async()=>{
 await pool.query("INSERT INTO cache_customers VALUES('1234567890','Ещё заказчик','other@example.ru',now())");
 const result=await processCustomerOnboarding(pool,{limit:1,services});
 expect(result.created).toBe(1);expect(result.processed).toBe(1);expect(result.remaining_candidates).toBe(1);
});
it('recovers an old unfinished registration for review without resetting its password',async()=>{
 await pool.query("INSERT INTO registered_users(login,password_hash,inn,company_name) VALUES($1,'old-hash',$2,'Компания')",[customer.email,customer.inn]);
 await pool.query("INSERT INTO admin_audit_log(action,target_type,target_id,details) VALUES('auto_user_register','user','1','{}')");
 await db.exec(readFileSync(new URL('../migrations/127_customer_onboarding.sql',import.meta.url),'utf8'));
 const tasks:any=(await pool.query('SELECT * FROM customer_onboarding')).rows;
 expect(tasks[0].needs_review).toBe(true);expect(tasks[0].password_cipher).toBeNull();
 await processCustomerOnboarding(pool,{services});
 expect(services.sendEmail).not.toHaveBeenCalled();expect((await pool.query('SELECT password_hash FROM registered_users')).rows[0].password_hash).toBe('old-hash');
});

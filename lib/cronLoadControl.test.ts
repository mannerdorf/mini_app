import { beforeAll, afterAll, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import type { Pool } from 'pg';
import { runCronWork, cronDateWindow } from './cronWorkState';
import { acquireOneCGate, isOneCUrl } from './oneCRequestGate';
import { loadNotificationCacheItems } from './notificationCacheItems';
let db:PGlite;
const pool={query:(sql:string,args?:unknown[])=>db.query(sql,args)} as unknown as Pool;
beforeAll(async()=>{
 db=new PGlite();
 const migration=readFileSync(new URL('../migrations/116_cron_load_control.sql',import.meta.url),'utf8');
 await db.exec(migration); await db.exec(migration);
},30000);
afterAll(()=>db.close());
it('persists cursor and skips duplicate invocations until due',async()=>{
 let calls=0;
 const work=async(cursor:any)=>({result:++calls,cursor:{position:(cursor.position??0)+1}});
 expect(await runCronWork(pool,'test',25,work)).toBe(1);
 expect(await runCronWork(pool,'test',25,work)).toMatchObject({skipped:true});
 expect(calls).toBe(1);
 await db.exec("UPDATE cron_work_state SET next_at=now()-interval '1 minute' WHERE name='test'");
 await runCronWork(pool,'test',25,work);
 expect((await db.query<any>("SELECT cursor FROM cron_work_state WHERE name='test'")).rows[0].cursor.position).toBe(2);
});
it('retains cursor and backs off when a request fails',async()=>{
 await expect(runCronWork(pool,'failed',25,async()=>{throw new Error('upstream')})).rejects.toThrow('upstream');
 const row=(await db.query<any>("SELECT cursor,failures,next_at>now() AS delayed FROM cron_work_state WHERE name='failed'")).rows[0];
 expect(row).toEqual({cursor:{},failures:1,delayed:true});
});
it('serializes requests and gives waiting interactive work priority',async()=>{
 expect(await acquireOneCGate(pool,'active',1)).toBe(true);
 expect(await acquireOneCGate(pool,'background',1)).toBe(false);
 expect(await acquireOneCGate(pool,'interactive',0)).toBe(false);
 await db.exec("DELETE FROM one_c_request_waiters WHERE token='active'; UPDATE one_c_request_gate SET lease_until=NULL");
 expect(await acquireOneCGate(pool,'background',1)).toBe(false);
 expect(await acquireOneCGate(pool,'interactive',0)).toBe(true);
});
it('does not intercept other providers',()=>{
 expect(isOneCUrl('https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetZayavki')).toBe(true);
 expect(isOneCUrl('https://example.com/workbase/hs/test')).toBe(false);
});
it('reads only fresh authorized records inside the 25-day window',async()=>{
 await db.exec("CREATE TABLE cache_perevozki_rows(customer_inn text,doc_date date,updated_at timestamptz,payload jsonb)");
 await db.exec(`INSERT INTO cache_perevozki_rows VALUES
 ('1',current_date,now(),'{"id":"visible"}'),
 ('2',current_date,now(),'{"id":"foreign"}'),
 ('1',current_date-25,now(),'{"id":"old"}'),
 ('1',current_date,now()-interval '4 hours','{"id":"stale"}')`);
 expect(await loadNotificationCacheItems(pool,'1')).toEqual([{id:'visible'}]);
});

it('uses the Moscow calendar at midnight for three- and ten-day windows',()=>{
 const now=new Date('2026-09-18T21:15:00Z');
 expect(cronDateWindow(3,now)).toEqual({dateFrom:'2026-09-17',dateTo:'2026-09-19'});
 expect(cronDateWindow(10,now)).toEqual({dateFrom:'2026-09-10',dateTo:'2026-09-19'});
});
it('recovers an expired gate lease and pauses only background traffic',async()=>{
 await db.exec("DELETE FROM one_c_request_waiters; UPDATE one_c_request_gate SET lease_until=now()-interval '1 second',background_pause_until=now()+interval '15 minutes'");
 expect(await acquireOneCGate(pool,'paused',1)).toBe(false);
 expect(await acquireOneCGate(pool,'user',0)).toBe(true);
});

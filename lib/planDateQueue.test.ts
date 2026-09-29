import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {enqueuePlanDates,processPlanDateQueue,resumePlanDate} from './planDateQueue';
import {extractConfirmedPlanDate} from './planDateService';
let db:PGlite,pool:any;
beforeEach(async()=>{
 db=new PGlite();await db.exec(readFileSync('migrations/120_plan_date_queue.sql','utf8'));
 await db.exec('CREATE TABLE cache_perevozki_rows(doc_number text,payload jsonb);');
 await db.query('INSERT INTO cache_perevozki_rows VALUES($1,$2)',['000142716',JSON.stringify({Number:'142716',W:42})]);
 const query=(sql:string,args?:any[])=>sql.includes('pg_try_advisory_lock')?Promise.resolve({rows:[{locked:true}]}):sql.includes('pg_advisory_unlock')?Promise.resolve({rows:[]}):db.query(sql,args);
 pool={query,connect:async()=>({query,release:()=>{}})};
});
afterEach(async()=>{await db.close();});
const task=async()=> (await db.query<any>('SELECT * FROM plan_date_queue')).rows[0];
it('deduplicates identical requests and writes once',async()=>{
 await enqueuePlanDates(pool,['142716','000142716'],'2026-09-30','user');
 await enqueuePlanDates(pool,['142716'],'2026-09-30','user');
 const io={write:vi.fn(async()=>({ok:true})),read:vi.fn(async()=>null)};
 await processPlanDateQueue(pool,io);await processPlanDateQueue(pool,io);
 expect(io.write).toHaveBeenCalledTimes(1);expect((await task()).state).toBe('done');
 expect((await db.query<any>('SELECT payload FROM cache_perevozki_rows')).rows[0].payload).toEqual({Number:'142716',W:42,DateArrivalPlan:'2026-09-30',DateDeliveryPlan:'2026-09-30',PlanDate:'2026-09-30'});
});
it('verifies a lost write response without resending',async()=>{
 await enqueuePlanDates(pool,['142716'],'2026-09-30','user');
 const io={write:vi.fn(async()=>({ok:false,uncertain:true})),read:vi.fn(async()=>'2026-09-30')};
 await processPlanDateQueue(pool,io);expect((await task()).state).toBe('verifying');
 await expect(enqueuePlanDates(pool,['142716'],'2026-10-01','user')).rejects.toThrow('сверки');
 await db.exec('UPDATE plan_date_queue SET next_at=now()');await processPlanDateQueue(pool,io);
 expect((await task()).state).toBe('done');expect(io.write).toHaveBeenCalledTimes(1);
});
it('recovers a crashed sender by reading and stops after three inconclusive reads',async()=>{
 await enqueuePlanDates(pool,['142716'],'2026-09-30','user');
 await db.exec("UPDATE plan_date_queue SET state='sending',updated_at=now()-interval '4 minutes'");
 const io={write:vi.fn(async()=>({ok:true})),read:vi.fn(async()=>null)};
 for(let n=0;n<3;n++){await db.exec('UPDATE plan_date_queue SET next_at=now()');await processPlanDateQueue(pool,io);}
 expect((await task()).state).toBe('uncertain');expect(io.write).not.toHaveBeenCalled();
 expect((await db.query<any>('SELECT payload FROM cache_perevozki_rows')).rows[0].payload.DateArrivalPlan).toBeUndefined();
});
it('keeps explicit rejection as error without automatic retries',async()=>{
 await enqueuePlanDates(pool,['142716'],'2026-09-30','user');
 const io={write:vi.fn(async()=>({ok:false,error:'Обработано 0'})),read:vi.fn(async()=>null)};
 await processPlanDateQueue(pool,io);await processPlanDateQueue(pool,io);
 expect((await task()).state).toBe('error');expect(io.write).toHaveBeenCalledTimes(1);
});
it('allows changing a waiting date and rejects invalid calendar dates',async()=>{
 await enqueuePlanDates(pool,['142716'],'2026-09-30','user');
 await enqueuePlanDates(pool,['142716'],'2026-10-01','user');expect((await task()).target_date).toBe('2026-10-01');
 await expect(enqueuePlanDates(pool,['142716'],'2026-02-30','user')).rejects.toThrow();
});
it('only verifies explicit plan fields belonging to the requested cargo',()=>{
 expect(extractConfirmedPlanDate({Number:'142716',DateArrivalPlan:'2026-09-30T00:00:00'},'000142716')).toBe('2026-09-30');
 expect(extractConfirmedPlanDate({Number:'142716',DateArrival:'2026-09-30'},'000142716')).toBeNull();
 expect(extractConfirmedPlanDate({Number:'other',PlanDate:'2026-09-30'},'000142716')).toBeNull();
});

it('explicitly resumes failed tasks once while protecting active and stale tasks',async()=>{
 await enqueuePlanDates(pool,['142716'],'2026-09-30','user');
 await db.exec("UPDATE plan_date_queue SET state='uncertain'");
 const before=await task();
 const stamp=new Date(before.updated_at).toISOString();
 await expect(resumePlanDate(pool,'142716','2026-10-01',stamp,'dispatcher')).rejects.toThrow();
 const resumed=await resumePlanDate(pool,'142716','2026-09-30',stamp,'dispatcher');
 expect(resumed.state).toBe('pending');
 await expect(resumePlanDate(pool,'142716','2026-09-30',stamp,'dispatcher')).rejects.toThrow();
 const io={write:vi.fn(async()=>({ok:true})),read:vi.fn(async()=>null)};
 await processPlanDateQueue(pool,io);
 expect(io.write).toHaveBeenCalledTimes(1);
 const done=await task();
 await expect(resumePlanDate(pool,'142716','2026-09-30',new Date(done.updated_at).toISOString(),'dispatcher')).rejects.toThrow();
});

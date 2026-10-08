import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {afterAll,beforeAll,beforeEach,expect,it} from 'vitest';
import {readSendingPlans,saveSendingPlan,deleteSendingPlan} from './sendingPlanning';
import {planProgress} from '../src/features/documents/sendings/planning/planningModel';
import type {PlanDraft} from '../src/features/documents/sendings/planning/planningModel';
let db:PGlite,pool:any;
beforeAll(async()=>{
 db=new PGlite();
 await db.exec('CREATE TABLE ferries(id bigint PRIMARY KEY,name text,active boolean); CREATE TABLE sendings_metrics(cargo_numbers jsonb); CREATE TABLE cache_perevozki_rows(doc_number text PRIMARY KEY,doc_date timestamp,payload jsonb,updated_at timestamp);');
 await db.exec(readFileSync('migrations/130_sending_planning.sql','utf8'));
 await db.exec("INSERT INTO ferries VALUES(1,'FESCO NAVARIN',true),(2,'Неактивный паром',false)");
 const query=(sql:string,args?:any[])=>db.query(sql,args);
 pool={query,connect:async()=>({query,release(){}})};
},30000);
afterAll(async()=>{await db.close();});
beforeEach(async()=>{
 await db.exec('TRUNCATE sending_plans CASCADE; TRUNCATE cache_perevozki_rows,sendings_metrics;');
 for(let index=1;index<=7;index++){
  const number=String(142700+index),payload={Number:number,INN:index===3?'2':'1',Customer:index===3?'Клиент Б':'Клиент А',Receiver:index===2?'Получатель Б':'Получатель А',CitySender:index===4?'Калининград':'Москва',CityReceiver:index===4?'Москва':'Калининград',DatePrih:index===7?'':'2026-10-06',State:index===6?'Доставлена':'В пути',W:index*10,Value:index,Mest:index};
  await db.query('INSERT INTO cache_perevozki_rows VALUES($1,$2,$3,now())',[`000${number}`,'2026-10-06',JSON.stringify(payload)]);
 }
 await db.query('INSERT INTO sendings_metrics VALUES($1)',[JSON.stringify([' 000142705 '])]);
});
const draft=(overrides:Partial<PlanDraft>={}):PlanDraft=>({date:'2026-10-09',route:'MSK → KGD',mode:'auto',vehicleId:'tent',ferryId:null,comment:'Поставить у ворот',cargoNumbers:['142701','142702'],...overrides});
const list=()=>readSendingPlans(pool,'2026-09-28','2026-11-08');
it('persists shared recommendations and reserves cargo across users and months',async()=>{
 const id=await saveSendingPlan(pool,draft(),'staff-a');
 const data=await list();
 expect(data.plans[0]).toMatchObject({id,revision:1,vehicleId:'tent',comment:'Поставить у ворот',actualCargoNumbers:[]});
 expect(data.plans[0].cargo.map(cargo=>cargo.number)).toEqual(['142701','142702']);
 expect(data.available.map(cargo=>cargo.number)).not.toContain('142701');
 expect(data.available.map(cargo=>cargo.number)).not.toContain('142705');
 expect(data.available.map(cargo=>cargo.number)).not.toContain('142706');
 expect(data.available.map(cargo=>cargo.number)).toContain('142707');
 await expect(saveSendingPlan(pool,draft({date:'2026-11-20',cargoNumbers:['000142701']}),'staff-b')).rejects.toMatchObject({status:409});
 const outside=await readSendingPlans(pool,'2026-11-01','2026-12-01');
 expect(outside.plans).toHaveLength(0);expect(outside.available.map(cargo=>cargo.number)).not.toContain('142702');
});
it('validates actual sending membership, route, transport preset and active ferry at save time',async()=>{
 for(const invalid of [draft({cargoNumbers:['142705']}),draft({cargoNumbers:['142706']}),draft({cargoNumbers:['142704']}),draft({vehicleId:'20dc'}),draft({date:'2026-02-30'}),draft({mode:'ferry',vehicleId:'40hc',ferryId:2})])await expect(saveSendingPlan(pool,invalid,'staff')).rejects.toThrow();
 expect((await list()).plans).toHaveLength(0);
 await saveSendingPlan(pool,draft({mode:'ferry',vehicleId:'40hc',ferryId:1}),'staff');
 expect((await list()).plans[0]).toMatchObject({mode:'ferry',vehicleId:'40hc',ferryName:'FESCO NAVARIN'});
 await saveSendingPlan(pool,draft({mode:'air',cargoNumbers:['142703']}),'staff');
 expect((await list()).plans.find(plan=>plan.mode==='air')).toMatchObject({vehicleId:'',ferryId:null});
});
it('calculates plan/fact from deduplicated padded cargo numbers and preserves shipped members',async()=>{
 const id=await saveSendingPlan(pool,draft(),'staff');
 await db.query('INSERT INTO sendings_metrics VALUES($1)',[JSON.stringify(['000142701','142701'])]);
 const plan=(await list()).plans[0];
 expect(planProgress(plan)).toEqual({planned:2,actual:1,percent:50});
 await saveSendingPlan(pool,draft({id,revision:1,comment:'Комментарий после отправки'}),'other');
 await expect(saveSendingPlan(pool,draft({id,revision:2,cargoNumbers:['142702']}),'other')).rejects.toMatchObject({status:409});
 expect((await list()).plans[0].cargo).toHaveLength(2);
});
it('releases removed reservations and prevents edits with stale versions',async()=>{
 const id=await saveSendingPlan(pool,draft(),'staff');
 await saveSendingPlan(pool,draft({id,revision:1,cargoNumbers:['142701']}),'other');
 await expect(saveSendingPlan(pool,draft({id,revision:1}),'staff')).rejects.toMatchObject({status:409});
 await saveSendingPlan(pool,draft({cargoNumbers:['142702']}),'other');
 expect((await list()).plans).toHaveLength(2);
 await expect(deleteSendingPlan(pool,id,1)).rejects.toMatchObject({status:409});
 await deleteSendingPlan(pool,id,2);
 expect((await list()).available.map(cargo=>cargo.number)).toContain('142701');
});
it('uses the database uniqueness constraint as the final guard and rolls back the entire conflicting plan',async()=>{
 await saveSendingPlan(pool,draft(),'staff');
 const query=async(sql:string,args?:any[])=>sql.startsWith('SELECT cargo_number FROM sending_plan_cargo WHERE cargo_number=ANY')?{rows:[]}:db.query(sql,args);
 const racedPool:any={query,connect:async()=>({query,release(){}})};
 await expect(saveSendingPlan(racedPool,draft({cargoNumbers:['142703','142701']}),'other')).rejects.toMatchObject({status:409});
 expect((await list()).plans).toHaveLength(1);
 expect((await list()).available.map(cargo=>cargo.number)).toContain('142703');
});

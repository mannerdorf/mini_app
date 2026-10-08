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
 await db.exec(readFileSync('migrations/131_sending_planning_transport.sql','utf8'));
 await db.exec(readFileSync('migrations/132_sending_planning_departure.sql','utf8'));
 await db.exec(readFileSync('migrations/133_sending_planning_dimensions.sql','utf8'));
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
it('fills missing sender fields in existing plan snapshots without changing their original cargo data',async()=>{
 const id=await saveSendingPlan(pool,draft(),'staff');
 await db.query("UPDATE sending_plan_cargo SET snapshot=snapshot-'sender' WHERE plan_id=$1",[id]);
 await db.query("UPDATE cache_perevozki_rows SET payload=payload||$1::jsonb WHERE doc_number=$2",[JSON.stringify({Sender:' Склад отправителя ',Customer:'Другое имя',W:999}), '000142701']);
 const plan=(await list()).plans[0];
 expect(plan.cargo[0]).toMatchObject({number:'142701',sender:'Склад отправителя',customer:'Клиент А',weight:10});
 expect(plan.cargo[1].sender).toBe('');
 const snapshot=(await db.query<{snapshot:Record<string,unknown>}>('SELECT snapshot FROM sending_plan_cargo WHERE cargo_number=$1',['142701'])).rows[0].snapshot;
 expect(snapshot).not.toHaveProperty('sender');
});
it('reads paid weight from PW and enriches only missing legacy fields without changing recorded weights',async()=>{
 await db.query("UPDATE cache_perevozki_rows SET payload=payload||$1::jsonb WHERE doc_number=$2",[JSON.stringify({PW:' 1 250,5 '}),'000142701']);
 const id=await saveSendingPlan(pool,draft(),'staff');
 expect((await list()).plans[0].cargo[0].paidWeight).toBe(1250.5);
 await db.query("UPDATE cache_perevozki_rows SET payload=payload||$1::jsonb WHERE doc_number=$2",[JSON.stringify({PW:800,W:999}),'000142701']);
 expect((await list()).plans[0].cargo[0]).toMatchObject({paidWeight:1250.5,weight:10});
 await db.query("UPDATE sending_plan_cargo SET snapshot=snapshot-'paidWeight' WHERE plan_id=$1 AND cargo_number='142701'",[id]);
 const plan=(await list()).plans[0];
 expect(plan.cargo[0]).toMatchObject({paidWeight:800,weight:10});
 expect(plan.cargo[1].paidWeight).toBeNull();
 const snapshot=(await db.query<{snapshot:Record<string,unknown>}>('SELECT snapshot FROM sending_plan_cargo WHERE cargo_number=$1',['142701'])).rows[0].snapshot;
 expect(snapshot).not.toHaveProperty('paidWeight');
});
it('validates actual sending membership, route, transport preset and active ferry at save time',async()=>{
 for(const invalid of [draft({cargoNumbers:['142705']}),draft({cargoNumbers:['142706']}),draft({cargoNumbers:['142704']}),draft({vehicleId:'20dc'}),draft({date:'2026-02-30'}),draft({mode:'ferry',vehicleId:'40hc',ferryId:2})])await expect(saveSendingPlan(pool,invalid,'staff')).rejects.toThrow();
 expect((await list()).plans).toHaveLength(0);
 await saveSendingPlan(pool,draft({mode:'ferry',vehicleId:'40hc',ferryId:1}),'staff');
 expect((await list()).plans[0]).toMatchObject({mode:'ferry',vehicleId:'40hc',ferryName:'FESCO NAVARIN'});
 await saveSendingPlan(pool,draft({mode:'air',cargoNumbers:['142703']}),'staff');
 expect((await list()).plans.find(plan=>plan.mode==='air')).toMatchObject({vehicleId:'',ferryId:null});
});
it('supports RoRo with road presets and a ferry while preserving existing container plans',async()=>{
 const container=await saveSendingPlan(pool,draft({mode:'ferry',vehicleId:'40hc',ferryId:1}),'staff');
 await db.exec(readFileSync('migrations/131_sending_planning_transport.sql','utf8'));
 expect((await list()).plans[0]).toMatchObject({id:container,mode:'ferry',vehicleId:'40hc',ferryId:1,isDraft:false});
 for(const invalid of [draft({mode:'roro',vehicleId:'40hc',ferryId:1}),draft({mode:'roro',ferryId:null}),draft({mode:'roro',ferryId:2})])await expect(saveSendingPlan(pool,invalid,'staff')).rejects.toThrow();
 const id=await saveSendingPlan(pool,draft({mode:'roro',vehicleId:'tent',ferryId:1,cargoNumbers:['142703']}),'staff');
 expect((await list()).plans.find(plan=>plan.id===id)).toMatchObject({mode:'roro',vehicleId:'tent',ferryName:'FESCO NAVARIN',isDraft:false});
 await saveSendingPlan(pool,draft({id,revision:1,mode:'auto',ferryId:1,cargoNumbers:['142703']}),'staff');
 expect((await list()).plans.find(plan=>plan.id===id)).toMatchObject({mode:'auto',vehicleId:'tent',ferryId:null,ferryName:''});
});
it('retains imported incomplete plans and completes them without losing the source identity',async()=>{
 const initial=draft({title:'Название из календаря',isDraft:true,route:'',mode:'',vehicleId:'',ferryId:1,cargoNumbers:[]});
 const id=await saveSendingPlan(pool,initial,'import');
 await db.query('UPDATE sending_plans SET source_key=$2 WHERE id=$1',[id,'bitrix:calendar:event']);
 expect((await list()).plans[0]).toMatchObject({id,title:initial.title,isDraft:true,route:'',mode:'',vehicleId:'',ferryId:1});
 await saveSendingPlan(pool,{...initial,id,revision:1,comment:'Заполню позже'},'staff');
 expect((await list()).plans[0]).toMatchObject({revision:2,isDraft:true,comment:'Заполню позже'});
 await saveSendingPlan(pool,draft({id,revision:2,title:initial.title,isDraft:true,mode:'roro',vehicleId:'tent',ferryId:1}),'staff');
 expect((await list()).plans[0]).toMatchObject({revision:3,title:initial.title,isDraft:false,mode:'roro',route:'MSK → KGD'});
 expect((await db.query('SELECT source_key FROM sending_plans WHERE id=$1',[id])).rows[0].source_key).toBe('bitrix:calendar:event');
});
it('allows only missing draft fields and rejects invalid presets, unnamed drafts and cargo without a route',async()=>{
 const partial=draft({title:'Рейс',isDraft:true,route:'',mode:'ferry',vehicleId:'',ferryId:null,cargoNumbers:[]});
 for(const invalid of [{...partial,title:''},{...partial,route:'???'},{...partial,mode:'rail'},{...partial,vehicleId:'tent'},{...partial,ferryId:2},{...partial,cargoNumbers:['142701']}])await expect(saveSendingPlan(pool,invalid,'staff')).rejects.toThrow();
 expect((await list()).plans).toHaveLength(0);
 await saveSendingPlan(pool,partial,'staff');
 expect((await list()).plans[0]).toMatchObject({isDraft:true,mode:'ferry',vehicleId:'',ferryId:null});
});
it('persists a separate ferry departure date, preserves it for older clients and clears it for road or air',async()=>{
 await expect(saveSendingPlan(pool,draft({mode:'roro',ferryId:1,departureDate:'2026-02-30'}),'staff')).rejects.toThrow('дату выхода');
 const id=await saveSendingPlan(pool,draft({mode:'roro',ferryId:1,departureDate:'2026-10-14'}),'staff');
 expect((await list()).plans[0]).toMatchObject({date:'2026-10-09',departureDate:'2026-10-14'});
 await saveSendingPlan(pool,draft({id,revision:1,mode:'roro',ferryId:1}),'staff');
 expect((await list()).plans[0].departureDate).toBe('2026-10-14');
 await saveSendingPlan(pool,draft({id,revision:2,mode:'auto',departureDate:'2026-10-14'}),'staff');
 expect((await list()).plans[0].departureDate).toBe('');
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
it('reads planned delivery deadlines for available cargo and legacy snapshots without overwriting their recorded metrics',async()=>{
 await db.query("UPDATE cache_perevozki_rows SET payload=payload||$1::jsonb WHERE doc_number=$2",[JSON.stringify({DateArrivalPlan:'2026-10-09'}),'000142701']);
 expect((await list()).available.find(cargo=>cargo.number==='142701')?.plannedDeliveryDate).toBe('2026-10-09');
 const id=await saveSendingPlan(pool,draft(),'staff');
 await db.query("UPDATE sending_plan_cargo SET snapshot=snapshot-'plannedDeliveryDate' WHERE plan_id=$1",[id]);
 await db.query("UPDATE cache_perevozki_rows SET payload=payload||$1::jsonb WHERE doc_number=$2",[JSON.stringify({DateArrivalPlan:'2026-10-10',W:999}),'000142701']);
 expect((await list()).plans[0].cargo[0]).toMatchObject({plannedDeliveryDate:'2026-10-10',weight:10});
 await db.query("UPDATE cache_perevozki_rows SET payload=payload||$1::jsonb WHERE doc_number=$2",[JSON.stringify({DateDeliveryPlan:'2026-10-11'}),'000142703']);
 expect((await list()).available.find(cargo=>cargo.number==='142703')?.plannedDeliveryDate).toBe('2026-10-11');
});

it('persists custom internal dimensions, preserves them for older clients and clears them on explicit reset or changed preset',async()=>{
 const dimensions={length:10,width:2,height:2};
 const id=await saveSendingPlan(pool,draft({vehicleDimensions:dimensions}),'staff');
 expect((await list()).plans[0].vehicleDimensions).toEqual(dimensions);
 await saveSendingPlan(pool,draft({id,revision:1}),'legacy');
 expect((await list()).plans[0].vehicleDimensions).toEqual(dimensions);
 await saveSendingPlan(pool,draft({id,revision:2,vehicleDimensions:null}),'staff');
 expect((await list()).plans[0].vehicleDimensions).toBeNull();
 await saveSendingPlan(pool,draft({id,revision:3,vehicleDimensions:dimensions}),'staff');
 await saveSendingPlan(pool,draft({id,revision:4,vehicleId:'rigid'}),'legacy');
 expect((await list()).plans[0].vehicleDimensions).toBeNull();
 for(const vehicleDimensions of [{length:0,width:2,height:2},{length:101,width:2,height:2},{length:10,width:'bad',height:2}])await expect(saveSendingPlan(pool,draft({vehicleDimensions:vehicleDimensions as any}),'staff')).rejects.toThrow('внутренние размеры');
});

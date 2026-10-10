import {PGlite} from '@electric-sql/pglite';
import {describe,it,expect} from 'vitest';
import {readAccumulationData} from './sendingPlanningForecast';
describe('forecast data from database',()=>{
 it('aggregates receipt and departure dates, deduplicates cargo, and includes reserved stock',async()=>{
  const db=new PGlite();try{
   await db.exec(`CREATE TABLE cache_perevozki_rows(doc_number text,payload jsonb,updated_at timestamptz);
    CREATE TABLE sendings_metrics(cargo_numbers jsonb,send_start_at timestamptz);
    CREATE TABLE sending_plans(id text,planned_date text,route text,mode text,vehicle_id text,vehicle_dimensions jsonb,created_at timestamptz);
    CREATE TABLE sending_plan_reconciliations(plan_id text);`);
   const cargo=(Number:string,DatePrih:string,W:number,Value:number)=>({Number,DatePrih,W,Value,CitySender:'Москва',CityReceiver:'Калининград',Mest:1});
   const received=cargo('1','2026-10-01',100,2),stock=cargo('2','2026-09-01',300,6);
   await db.query('INSERT INTO cache_perevozki_rows VALUES ($1,$2,$3),($4,$5,$6),($7,$8,$9)',['0001',JSON.stringify(cargo('1','2026-10-01',50,1)),'2026-10-01T00:00:00Z','1',JSON.stringify(received),'2026-10-02T00:00:00Z','2',JSON.stringify(stock),'2026-10-02T00:00:00Z']);
   await db.query('INSERT INTO sendings_metrics VALUES ($1,$2),($3,$4)',[JSON.stringify(['0001','1']),'2026-10-03T22:00:00Z',JSON.stringify(['1']),'2026-10-05T10:00:00Z']);
   await db.exec("INSERT INTO sending_plans VALUES('reserved','2026-11-01','MSK → KGD','auto','tent',null,now())");
   const result=await readAccumulationData(db as any,{rows:[{payload:stock,updated_at:new Date(),assigned:false}],assigned:1},new Date('2026-10-10T10:00:00Z'));
   expect(result.routes[0].incoming).toHaveLength(30);
   expect(result.routes[0].incoming.find(day=>day.date==='2026-10-01')).toMatchObject({weight:100,volume:2,count:1});
   expect(result.routes[0].outgoing.find(day=>day.date==='2026-10-04')).toMatchObject({weight:100,volume:2,count:1});
   expect(result.routes[0].stock).toEqual({weight:300,volume:6});
   expect(result.schedule[0].date).toBe('2026-11-01');
   expect(JSON.stringify(result)).not.toContain('"Number"');
  }finally{await db.close();}
 },30000);
});

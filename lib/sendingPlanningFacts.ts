import type {Pool,PoolClient} from 'pg';
import {getSendingCargoNumbers} from './sendingsMetrics.js';
import {cleanNumber} from './tms/backlog.js';
import {cityToCode} from './cityToCode.js';
import {planningToday,type PlanningFactCandidate} from '../src/features/documents/sendings/planning/planningModel.js';

export type PlanningFact=PlanningFactCandidate & {numbers:string[];route:string;updatedAt:number};
export async function readPlanningFacts(db:Pool|PoolClient,from:string,now=new Date()):Promise<PlanningFact[]> {
 const today=planningToday(now);
 const {rows}=await db.query<{item_key:string;number:string;date:string;payload:Record<string,unknown>;updated_at:Date}>(
  'SELECT item_key,doc_number AS number,doc_date::text AS date,payload,updated_at FROM cache_sendings_rows WHERE doc_date BETWEEN $1::date AND $2::date',[from,today]);
 return rows.map(row=>{
  const p=row.payload,updatedAt=new Date(row.updated_at).getTime();
  const numbers=[...new Set(getSendingCargoNumbers(p).map(cleanNumber).filter(number=>/^\d+$/.test(number)))];
  const origin=cityToCode(p.ПунктОтправленияГородАэропорт??p.CitySender??p.ГородОтправления),destination=cityToCode(p.ПунктНазначенияГородАэропорт??p.CityReceiver??p.ГородНазначения);
  return {key:row.item_key,number:row.number||String(p.Номер??p.Number??''),date:row.date,vehicle:String(p.АвтомобильCMRНаименование??p.AutoReg??p.AutoType??''),
   numbers,route:origin&&destination?`${origin} → ${destination}`:'',updatedAt,matched:0,cargoCount:numbers.length,fresh:now.getTime()-updatedAt<=3*3600000&&updatedAt<=now.getTime()+60000};
 });
}
export function matchingPlanningFacts(plan:{date:string;route:string;numbers:string[]},facts:PlanningFact[],now=new Date()):PlanningFact[] {
 const wanted=new Set(plan.numbers),today=planningToday(now);
 if(plan.date>=today||!wanted.size)return [];
 const cutoff=Date.parse(`${plan.date}T00:00:00+03:00`)+86400000;
 return facts.filter(fact=>fact.date>=plan.date&&fact.date<=today&&(!fact.route||fact.route===plan.route)).map(fact=>({
  ...fact,matched:fact.numbers.filter(number=>wanted.has(number)).length,fresh:fact.fresh&&fact.updatedAt>=cutoff,
 })).filter(fact=>fact.matched>0).sort((a,b)=>a.date.localeCompare(b.date)||b.matched-a.matched||a.number.localeCompare(b.number,'ru',{numeric:true}));
}
export const publicPlanningFact=({key,number,date,vehicle,matched,cargoCount,fresh}:PlanningFact):PlanningFactCandidate=>({key,number,date,vehicle,matched,cargoCount,fresh});
export async function actualPlanningNumbers(db:Pool|PoolClient,numbers:string[]):Promise<Set<string>> {
 if(!numbers.length)return new Set();
 const {rows}=await db.query<{number:string}>(`SELECT DISTINCT ltrim(btrim(value),'0') AS number
 FROM sendings_metrics,jsonb_array_elements_text(cargo_numbers) WHERE ltrim(btrim(value),'0')=ANY($1::text[])`,[numbers]);
 return new Set(rows.map(row=>row.number));
}

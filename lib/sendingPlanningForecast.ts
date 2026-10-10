import type {Pool} from 'pg';
import {normalizeCargo,cleanNumber,type readBacklog} from './tms/backlog.js';
import {planningToday} from '../src/features/documents/sendings/planning/planningModel.js';
import {shiftDay,type AccumulationData,type RouteFlows,type ForecastSchedule} from '../src/features/documents/sendings/planning/accumulationModel.js';

export async function readAccumulationData(pool:Pool,backlog:Awaited<ReturnType<typeof readBacklog>>,now=new Date()):Promise<AccumulationData>{
 const today=planningToday(now),historyFrom=shiftDay(today,-30),historyTo=shiftDay(today,-1);
 const [history,departures,schedule,undated]=await Promise.all([
  pool.query<{number:string;payload:Record<string,unknown>}>(`WITH latest AS (SELECT DISTINCT ON (ltrim(btrim(doc_number),'0')) ltrim(btrim(doc_number),'0') AS number,payload FROM cache_perevozki_rows ORDER BY ltrim(btrim(doc_number),'0'),updated_at DESC NULLS LAST)
   SELECT number,payload FROM latest WHERE left(coalesce(payload->>'DatePrih',''),10) BETWEEN $1 AND $2 OR number=ANY($3::text[])
   OR number IN (SELECT ltrim(btrim(value),'0') FROM sendings_metrics,jsonb_array_elements_text(cargo_numbers) WHERE (send_start_at AT TIME ZONE 'Europe/Moscow')::date BETWEEN $1::date AND $2::date)`,[historyFrom,historyTo,backlog.rows.map(row=>cleanNumber(row.payload.Number))]),
  pool.query<{number:string;date:string}>(`SELECT ltrim(btrim(value),'0') AS number, (min(send_start_at) AT TIME ZONE 'Europe/Moscow')::date::text AS date
   FROM sendings_metrics,jsonb_array_elements_text(cargo_numbers) WHERE send_start_at IS NOT NULL GROUP BY ltrim(btrim(value),'0')
   HAVING (min(send_start_at) AT TIME ZONE 'Europe/Moscow')::date BETWEEN $1::date AND $2::date`,[historyFrom,historyTo]),
  pool.query<{id:string;date:string;route:string;mode:ForecastSchedule['mode'];vehicle_id:string;vehicle_dimensions:ForecastSchedule['vehicleDimensions']}>(`SELECT p.id,p.planned_date AS date,p.route,p.mode,p.vehicle_id,p.vehicle_dimensions FROM sending_plans p
   WHERE p.planned_date BETWEEN $1 AND $2 AND NOT EXISTS (SELECT 1 FROM sending_plan_reconciliations r WHERE r.plan_id=p.id)
   ORDER BY p.planned_date,p.created_at`,[today,shiftDay(today,90)]),
  pool.query<{count:string}>(`SELECT count(*)::text AS count FROM sendings_metrics WHERE send_start_at IS NULL AND jsonb_array_length(cargo_numbers)>0`),
 ]);
 const routes=new Map<string,RouteFlows>();
 const route=(name:string)=>{
  if(!name||name.includes('?'))return null;
  let result=routes.get(name);
  if(!result){const days=()=>Array.from({length:30},(_,i)=>({date:shiftDay(historyFrom,i),weight:0,volume:0,count:0,missing:0}));result={route:name,stock:{weight:0,volume:0},stockCount:0,stockMissing:0,incoming:days(),outgoing:days()};routes.set(name,result);}
  return result;
 };
 const cached=new Map(history.rows.map(row=>[row.number,normalizeCargo(row.payload,null)]));
 const add=(kind:'incoming'|'outgoing',number:string,date:string)=>{
  const cargo=cached.get(number),group=cargo&&route(cargo.route);if(!cargo||!group)return;
  const day=group[kind].find(item=>item.date===date);if(!day)return;
  day.count++;day.weight+=cargo.weight??0;day.volume+=cargo.volume??0;if(cargo.weight==null||cargo.volume==null)day.missing++;
 };
 for(const [number,cargo] of cached)if(cargo.received>=historyFrom&&cargo.received<=historyTo)add('incoming',number,cargo.received);
 for(const departure of departures.rows)add('outgoing',departure.number,departure.date);
 // Stock includes future reservations: reserving is not a warehouse write-off.
 const seen=new Set<string>();
 for(const row of backlog.rows){const number=cleanNumber(row.payload.Number);if(seen.has(number))continue;seen.add(number);const cargo=cached.get(number)||normalizeCargo(row.payload,null),group=route(cargo.route);if(!group||cargo.readiness!=='ready')continue;
  group.stockCount++;group.stock.weight+=cargo.weight??0;group.stock.volume+=cargo.volume??0;if(cargo.weight==null||cargo.volume==null)group.stockMissing++;
 }
 for(const plan of schedule.rows)route(plan.route);
 return {today,historyFrom,historyTo,checkedAt:now.toISOString(),routes:[...routes.values()].sort((a,b)=>a.route.localeCompare(b.route)),schedule:schedule.rows.map(p=>({id:p.id,date:p.date,route:p.route,mode:p.mode,vehicleId:p.vehicle_id,vehicleDimensions:p.vehicle_dimensions})),unmatchedDepartures:departures.rows.filter(row=>!cached.has(row.number)).length,undatedDepartures:Number(undated.rows[0]?.count||0)};
}

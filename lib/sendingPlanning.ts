import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {VEHICLES,type TmsCargo} from '../src/features/tms/model.js';
import type {PlanDraft,PlanningData,SendingPlan} from '../src/features/documents/sendings/planning/planningModel.js';
import {cleanNumber,normalizeCargo,readBacklog} from './tms/backlog.js';
import {validPlanDate} from './planDateQueue.js';

export class PlanningError extends Error {constructor(message:string,public status=400){super(message);}}
const uuid=(value:unknown)=>typeof value==='string'&&/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value);
function validateDraft(value:unknown):PlanDraft {
 const draft=value as PlanDraft;
 if(!draft||!validPlanDate(draft.date))throw new PlanningError('Укажите корректную дату планирования');
 if(typeof draft.route!=='string'||draft.route.length>200||!/^.+ → .+$/.test(draft.route)||draft.route.includes('?'))throw new PlanningError('Выберите маршрут');
 if(!['auto','ferry','air'].includes(draft.mode))throw new PlanningError('Выберите тип транспорта');
 if(draft.mode!=='air'&&!VEHICLES.some(vehicle=>vehicle.id===draft.vehicleId&&vehicle.mode===(draft.mode==='auto'?'road':'ferry')))throw new PlanningError('Выберите тип ТС или контейнера из справочника ТМС');
 if(draft.mode==='ferry'&&(!Number.isSafeInteger(draft.ferryId)||Number(draft.ferryId)<=0))throw new PlanningError('Выберите паром');
 if(typeof draft.comment!=='string'||draft.comment.length>4000)throw new PlanningError('Комментарий должен содержать не более 4000 символов');
 if(!Array.isArray(draft.cargoNumbers)||draft.cargoNumbers.length>500||draft.cargoNumbers.some(number=>typeof number!=='string'||!/^\d{1,20}$/.test(number)||!cleanNumber(number)))throw new PlanningError('Выберите не более 500 перевозок');
 if(draft.id!==undefined&&(!uuid(draft.id)||!Number.isInteger(draft.revision)||Number(draft.revision)<1))throw new PlanningError('Обновите план перед сохранением');
 return {...draft,route:draft.route.trim(),comment:draft.comment.trim(),vehicleId:draft.mode==='air'?'':draft.vehicleId,ferryId:draft.mode==='ferry'?draft.ferryId:null,cargoNumbers:[...new Set(draft.cargoNumbers.map(cleanNumber))]};
}
async function actualNumbers(db:Pool|PoolClient,numbers:string[]):Promise<Set<string>> {
 if(!numbers.length)return new Set();
 const {rows}=await db.query<{number:string}>(`SELECT DISTINCT ltrim(btrim(value),'0') AS number
  FROM sendings_metrics,jsonb_array_elements_text(cargo_numbers)
  WHERE ltrim(btrim(value),'0')=ANY($1::text[])`,[numbers]);
 return new Set(rows.map(row=>row.number));
}
export async function readSendingPlans(pool:Pool,from:string,to:string):Promise<PlanningData> {
 if(!validPlanDate(from)||!validPlanDate(to)||from>to||Date.parse(to)-Date.parse(from)>62*86400000)throw new PlanningError('Выберите период не более двух месяцев');
 const [planResult,backlog,reservations,ferries]=await Promise.all([
  pool.query(`SELECT p.*,coalesce(f.name,p.ferry_name) AS resolved_ferry_name FROM sending_plans p LEFT JOIN ferries f ON f.id=p.ferry_id WHERE p.planned_date BETWEEN $1 AND $2 ORDER BY p.planned_date,p.created_at`,[from,to]),
  readBacklog(pool),pool.query<{cargo_number:string}>('SELECT cargo_number FROM sending_plan_cargo'),
  pool.query<{id:string;name:string}>('SELECT id,name FROM ferries WHERE active=true ORDER BY name'),
 ]);
 const ids=planResult.rows.map(plan=>plan.id);
 const cargo=ids.length?(await pool.query<{plan_id:string;snapshot:TmsCargo;cargo_number:string}>('SELECT plan_id,cargo_number,snapshot FROM sending_plan_cargo WHERE plan_id=ANY($1::uuid[]) ORDER BY position',[ids])).rows:[];
 const actual=await actualNumbers(pool,cargo.map(item=>item.cargo_number));
 const reserved=new Set(reservations.rows.map(row=>row.cargo_number));
 const plans:SendingPlan[]=planResult.rows.map(plan=>({id:plan.id,revision:plan.revision,date:plan.planned_date,route:plan.route,mode:plan.mode,vehicleId:plan.vehicle_id,ferryId:plan.ferry_id?Number(plan.ferry_id):null,ferryName:plan.resolved_ferry_name,comment:plan.comment,cargo:cargo.filter(item=>item.plan_id===plan.id).map(item=>item.snapshot),actualCargoNumbers:cargo.filter(item=>item.plan_id===plan.id&&actual.has(item.cargo_number)).map(item=>item.cargo_number)}));
 return {plans,available:backlog.rows.map(row=>normalizeCargo(row.payload,new Date(row.updated_at).toISOString())).filter(item=>!reserved.has(item.number)),ferries:ferries.rows.map(ferry=>({id:Number(ferry.id),name:ferry.name})),checkedAt:new Date().toISOString()};
}
export async function saveSendingPlan(pool:Pool,value:unknown,actor:string):Promise<string> {
 const draft=validateDraft(value),id=draft.id||randomUUID(),db=await pool.connect();
 try {
  await db.query('BEGIN');
  const previous=draft.id?(await db.query('SELECT * FROM sending_plans WHERE id=$1 FOR UPDATE',[id])).rows[0]:null;
  if(draft.id&&!previous)throw new PlanningError('План уже удалён. Обновите календарь.',409);
  if(previous&&previous.revision!==draft.revision)throw new PlanningError('План изменён другим сотрудником. Обновите календарь перед сохранением.',409);
  let ferryName='';
  if(draft.mode==='ferry'){
   const ferry=(await db.query('SELECT name FROM ferries WHERE id=$1 AND (active=true OR id=$2)',[draft.ferryId,previous?.ferry_id||null])).rows[0];
   if(!ferry)throw new PlanningError('Выбранный паром недоступен');
   ferryName=ferry.name;
  }
  const previousCargo=draft.id?(await db.query<{cargo_number:string;snapshot:TmsCargo}>('SELECT cargo_number,snapshot FROM sending_plan_cargo WHERE plan_id=$1',[id])).rows:[];
  const oldCargo=new Map(previousCargo.map(cargo=>[cargo.cargo_number,cargo.snapshot]));
  const actual=await actualNumbers(db,previousCargo.map(cargo=>cargo.cargo_number));
  if([...actual].some(number=>!draft.cargoNumbers.includes(number)))throw new PlanningError('Отправленные перевозки сохраняются в плане для сравнения плана и факта',409);
  const available=draft.cargoNumbers.length?await readBacklog(db as unknown as Pool,draft.cargoNumbers):{rows:[]};
  const live=new Map(available.rows.map(row=>{const item=normalizeCargo(row.payload,new Date(row.updated_at).toISOString());return [item.number,item] as const;}));
  const snapshots=draft.cargoNumbers.map(number=>{
   const item=live.get(number)||oldCargo.get(number);
   if(!item)throw new PlanningError(`Перевозка ${number} уже отправлена, завершена или отсутствует в списке доступных`,409);
   if(item.route!==draft.route)throw new PlanningError(`Перевозка ${number}: маршрут не совпадает с планом`);
   return item;
  });
  const conflicts=draft.cargoNumbers.length?(await db.query<{cargo_number:string}>('SELECT cargo_number FROM sending_plan_cargo WHERE cargo_number=ANY($1::text[]) AND plan_id<>$2',[draft.cargoNumbers,id])).rows:[];
  if(conflicts.length)throw new PlanningError(`Перевозка ${conflicts.map(row=>row.cargo_number).join(', ')} уже закреплена в другом плане`,409);
  if(previous)await db.query(`UPDATE sending_plans SET planned_date=$2,route=$3,mode=$4,vehicle_id=$5,ferry_id=$6,ferry_name=$7,comment=$8,revision=revision+1,updated_by=$9,updated_at=now() WHERE id=$1`,[id,draft.date,draft.route,draft.mode,draft.vehicleId,draft.ferryId,ferryName,draft.comment,actor]);
  else await db.query(`INSERT INTO sending_plans(id,planned_date,route,mode,vehicle_id,ferry_id,ferry_name,comment,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)`,[id,draft.date,draft.route,draft.mode,draft.vehicleId,draft.ferryId,ferryName,draft.comment,actor]);
  await db.query('DELETE FROM sending_plan_cargo WHERE plan_id=$1',[id]);
  for(const [position,cargo] of snapshots.entries())await db.query('INSERT INTO sending_plan_cargo(cargo_number,plan_id,position,snapshot) VALUES($1,$2,$3,$4)',[cargo.number,id,position,JSON.stringify(cargo)]);
  await db.query('COMMIT');return id;
 }catch(error){
  await db.query('ROLLBACK');
  if((error as {code?:string}).code==='23505')throw new PlanningError('Перевозка уже закреплена в другом плане. Обновите список.',409);
  throw error;
 }finally{db.release();}
}
export async function deleteSendingPlan(pool:Pool,id:unknown,revision:unknown) {
 if(!uuid(id)||!Number.isInteger(revision)||Number(revision)<1)throw new PlanningError('Обновите план перед удалением');
 const result=await pool.query('DELETE FROM sending_plans WHERE id=$1 AND revision=$2 RETURNING id',[id,revision]);
 if(!result.rows.length)throw new PlanningError('План уже изменён или удалён. Обновите календарь.',409);
}

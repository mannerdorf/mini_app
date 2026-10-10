import {readAccumulationData} from './sendingPlanningForecast.js';
import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {VEHICLES,type TmsCargo} from '../src/features/tms/model.js';
import {missingPlanFields,needsFerry,usesRoadVehicle,planningToday,type PlanDraft,type PlanningData,type SendingPlan,type PlanningReconciliation} from '../src/features/documents/sendings/planning/planningModel.js';
import {amount,cleanNumber,normalizeCargo,readBacklog} from './tms/backlog.js';
import {cargoPlannedDeliveryDateFromItem} from './cargoDateFilter.js';
import {validPlanDate} from './planDateQueue.js';

import {PlanningError} from './sendingPlanningError.js';
export {PlanningError} from './sendingPlanningError.js';
import {actualPlanningNumbers as actualNumbers} from './sendingPlanningFacts.js';
import {reconcileSendingPlans} from './sendingPlanningReconciliation.js';
const uuid=(value:unknown)=>typeof value==='string'&&/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value);
function validateDraft(value:unknown):PlanDraft {
 const draft=value as PlanDraft;
 if(!draft||!validPlanDate(draft.date))throw new PlanningError('Укажите корректную дату планирования');
 const partial=draft.isDraft===true;
 const title=typeof draft.title==='string'?draft.title.trim():'';
 if(draft.title!==undefined&&typeof draft.title!=='string'||title.length>200)throw new PlanningError('Название должно содержать не более 200 символов');
 if(partial&&!title)throw new PlanningError('Укажите название черновика');
 if(typeof draft.route!=='string'||draft.route.length>200||(!(partial&&!draft.route)&&(!/^.+ → .+$/.test(draft.route)||draft.route.includes('?'))))throw new PlanningError('Выберите маршрут');
 if(!['auto','roro','ferry','air',...(partial?['']:[])].includes(draft.mode))throw new PlanningError('Выберите тип транспорта');
 if(typeof draft.vehicleId!=='string'||draft.mode&&draft.mode!=='air'&&!(partial&&!draft.vehicleId)&&!VEHICLES.some(vehicle=>vehicle.id===draft.vehicleId&&vehicle.mode===(usesRoadVehicle(draft.mode)?'road':'ferry')))throw new PlanningError('Выберите тип ТС или контейнера из справочника ТМС');
 if((needsFerry(draft.mode)||partial&&!draft.mode)&&!(partial&&draft.ferryId===null)&&(!Number.isSafeInteger(draft.ferryId)||Number(draft.ferryId)<=0))throw new PlanningError('Выберите паром');
 if(draft.departureDate!==undefined&&(typeof draft.departureDate!=='string'||draft.departureDate!==''&&!validPlanDate(draft.departureDate)))throw new PlanningError('Укажите корректную дату выхода парома');
 if(draft.vehicleDimensions!==undefined&&draft.vehicleDimensions!==null&&(typeof draft.vehicleDimensions!=='object'||Array.isArray(draft.vehicleDimensions)||![draft.vehicleDimensions.length,draft.vehicleDimensions.width,draft.vehicleDimensions.height].every(value=>typeof value==='number'&&Number.isFinite(value)&&value>0&&value<=100)))throw new PlanningError('Укажите корректные внутренние размеры ТС');
 if(typeof draft.comment!=='string'||draft.comment.length>4000)throw new PlanningError('Комментарий должен содержать не более 4000 символов');
 if(!Array.isArray(draft.cargoNumbers)||draft.cargoNumbers.length>500||draft.cargoNumbers.some(number=>typeof number!=='string'||!/^\d{1,20}$/.test(number)||!cleanNumber(number)))throw new PlanningError('Выберите не более 500 перевозок');
 if(draft.id!==undefined&&(!uuid(draft.id)||!Number.isInteger(draft.revision)||Number(draft.revision)<1))throw new PlanningError('Обновите план перед сохранением');
 const cleaned={...draft,title,route:draft.route.trim(),comment:draft.comment.trim(),vehicleId:draft.mode==='air'||!draft.mode?'':draft.vehicleId,ferryId:needsFerry(draft.mode)||partial&&!draft.mode?draft.ferryId:null,departureDate:needsFerry(draft.mode)||partial&&!draft.mode?draft.departureDate:'',vehicleDimensions:draft.mode&&draft.mode!=='air'&&draft.vehicleId?draft.vehicleDimensions:null,cargoNumbers:[...new Set(draft.cargoNumbers.map(cleanNumber))]};
 return {...cleaned,isDraft:partial&&missingPlanFields(cleaned).length>0};
}
export async function readSendingPlans(pool:Pool,from:string,to:string,includeForecast=false):Promise<PlanningData> {
 if(!validPlanDate(from)||!validPlanDate(to)||from>to||Date.parse(to)-Date.parse(from)>62*86400000)throw new PlanningError('Выберите период не более двух месяцев');
 await reconcileSendingPlans(pool,{from,to});
 const [planResult,backlog,reservations,ferries]=await Promise.all([
  pool.query(`SELECT p.*,coalesce(f.name,p.ferry_name) AS resolved_ferry_name FROM sending_plans p LEFT JOIN ferries f ON f.id=p.ferry_id WHERE p.planned_date BETWEEN $1 AND $2 ORDER BY p.planned_date,p.created_at`,[from,to]),
  readBacklog(pool),pool.query<{cargo_number:string}>('SELECT cargo_number FROM sending_plan_cargo'),
  pool.query<{id:string;name:string}>('SELECT id,name FROM ferries WHERE active=true ORDER BY name'),
 ]);
 const ids=planResult.rows.map(plan=>plan.id);
 const checks=ids.length?(await pool.query('SELECT * FROM sending_plan_reconciliations WHERE plan_id=ANY($1::uuid[])',[ids])).rows:[];
 const reconciliations=new Map<string,PlanningReconciliation>(checks.map(check=>[check.plan_id,{checkedAt:new Date(check.checked_at).toISOString(),sending:check.sending,originalCargo:check.original_cargo,actualCargoNumbers:check.actual_cargo_numbers,releasedCargoNumbers:check.released_cargo_numbers,otherActualCargoNumbers:check.other_actual_cargo_numbers}]));
 let cargo=ids.length?(await pool.query<{plan_id:string;snapshot:TmsCargo;cargo_number:string}>('SELECT plan_id,cargo_number,snapshot FROM sending_plan_cargo WHERE plan_id=ANY($1::uuid[]) ORDER BY position',[ids])).rows:[];
 const missingDetails=cargo.filter(item=>!item.snapshot.sender?.trim()||item.snapshot.paidWeight===undefined||item.snapshot.plannedDeliveryDate===undefined||item.snapshot.slaDeadline===undefined).map(item=>item.cargo_number);
 if(missingDetails.length){
  // Enrich legacy snapshots only where these fields were absent; preserve their recorded metrics.
  const cached=(await pool.query<{number:string;sender:string|null;paid_weight:unknown;payload:Record<string,unknown>}>(`SELECT DISTINCT ON (ltrim(btrim(doc_number),'0')) ltrim(btrim(doc_number),'0') AS number,
   CASE WHEN jsonb_typeof(payload->'Sender')='string' THEN btrim(payload->>'Sender') END AS sender,payload->'PW' AS paid_weight,payload
   FROM cache_perevozki_rows WHERE ltrim(btrim(doc_number),'0')=ANY($1::text[])
   ORDER BY ltrim(btrim(doc_number),'0'),updated_at DESC NULLS LAST`,[missingDetails])).rows;
  const details=new Map(cached.map(item=>[item.number,item]));
  cargo=cargo.map(item=>{
   const detail=details.get(item.cargo_number),normalized=item.snapshot.slaDeadline===undefined?normalizeCargo(detail?.payload||{},null):null;
   return {...item,snapshot:{...item.snapshot,sender:item.snapshot.sender?.trim()||detail?.sender||'',
    paidWeight:item.snapshot.paidWeight===undefined?amount(detail?.paid_weight):item.snapshot.paidWeight,
    plannedDeliveryDate:item.snapshot.plannedDeliveryDate===undefined?cargoPlannedDeliveryDateFromItem(detail?.payload||{}):item.snapshot.plannedDeliveryDate,
    ...(normalized?{slaDeadline:normalized.slaDeadline,slaPlanDays:normalized.slaPlanDays}:{})}};
  });
 }
 const actual=await actualNumbers(pool,cargo.map(item=>item.cargo_number));
 const reserved=new Set(reservations.rows.map(row=>row.cargo_number));
 const plans:SendingPlan[]=planResult.rows.map(plan=>({id:plan.id,revision:plan.revision,title:plan.title||'',isDraft:!!plan.is_draft,departureDate:plan.departure_date||'',vehicleDimensions:plan.vehicle_dimensions||null,date:plan.planned_date,route:plan.route,mode:plan.mode,vehicleId:plan.vehicle_id,ferryId:plan.ferry_id?Number(plan.ferry_id):null,ferryName:plan.resolved_ferry_name,comment:plan.comment,cargo:cargo.filter(item=>item.plan_id===plan.id).map(item=>item.snapshot),actualCargoNumbers:reconciliations.get(plan.id)?.actualCargoNumbers??cargo.filter(item=>item.plan_id===plan.id&&actual.has(item.cargo_number)).map(item=>item.cargo_number),reconciliation:reconciliations.get(plan.id),factCandidates:plan.fact_candidates||[]}));
 const forecast=includeForecast?await readAccumulationData(pool,backlog):undefined;
 return {forecast,plans,available:backlog.rows.map(row=>normalizeCargo(row.payload,new Date(row.updated_at).toISOString())).filter(item=>!reserved.has(item.number)),ferries:ferries.rows.map(ferry=>({id:Number(ferry.id),name:ferry.name})),checkedAt:new Date().toISOString()};
}
export async function saveSendingPlan(pool:Pool,value:unknown,actor:string):Promise<string> {
 const draft=validateDraft(value),id=draft.id||randomUUID(),db=await pool.connect();
 try {
  await db.query('BEGIN');
  const previous=draft.id?(await db.query('SELECT * FROM sending_plans WHERE id=$1 FOR UPDATE',[id])).rows[0]:null;
  if(draft.id&&!previous)throw new PlanningError('План уже удалён. Обновите календарь.',409);
  if(previous&&previous.revision!==draft.revision)throw new PlanningError('План изменён другим сотрудником. Обновите календарь перед сохранением.',409);
  const departureDate=draft.departureDate??previous?.departure_date??'';
  const vehicleDimensions=draft.vehicleDimensions===undefined&&previous?.vehicle_id===draft.vehicleId?previous?.vehicle_dimensions??null:draft.vehicleDimensions??null;
  let ferryName='';
  if(draft.ferryId){
   const ferry=(await db.query('SELECT name FROM ferries WHERE id=$1 AND (active=true OR id=$2)',[draft.ferryId,previous?.ferry_id||null])).rows[0];
   if(!ferry)throw new PlanningError('Выбранный паром недоступен');
   ferryName=ferry.name;
  }
  const previousCargo=draft.id?(await db.query<{cargo_number:string;snapshot:TmsCargo}>('SELECT cargo_number,snapshot FROM sending_plan_cargo WHERE plan_id=$1',[id])).rows:[];
  const oldCargo=new Map(previousCargo.map(cargo=>[cargo.cargo_number,cargo.snapshot]));
  if(draft.date<planningToday()&&((previous&&previous.planned_date!==draft.date&&draft.cargoNumbers.length>0)||draft.cargoNumbers.some(number=>!oldCargo.has(number))))throw new PlanningError('Нельзя добавлять перевозки на прошедшие даты');
  const reconciled=previous&&(await db.query('SELECT 1 FROM sending_plan_reconciliations WHERE plan_id=$1',[id])).rows.length>0;
  if(reconciled){
   const sameDimensions=(!vehicleDimensions&&!previous.vehicle_dimensions)||!!vehicleDimensions&&!!previous.vehicle_dimensions&&(['length','width','height'] as const).every(key=>vehicleDimensions[key]===previous.vehicle_dimensions[key]);
   const unchanged=draft.date===previous.planned_date&&draft.route===previous.route&&draft.mode===previous.mode&&draft.vehicleId===previous.vehicle_id&&draft.ferryId===(previous.ferry_id?Number(previous.ferry_id):null)&&departureDate===previous.departure_date&&sameDimensions&&draft.cargoNumbers.length===oldCargo.size&&draft.cargoNumbers.every(number=>oldCargo.has(number));
   if(!unchanged)throw new PlanningError('План уже сверён с фактом. Параметры и состав сохранены в истории; доступно изменение комментария.',409);
  }
  const actual=await actualNumbers(db,previousCargo.map(cargo=>cargo.cargo_number));
  if([...actual].some(number=>!draft.cargoNumbers.includes(number)))throw new PlanningError('Отправленные перевозки сохраняются в плане для сравнения плана и факта',409);
  const available=draft.cargoNumbers.length?await readBacklog(db as unknown as Pool,draft.cargoNumbers):{rows:[]};
  const live=new Map(available.rows.map(row=>{const item=normalizeCargo(row.payload,new Date(row.updated_at).toISOString());return [item.number,item] as const;}));
  const snapshots=draft.cargoNumbers.map(number=>{
   const item=reconciled?oldCargo.get(number):live.get(number)||oldCargo.get(number);
   if(!item)throw new PlanningError(`Перевозка ${number} уже отправлена, завершена или отсутствует в списке доступных`,409);
   if(item.route!==draft.route)throw new PlanningError(`Перевозка ${number}: маршрут не совпадает с планом`);
   return item;
  });
  const conflicts=draft.cargoNumbers.length?(await db.query<{cargo_number:string}>('SELECT cargo_number FROM sending_plan_cargo WHERE cargo_number=ANY($1::text[]) AND plan_id<>$2',[draft.cargoNumbers,id])).rows:[];
  if(conflicts.length)throw new PlanningError(`Перевозка ${conflicts.map(row=>row.cargo_number).join(', ')} уже закреплена в другом плане`,409);
  if(previous)await db.query(`UPDATE sending_plans SET planned_date=$2,route=$3,mode=$4,vehicle_id=$5,ferry_id=$6,ferry_name=$7,comment=$8,revision=revision+1,updated_by=$9,title=$10,is_draft=$11,departure_date=$12,vehicle_dimensions=$13,updated_at=now() WHERE id=$1`,[id,draft.date,draft.route,draft.mode,draft.vehicleId,draft.ferryId,ferryName,draft.comment,actor,draft.title,draft.isDraft,departureDate,vehicleDimensions]);
  else await db.query(`INSERT INTO sending_plans(id,planned_date,route,mode,vehicle_id,ferry_id,ferry_name,comment,created_by,updated_by,title,is_draft,departure_date,vehicle_dimensions) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,$11,$12,$13)`,[id,draft.date,draft.route,draft.mode,draft.vehicleId,draft.ferryId,ferryName,draft.comment,actor,draft.title,draft.isDraft,departureDate,vehicleDimensions]);
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
 const result=await pool.query('DELETE FROM sending_plans p WHERE id=$1 AND revision=$2 AND NOT EXISTS(SELECT 1 FROM sending_plan_reconciliations r WHERE r.plan_id=p.id) RETURNING id',[id,revision]);
 if(!result.rows.length)throw new PlanningError('План уже изменён, удалён или сохранён в истории сверки. Обновите календарь.',409);
}

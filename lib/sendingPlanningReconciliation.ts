import type {Pool,PoolClient} from 'pg';
import type {TmsCargo} from '../src/features/tms/model.js';
import {planningToday} from '../src/features/documents/sendings/planning/planningModel.js';
import {PlanningError} from './sendingPlanningError.js';
import {actualPlanningNumbers,matchingPlanningFacts,publicPlanningFact,readPlanningFacts,type PlanningFact} from './sendingPlanningFacts.js';

async function reconcileLockedPlan(db:PoolClient,plan:{id:string;revision:number;planned_date:string;route:string},fact:PlanningFact,actor:string) {
 const cargo=(await db.query<{cargo_number:string;snapshot:TmsCargo}>('SELECT cargo_number,snapshot FROM sending_plan_cargo WHERE plan_id=$1 ORDER BY position',[plan.id])).rows;
 const factNumbers=new Set(fact.numbers),assigned=await actualPlanningNumbers(db,cargo.map(item=>item.cargo_number));
 const actual=cargo.filter(item=>factNumbers.has(item.cargo_number)).map(item=>item.cargo_number);
 if(!actual.length)throw new PlanningError('В этой отправке нет перевозок выбранного плана. Обновите календарь.',409);
 const otherActual=cargo.filter(item=>!factNumbers.has(item.cargo_number)&&assigned.has(item.cargo_number)).map(item=>item.cargo_number);
 const released=cargo.filter(item=>!factNumbers.has(item.cargo_number)&&!assigned.has(item.cargo_number)).map(item=>item.cargo_number);
 await db.query(`INSERT INTO sending_plan_reconciliations(plan_id,original_cargo,actual_cargo_numbers,released_cargo_numbers,other_actual_cargo_numbers,sending,checked_by)
 VALUES($1,$2,$3,$4,$5,$6,$7)`,[plan.id,JSON.stringify(cargo.map(item=>item.snapshot)),JSON.stringify(actual),JSON.stringify(released),JSON.stringify(otherActual),JSON.stringify(publicPlanningFact(fact)),actor]);
 if(released.length)await db.query('DELETE FROM sending_plan_cargo WHERE plan_id=$1 AND cargo_number=ANY($2::text[])',[plan.id,released]);
 await db.query("UPDATE sending_plans SET revision=revision+1,reconciliation_checked_at=now(),fact_candidates='[]',updated_at=now(),updated_by=$2 WHERE id=$1",[plan.id,actor]);
 return {released:released.length,actual:actual.length};
}

/** DB only. A positive, fresh sending match is required; no sending never releases cargo. */
export async function reconcileSendingPlans(pool:Pool,range?:{from:string;to:string},now=new Date()) {
 const db=await pool.connect();let locked=false;
 try{
  locked=(await db.query('SELECT pg_try_advisory_lock(134,1) AS locked')).rows[0]?.locked===true;
  if(!locked)return {checked:0,reconciled:0,released:0,skipped:true};
  await db.query('BEGIN');
  const plans=(await db.query<{id:string;revision:number;planned_date:string;route:string}>(`SELECT p.id,p.revision,p.planned_date,p.route FROM sending_plans p
  WHERE p.planned_date<$1 AND ($2::text IS NULL OR p.planned_date BETWEEN $2 AND $3)
   AND EXISTS(SELECT 1 FROM sending_plan_cargo c WHERE c.plan_id=p.id)
   AND NOT EXISTS(SELECT 1 FROM sending_plan_reconciliations r WHERE r.plan_id=p.id)
  ORDER BY p.reconciliation_checked_at NULLS FIRST,p.planned_date LIMIT 50 FOR UPDATE OF p SKIP LOCKED`,[planningToday(now),range?.from??null,range?.to??null])).rows;
  const facts=plans.length?await readPlanningFacts(db,plans.reduce((date,plan)=>plan.planned_date<date?plan.planned_date:date,plans[0].planned_date),now):[];
  let reconciled=0,released=0;
  for(const plan of plans){
   const cargo=(await db.query<{cargo_number:string}>('SELECT cargo_number FROM sending_plan_cargo WHERE plan_id=$1',[plan.id])).rows;
   const matches=matchingPlanningFacts({date:plan.planned_date,route:plan.route,numbers:cargo.map(item=>item.cargo_number)},facts,now);
   if(matches.length===1&&matches[0].fresh){const result=await reconcileLockedPlan(db,plan,matches[0],'automatic-plan-fact');reconciled++;released+=result.released;}
   else await db.query('UPDATE sending_plans SET reconciliation_checked_at=now(),fact_candidates=$2 WHERE id=$1',[plan.id,JSON.stringify(matches.map(publicPlanningFact))]);
  }
  await db.query('COMMIT');return {checked:plans.length,reconciled,released};
 }catch(error){await db.query('ROLLBACK');throw error;}
 finally{try{if(locked)await db.query('SELECT pg_advisory_unlock(134,1)');}finally{db.release();}}
}

export async function chooseSendingPlanFact(pool:Pool,id:unknown,revision:unknown,sendingKey:unknown,actor:string,now=new Date()) {
 if(typeof id!=='string'||!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id)||!Number.isInteger(revision)||Number(revision)<1||typeof sendingKey!=='string'||!sendingKey||sendingKey.length>500)throw new PlanningError('Обновите план перед сверкой');
 const db=await pool.connect();
 try{
  await db.query('BEGIN');
  const plan=(await db.query('SELECT * FROM sending_plans WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(!plan||plan.revision!==revision)throw new PlanningError('План изменён. Обновите календарь перед сверкой.',409);
  if(plan.planned_date>=planningToday(now))throw new PlanningError('Сверка выполняется после даты планирования');
  if((await db.query('SELECT 1 FROM sending_plan_reconciliations WHERE plan_id=$1',[id])).rows.length)throw new PlanningError('План уже сверён. Обновите календарь.',409);
  const cargo=(await db.query<{cargo_number:string}>('SELECT cargo_number FROM sending_plan_cargo WHERE plan_id=$1',[id])).rows;
  const matches=matchingPlanningFacts({date:plan.planned_date,route:plan.route,numbers:cargo.map(item=>item.cargo_number)},await readPlanningFacts(db,plan.planned_date,now),now);
  const fact=matches.find(candidate=>candidate.key===sendingKey);
  if(!fact)throw new PlanningError('Отправка больше не совпадает с этим планом. Обновите календарь.',409);
  if(!fact.fresh)throw new PlanningError('Состав отправки ещё не обновлён после даты планирования или данные устарели. Дождитесь обновления 1С.',409);
  const result=await reconcileLockedPlan(db,plan,fact,actor);
  await db.query('COMMIT');return result;
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}

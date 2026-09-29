import type { Pool } from 'pg';
export type PlanDateTask = {cargo_number:string;target_date:string;state:string;requested_by:string;attempts:number;checks:number;last_error:string|null};
export type PlanDateIO = {
  write: (number:string,date:string)=>Promise<{ok:boolean;uncertain?:boolean;error?:string}>;
  read: (number:string)=>Promise<string|null>;
};
export function planDateNumber(raw: unknown): string {
  const value=String(raw??'').trim().replace(/^0000-/, '');
  if (!/^\d{1,9}$/.test(value)) throw new Error('Некорректный номер перевозки');
  return value.padStart(9,'0');
}
export function validPlanDate(value: unknown): value is string {
  return typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
}
export async function enqueuePlanDates(pool:Pool, numbers:string[], date:string, actor:string) {
  if (!validPlanDate(date)) throw new Error('Укажите корректную дату');
  const unique=[...new Set(numbers.map(planDateNumber))];
  if (!unique.length || unique.length>500) throw new Error('Выберите от 1 до 500 перевозок');
  const db=await pool.connect();
  try {
    await db.query('BEGIN');
    const tasks:PlanDateTask[]=[];
    for (const number of unique.sort()) {
      // Same cargo/date is idempotent. Unknown writes cannot be replaced by a new date.
      await db.query(`INSERT INTO plan_date_queue(cargo_number,target_date,requested_by) VALUES($1,$2,$3)
        ON CONFLICT(cargo_number) DO UPDATE SET target_date=$2,requested_by=$3,state='pending',attempts=0,checks=0,last_error=NULL,next_at=now(),updated_at=now()
        WHERE plan_date_queue.state IN ('pending','done','error') AND plan_date_queue.target_date<>$2`,[number,date,actor]);
      const task=(await db.query<PlanDateTask>('SELECT * FROM plan_date_queue WHERE cargo_number=$1 FOR UPDATE',[number])).rows[0];
      if(task.target_date!==date) throw new Error(`Перевозка ${number}: предыдущая запись требует завершения или сверки`);
      tasks.push(task);
    }
    await db.query('COMMIT');return tasks;
  } catch(e){await db.query('ROLLBACK');throw e;} finally{db.release();}
}
/** Explicit user retry; active tasks and completed writes cannot be reset. */
export async function resumePlanDate(pool:Pool, number:unknown, date:unknown, updatedAt:unknown, actor:string) {
  if(!validPlanDate(date) || typeof updatedAt!=='string' || !Number.isFinite(Date.parse(updatedAt))) throw new Error('Обновите очередь перед продолжением');
  const result=await pool.query(`UPDATE plan_date_queue SET state='pending',checks=0,last_error=NULL,
    requested_by=$4,next_at=now(),updated_at=now()
    WHERE cargo_number=$1 AND target_date=$2 AND date_trunc('milliseconds',updated_at)=date_trunc('milliseconds',$3::timestamptz)
      AND state IN ('error','uncertain') RETURNING *`,[planDateNumber(number),date,updatedAt,actor]);
  if(!result.rows.length) throw new Error('Запись уже изменилась или обрабатывается. Обновите очередь.');
  return result.rows[0];
}
export async function processPlanDateQueue(pool:Pool, io:PlanDateIO) {
  const db=await pool.connect();
  let locked=false;
  try {
    locked=Boolean((await db.query('SELECT pg_try_advisory_lock(120,1) AS locked')).rows[0]?.locked);
    if(!locked) return {processed:0};
    // A crashed sender is reconciled by reading, never resent.
    await db.query(`UPDATE plan_date_queue SET state='verifying',next_at=now(),last_error='Проверка после прерывания записи'
      WHERE state='sending' AND updated_at<now()-interval '3 minutes'`);
    const task=(await db.query<PlanDateTask>(`SELECT * FROM plan_date_queue WHERE state IN ('pending','verifying') AND next_at<=now() ORDER BY next_at,created_at LIMIT 1`)).rows[0];
    if(!task) return {processed:0};
    let done=false;
    if(task.state==='pending') {
      const claimed=await db.query(`UPDATE plan_date_queue SET state='sending',attempts=attempts+1,updated_at=now()
        WHERE cargo_number=$1 AND target_date=$2 AND state='pending' RETURNING *`,[task.cargo_number,task.target_date]);
      if(!claimed.rows.length) return {processed:0};
      let result:Awaited<ReturnType<PlanDateIO['write']>>;
      try{result=await io.write(task.cargo_number,task.target_date);}catch{result={ok:false,uncertain:true,error:'Ответ 1С не получен'};}
      done=result.ok;
      if(!done) await db.query(`UPDATE plan_date_queue SET state=$2,last_error=$3,next_at=now()+interval '1 minute',updated_at=now() WHERE cargo_number=$1`,
        [task.cargo_number,result.uncertain?'verifying':'error',result.error||'1С отклонила запись']);
    } else {
      let observed:string|null=null;
      try{observed=await io.read(task.cargo_number);}catch{/* retain the ambiguous write */}
      done=observed===task.target_date;
      if(!done) await db.query(`UPDATE plan_date_queue SET checks=checks+1,state=CASE WHEN checks>=2 THEN 'uncertain' ELSE 'verifying' END,
        next_at=now()+interval '5 minutes',updated_at=now(),last_error=$2 WHERE cargo_number=$1`,
        [task.cargo_number,observed?`В 1С дата ${observed}; требуется сверка`:'1С не вернула подтверждение плановой даты; требуется сверка']);
    }
    if(done) {
      await db.query('BEGIN');
      // Patch only confirmed fields. Do not change freshness of the entire cache.
      const patch=JSON.stringify({DateArrivalPlan:task.target_date,DateDeliveryPlan:task.target_date,PlanDate:task.target_date});
      const exists=(await db.query("SELECT to_regclass('public.cache_perevozki_rows') AS table_name")).rows[0]?.table_name;
      if(exists) await db.query(`UPDATE cache_perevozki_rows SET payload=payload || $2::jsonb WHERE ltrim(coalesce(payload->>'rawNumber',payload->>'Number',doc_number),'0')=ltrim($1,'0')`,[task.cargo_number,patch]);
      const legacy=(await db.query("SELECT to_regclass('public.cache_perevozki') AS table_name")).rows[0]?.table_name;
      if(legacy) await db.query(`UPDATE cache_perevozki SET data=(SELECT jsonb_agg(CASE WHEN ltrim(coalesce(item->>'rawNumber',item->>'Number'),'0')=ltrim($1,'0') THEN item || $2::jsonb ELSE item END ORDER BY ord) FROM jsonb_array_elements(data) WITH ORDINALITY AS x(item,ord)) WHERE id=1 AND jsonb_typeof(data)='array' AND jsonb_array_length(data)>0`,[task.cargo_number,patch]);
      await db.query("UPDATE plan_date_queue SET state='done',last_error=NULL,updated_at=now() WHERE cargo_number=$1",[task.cargo_number]);
      await db.query('COMMIT');
    }
    return {processed:1,number:task.cargo_number,date:task.target_date,done};
  } catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}
  finally{if(locked)await db.query('SELECT pg_advisory_unlock(120,1)').catch(()=>{});db.release();}
}

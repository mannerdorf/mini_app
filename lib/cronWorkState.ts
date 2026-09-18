import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

/** Durable interval/cursor; a crashed worker's lease expires without advancing its cursor. */
export async function runCronWork<T>(pool:Pool,name:string,intervalMinutes:number,work:(cursor:any)=>Promise<{result:T;cursor:any}>) {
  await pool.query('INSERT INTO cron_work_state(name) VALUES($1) ON CONFLICT DO NOTHING',[name]);
  const token=randomUUID();
  const row=(await pool.query(`UPDATE cron_work_state SET token=$2,lease_until=now()+interval '10 minutes',updated_at=now()
    WHERE name=$1 AND next_at<=now() AND (lease_until IS NULL OR lease_until<now()) RETURNING cursor`,[name,token])).rows[0];
  if(!row) return {ok:true,skipped:true,reason:'not_due_or_running'};
  try {
    const {result,cursor}=await work(row.cursor);
    await pool.query(`UPDATE cron_work_state SET cursor=$3,next_at=date_trunc('hour',updated_at)+floor(extract(minute from updated_at)/5)*interval '5 minutes'+$4*interval '1 minute',
      token=NULL,lease_until=NULL,failures=0,updated_at=now() WHERE name=$1 AND token=$2`,[name,token,JSON.stringify(cursor),intervalMinutes]);
    return result;
  } catch(error) {
    await pool.query(`UPDATE cron_work_state SET failures=failures+1,next_at=now()+
      least(360,CASE WHEN failures>=2 THEN 60*power(2,least(failures-2,3)) ELSE 5*power(2,failures) END)*interval '1 minute',
      token=NULL,lease_until=NULL,updated_at=now() WHERE name=$1 AND token=$2`,[name,token]);
    throw error;
  }
}

/** Calendar windows follow Moscow even when Node runs in UTC. */
export function cronDateWindow(days: number, now = new Date()) {
  const shifted = new Date(now.getTime() + 3 * 3600000);
  const dateTo = shifted.toISOString().slice(0, 10);
  shifted.setUTCDate(shifted.getUTCDate() - (days - 1));
  return {dateFrom: shifted.toISOString().slice(0, 10), dateTo};
}

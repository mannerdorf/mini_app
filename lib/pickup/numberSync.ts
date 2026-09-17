import type { Pool } from 'pg';
import { deliverySetter } from './deliveryService.js';
export function resolveOrderNumber(rows: any[], input: { order_number: string; customer_inn: string }): string {
  const candidates = rows.filter(row => String(row.ЗаказчикИНН ?? '') === input.customer_inn &&
    [row.Номер, row.НомерЗаявкиКлиента].some(value => String(value ?? '').trim() === input.order_number));
  if (candidates.length !== 1) throw new Error('Заявка не найдена в БД или номер неоднозначен. Дождитесь загрузки GetZayavki и проверьте ИНН.');
  const number = String(candidates[0].Номер);
  const globalMatches = rows.filter(row => [row.Номер, row.НомерЗаявкиКлиента].some(value => String(value ?? '').trim() === number));
  if (globalMatches.length !== 1) throw new Error('Номер заявки неоднозначен для SetPickupNumber');
  return number;
}
export async function syncPickupNumbers(pool: Pool) {
  const db = await pool.connect();
  let locked = false;
  try {
    locked = (await db.query("SELECT pg_try_advisory_lock(114,1) AS locked")).rows[0]?.locked === true;
    if (!locked) return { skipped: true, synced: 0, failed: 0 };
    const cache = await db.query('SELECT data,fetched_at FROM cache_orders WHERE id=1');
    const orders = cache.rows[0]?.data;
    if (!cache.rows[0]?.fetched_at || Date.now()-new Date(cache.rows[0].fetched_at).getTime()>30*60000) throw new Error('Обновите кэш заявок перед передачей номеров');
    if (!Array.isArray(orders)) throw new Error('Сначала загрузите заявки GetZayavki');
    const { rows } = await db.query(`SELECT * FROM pickup_number_sync WHERE state<>'synced' AND next_attempt_at<=now() ORDER BY next_attempt_at LIMIT 20`);
    let synced = 0, failed = 0;
    const deadline=Date.now()+45000;
    let cursor=0;
    async function worker() {
      while(cursor<rows.length && Date.now()<deadline) {
      const row=rows[cursor++];
      let result;
      try {
        const current=await db.query('SELECT generation FROM pickup_number_sync WHERE job_id=$1',[row.job_id]);
        if(current.rows[0]?.generation!==row.generation) continue;
        if (!row.pickup_number || row.pickup_number.length > 50) throw new Error('Номер забора должен содержать от 1 до 50 символов');
        const number = resolveOrderNumber(orders, row);
        result = await deliverySetter('SetPickupNumber', { Номер: number, НомерПикапа: row.pickup_number });
      } catch (error) { result = { ok: false, error: (error as Error).message }; }
      const updated = await db.query(`UPDATE pickup_number_sync SET state=$3,attempts=attempts+1,last_error=$4,
        synced_at=CASE WHEN $3='synced' THEN now() ELSE NULL END,
        next_attempt_at=now()+interval '5 minutes'*least(288,power(2,least(attempts,9))),updated_at=now()
        WHERE job_id=$1 AND generation=$2 RETURNING job_id`, [row.job_id,row.generation,result.ok?'synced':'error',result.error || null]);
      if (updated.rows.length) { if (result.ok) synced++; else failed++; }
    }
    }
    await Promise.all([worker(),worker(),worker()]);
    return { synced, failed };
  } finally { try { if (locked) await db.query('SELECT pg_advisory_unlock(114,1)'); } finally { db.release(); } }
}

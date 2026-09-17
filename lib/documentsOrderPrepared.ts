import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import type { ZayavkaUploadPayload } from './post1cZayavkaUpload.js';
function canonical(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value==='object') return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
export async function prepareDocumentsOrder(pool: Pool, actor: string, input: ZayavkaUploadPayload, prepare: ()=>Promise<ZayavkaUploadPayload>) {
  const hash=createHash('sha256').update(canonical(input)).digest('hex');
  const db=await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[JSON.stringify([input.ЗаказчикИНН,input.НомерЗаявкиКлиента])]);
    const previous=(await db.query('SELECT * FROM documents_order_prepared WHERE customer_inn=$1 AND client_number=$2',[input.ЗаказчикИНН,input.НомерЗаявкиКлиента])).rows[0];
    if (previous && (previous.request_hash!==hash || previous.actor!==actor)) throw new Error('Заявка с этим номером уже подготавливалась. Сверьте результат в 1С перед изменением данных.');
    const payload: ZayavkaUploadPayload = previous?.payload ?? await prepare();
    if (!previous) await db.query('INSERT INTO documents_order_prepared(customer_inn,client_number,actor,request_hash,payload) VALUES($1,$2,$3,$4,$5)',[input.ЗаказчикИНН,input.НомерЗаявкиКлиента,actor,hash,JSON.stringify(payload)]);
    await db.query('COMMIT'); return payload;
  } catch(e) { await db.query('ROLLBACK'); throw e; } finally { db.release(); }
}

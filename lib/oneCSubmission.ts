import { createHash } from 'node:crypto';
import type { Pool } from 'pg';

type Outcome = { ok: boolean; status?: number; nomerZayavki?: string; reference?: string; error?: string; raw?: unknown; responseText?: string };
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

/** A persisted claim survives worker restarts. Unknown outcomes are never automatically resent. */
export async function submitOnce(pool: Pick<Pool,'query'>, identity: string, payload: unknown, send: (key: string) => Promise<Outcome>): Promise<Outcome> {
  const key = hash(identity), requestHash = hash(canonical(payload));
  const claim = await pool.query(
    `INSERT INTO one_c_order_submissions(operation_key,request_hash,state) VALUES($1,$2,'sending')
     ON CONFLICT DO NOTHING RETURNING operation_key`, [key,requestHash],
  );
  if (!claim.rows.length) {
    const { rows } = await pool.query<{request_hash:string;state:string;response:Outcome}>(
      'SELECT request_hash,state,response FROM one_c_order_submissions WHERE operation_key=$1', [key],
    );
    const existing = rows[0];
    if (existing?.request_hash !== requestHash) return {ok:false,status:409,error:'Заявка с этим номером уже отправлялась с другими данными. Сверьте её в 1С.'};
    if (existing.state === 'succeeded' && existing.response?.ok) return existing.response;
    return {ok:false,status:409,error:'Отправка уже начата или её результат неизвестен. Повторная отправка заблокирована. Сверьте заявку в 1С по номеру клиента; не создавайте новый номер для обхода проверки.'};
  }
  let outcome: Outcome;
  try { outcome = await send(key); }
  catch { outcome = {ok:false,status:502,error:'Результат отправки в 1С неизвестен. Требуется сверка перед повтором.'}; }
  // Never persist upstream headers/credentials. A completed receipt permits local finalization retries.
  const receipt: Outcome = {ok:outcome.ok,status:outcome.status,nomerZayavki:outcome.nomerZayavki,reference:outcome.reference,error:outcome.error};
  await pool.query('UPDATE one_c_order_submissions SET state=$2,response=$3,updated_at=now() WHERE operation_key=$1',
    [key,outcome.ok?'succeeded':'uncertain',JSON.stringify(receipt)]);
  return outcome.ok ? outcome : {...outcome,error:`${outcome.error || 'Ошибка 1С'}. Автоматический повтор заблокирован; требуется сверка результата в 1С.`};
}

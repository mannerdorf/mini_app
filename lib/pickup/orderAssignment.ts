import type { PoolClient } from 'pg';
import { PickupError } from './model.js';
import { findCustomerOrder } from './validateOrder.js';

const text = (value: unknown) => String(value ?? '').trim();
/** Call under the pickup order-assignment transaction lock for writes. */
export async function assertPickupOrderAvailable(db: Pick<PoolClient, 'query'>, input: {
  id: string; number: string; customerInn: string; jobNumber?: string; serviceKind?: string;
}) {
  if (input.serviceKind === 'last_mile' || !text(input.number)) return text(input.number);
  const cached = (await db.query('SELECT data FROM cache_orders WHERE id=1')).rows[0]?.data;
  const order = findCustomerOrder(Array.isArray(cached) ? cached : [], text(input.number), text(input.customerInn));
  const number = text(order?.Номер) || text(input.number);
  const { rows } = await db.query<{ job_number: string }>(`
    SELECT job_number FROM pickup_jobs
    WHERE id<>$1::uuid AND btrim(data->>'customerInn')=$2
      AND coalesce(data->>'serviceKind','pickup')<>'last_mile'
      AND CASE WHEN btrim(data->>'zayavkaNumber') ~ '^[0-9]+$'
        THEN coalesce(nullif(ltrim(btrim(data->>'zayavkaNumber'),'0'),''),'0')
        ELSE btrim(data->>'zayavkaNumber') END =
      CASE WHEN $3::text ~ '^[0-9]+$' THEN coalesce(nullif(ltrim($3::text,'0'),''),'0') ELSE $3::text END
    LIMIT 1`, [input.id, text(input.customerInn), number]);
  const assignedPickup = rows.length ? text(rows[0]?.job_number) || 'без номера' : text(order?.НомерПикапа);
  if (rows.length || (assignedPickup && assignedPickup !== text(input.jobNumber))) {
    throw new PickupError(`Заявка ${number} уже привязана к пикапу ${assignedPickup}. Повторная привязка запрещена`, 409);
  }
  return number;
}

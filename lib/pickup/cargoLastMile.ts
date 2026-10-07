import type { Pool } from 'pg';
import { perevozkiCustomerInn } from '../perevozkiPartyMatch.js';
const key = (v: unknown) => String(v ?? '').trim().replace(/^0+(?=\d)/, '');
export function deliveryForCargo(cargo: any, jobs: any[]) {
  const inn = perevozkiCustomerInn(cargo);
  const number = key(cargo.rawNumber ?? cargo.Number ?? cargo.НомерПеревозки);
  if (!inn || !number) return undefined;
  const matches = jobs.filter(j => j.data.customerInn === inn &&
    (j.data.cargoNumbers?.length ? j.data.cargoNumbers : [j.data.cargoNumber]).some((n: unknown) => key(n) === number));
  return matches.length === 1 ? matches[0] : undefined;
}
/** Enrich only cargo rows already filtered by authorization. */
export async function annotateCargoLastMile(pool: Pool, items: any[]) {
  const inns = [...new Set(items.map(perevozkiCustomerInn).filter(Boolean))];
  if (!inns.length) return items;
  try {
    const { rows } = await pool.query(`SELECT j.job_number,j.data,b.amount,b.status AS billing_status
      FROM pickup_jobs j LEFT JOIN pickup_billing b ON b.job_id=j.id
      WHERE j.data->>'serviceKind'='last_mile' AND j.status<>'cancelled' AND j.data->>'customerInn'=ANY($1::text[])`, [inns]);
    return items.map(item => {
      const job = deliveryForCargo(item, rows);
      if (!job) return item;
      return {...item, LastMileNumber: job.job_number,
        LastMileCost: job.amount != null ? Number(job.amount) : item.LastMileCost ?? item.СтоимостьПоследнейМили ?? job.data.priceRub};
    });
  } catch {
    console.warn('cargo_last_mile_unavailable');
    return items;
  }
}

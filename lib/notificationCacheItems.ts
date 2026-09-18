import type { Pool } from 'pg';

/** Cache only: stale/missing rows do not become synthetic status changes. */
export async function loadNotificationCacheItems(pool: Pool, inn: string): Promise<any[]> {
  const { rows } = await pool.query(
    `SELECT payload FROM cache_perevozki_rows
     WHERE customer_inn=$1
       AND doc_date >= (now() AT TIME ZONE 'Europe/Moscow')::date - 24
       AND doc_date <= (now() AT TIME ZONE 'Europe/Moscow')::date
       AND updated_at >= now() - interval '3 hours'`,
    [inn],
  );
  return rows.map(row => row.payload);
}

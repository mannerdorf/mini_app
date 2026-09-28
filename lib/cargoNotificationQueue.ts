import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";

/** Called inside the same transaction as the normalized cargo window. */
export async function enqueueCargoNotifications(client: Pick<PoolClient, "query">, items: unknown[], source: string) {
  const rows = items.map(item => {
    const payload = item as Record<string, unknown>;
    const number = String(payload.Number ?? payload.number ?? payload.cargoNumber ?? "").trim();
    const json = JSON.stringify(payload);
    return { number, payload, key: createHash("sha256").update(json).digest("hex") };
  }).filter(row => row.number);
  if (!rows.length) return;
  await client.query(`INSERT INTO cargo_notification_queue(dedupe_key,cargo_number,payload,source)
    SELECT r.key,r.number,r.payload,$2 FROM jsonb_to_recordset($1::jsonb) AS r(key text,number text,payload jsonb)
    ON CONFLICT(dedupe_key) DO NOTHING`, [JSON.stringify(rows), source]);
}

type DeliveryResult = { failed: number; deferred?: number };
/** One worker globally. Session lock is released on crash; durable rows remain pending. */
export async function processCargoNotifications(pool: Pool, deliver: (payload: Record<string, unknown>) => Promise<DeliveryResult>) {
  const client = await pool.connect();
  let locked = false;
  let completed = 0, retried = 0;
  const started = Date.now();
  try {
    locked = (await client.query("SELECT pg_try_advisory_lock(118,1) AS locked")).rows[0].locked;
    if (!locked) return { skipped: true, completed, retried };
    // Small batch; never start another item after the response budget is nearly spent.
    for (let i = 0; i < 10 && Date.now() - started < 45000; i++) {
      const row = (await client.query(`SELECT q.id,q.payload FROM cargo_notification_queue q
        WHERE q.completed_at IS NULL AND q.next_at<=now()
        AND NOT EXISTS(SELECT 1 FROM cargo_notification_queue prior WHERE prior.cargo_number=q.cargo_number AND prior.id<q.id AND prior.completed_at IS NULL)
        ORDER BY q.id LIMIT 1`)).rows[0];
      if (!row) break;
      try {
        const result = await deliver(row.payload);
        if (result.failed || result.deferred) throw new Error("delivery_incomplete");
        await client.query("UPDATE cargo_notification_queue SET completed_at=now(),last_error=NULL WHERE id=$1", [row.id]);
        completed++;
      } catch {
        await client.query(`UPDATE cargo_notification_queue SET attempts=attempts+1,
          next_at=now()+least(360,power(2,least(attempts,9))) * interval '1 minute',
          last_error='delivery_incomplete' WHERE id=$1`, [row.id]);
        retried++;
      }
    }
    return { completed, retried };
  } finally {
    try { if (locked) await client.query("SELECT pg_advisory_unlock(118,1)"); }
    finally { client.release(); }
  }
}

import type { PoolClient } from "pg";
import { uuid } from "./model.js";

const jobActions = new Set(["arrive", "complete", "problem", "resolve", "set_job_status", "set_job_order", "set_job_billing"]);
const routeActions = new Set(["start", "acknowledge", "deposit", "reorder", "location_unreliable"]);

/** Structural assignments use the exclusive gate; independent route work shares it. */
export async function lockPickupMutation(db: PoolClient, actor: string, body: Record<string, unknown>) {
  const action = String(body.action);
  const scoped = jobActions.has(action) || routeActions.has(action);
  await db.query(scoped ? "SELECT pg_advisory_xact_lock_shared(104,1)" : "SELECT pg_advisory_xact_lock(104,1)");
  // A replay must serialize even if an invalid caller reuses an ID for another route.
  await db.query("SELECT pg_advisory_xact_lock(105,hashtext($1))", [JSON.stringify([actor, body.requestId])]);
  if (!scoped) return;
  const id = uuid(body.id);
  let routeId = id;
  if (jobActions.has(action)) {
    const { rows } = await db.query<{ route_id: string | null }>("SELECT route_id FROM pickup_jobs WHERE id=$1", [id]);
    routeId = rows[0]?.route_id || `job:${id}`;
  }
  const keys = [`route:${routeId}`];
  if (action === "start") {
    const { rows } = await db.query<{ driver_id: string; vehicle_id: string }>("SELECT driver_id,vehicle_id FROM pickup_routes WHERE id=$1", [id]);
    if (rows[0]) keys.push(`driver:${rows[0].driver_id}`, `vehicle:${rows[0].vehicle_id}`);
  }
  // Same ordering for all multi-entity commands prevents lock cycles.
  for (const key of [...new Set(keys)].sort()) {
    await db.query("SELECT pg_advisory_xact_lock(106,hashtext($1))", [key]);
  }
}

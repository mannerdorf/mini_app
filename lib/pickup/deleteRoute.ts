import type { PoolClient } from "pg";
import {
  PickupError,
  pickupRouteCanDelete,
  pickupRouteCanSuperAdminDeleteCompleted,
  requireValue,
  type Route,
} from "./model.js";

export type PickupRouteDeletePolicy = "dispatcher" | "super_admin_completed";

export function pickupRouteDeleteAllowed(
  status: Route["status"],
  policy: PickupRouteDeletePolicy,
): boolean {
  if (policy === "dispatcher") return pickupRouteCanDelete(status);
  return pickupRouteCanSuperAdminDeleteCompleted(status);
}

export async function deletePickupRoute(
  db: PoolClient,
  input: {
    routeId: string;
    version: unknown;
    policy?: PickupRouteDeletePolicy;
    /** Диспетчер с cms_access + service_mode + analytics + haulz. */
    allowCompletedDelete?: boolean;
    actorLogin: string;
    logEvent: (
      action: string,
      routeId: string | null,
      jobId: string | null,
      data?: Record<string, unknown>,
    ) => Promise<void>;
  },
): Promise<{ ok: true; jobsUnassigned: number }> {
  const { rows } = await db.query<Route>(
    "SELECT *, to_char(date,'YYYY-MM-DD') AS date FROM pickup_routes WHERE id=$1 FOR UPDATE",
    [input.routeId],
  );
  const route = rows[0];
  if (!route) throw new PickupError("Маршрут не найден", 404);
  if (route.version !== input.version) {
    throw new PickupError(
      "Данные изменены другим пользователем. Обновите экран и повторите действие.",
      409,
    );
  }
  const policy: PickupRouteDeletePolicy = input.policy ?? "dispatcher";
  requireValue(
    pickupRouteDeleteAllowed(route.status, policy),
    policy === "super_admin_completed"
      ? "Удалить можно только завершённый маршрут"
      : "Некорректный статус маршрута",
  );

  const { rows: jobs } = await db.query<{ id: string; status: string }>(
    "SELECT id, status FROM pickup_jobs WHERE route_id=$1 FOR UPDATE",
    [route.id],
  );
  if (policy !== "dispatcher") requireValue(
    jobs.every(job => ["pending", "cancelled", "deposited", "resolved"].includes(job.status)),
    "В маршруте есть незавершённые заборы или несданный груз. Завершите их до удаления маршрута.",
  );

  if (jobs.length) {
    await db.query(
      "UPDATE pickup_jobs SET route_id=NULL, position=0, version=version+1, updated_at=now() WHERE route_id=$1",
      [route.id],
    );
  }
  await db.query(
    "UPDATE pickup_events SET route_id=NULL, data=COALESCE(data,'{}'::jsonb) || jsonb_build_object('deletedRoute',$2::jsonb) WHERE route_id=$1",
    [route.id, JSON.stringify({ id: route.id, name: route.name, city: route.city, date: route.date, driverId: route.driver_id, vehicleId: route.vehicle_id, status: route.status })],
  );
  await db.query("DELETE FROM pickup_routes WHERE id=$1", [route.id]);
  await input.logEvent("Маршрут удалён", null, null, {
    routeId: route.id,
    name: route.name,
    jobsUnassigned: jobs.length,
    policy,
    actor: input.actorLogin,
  });
  return { ok: true, jobsUnassigned: jobs.length };
}

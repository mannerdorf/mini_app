import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "node:crypto";
import { getPool } from "./_db.js";
import {
  getAdminTokenFromRequest,
  getAdminTokenPayload,
  verifyAdminToken,
} from "../lib/adminAuth.js";
import { withErrorLog } from "../lib/requestErrorLog.js";
import { initRequestContext, logError } from "./_lib/observability.js";
import { deletePickupRoute } from "../lib/pickup/deleteRoute.js";
import { PickupError, requireValue, validCity, validDate } from "../lib/pickup/model.js";

async function adminSnapshot(
  db: import("pg").PoolClient,
  city: string,
  date: string,
) {
  const { rows: routes } = await db.query(
    `SELECT *, to_char(date,'YYYY-MM-DD') AS date FROM pickup_routes
     WHERE city=$1 AND date=$2 ORDER BY start_time, name`,
    [city, date],
  );
  const routeIds = routes.map((r: { id: string }) => r.id);
  const { rows: jobStats } = routeIds.length
    ? await db.query<{ route_id: string; total: number; collected: number }>(
        `SELECT route_id,
          count(*)::int AS total,
          count(*) FILTER (WHERE status IN ('picked_up','partial','deposited'))::int AS collected
         FROM pickup_jobs WHERE route_id = ANY($1::uuid[]) GROUP BY route_id`,
        [routeIds],
      )
    : { rows: [] };
  const statsByRoute = new Map(jobStats.map((s) => [s.route_id, s]));
  return {
    routes: routes.map((r: Record<string, unknown>) => {
      const snapshot = (r.snapshot ?? {}) as {
        driver?: { name?: string };
        vehicle?: { data?: { plate?: string } };
      };
      const st = statsByRoute.get(r.id as string);
      return {
        id: r.id,
        name: r.name,
        city: r.city,
        date: r.date,
        status: r.status,
        version: r.version,
        start_time: r.start_time,
        driverName: snapshot.driver?.name ?? "",
        vehiclePlate: snapshot.vehicle?.data?.plate ?? "",
        jobCount: st?.total ?? 0,
        collectedCount: st?.collected ?? 0,
      };
    }),
  };
}

async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "admin-pickup-dispatch");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const token = getAdminTokenFromRequest(req);
  const payload = verifyAdminToken(token) ? getAdminTokenPayload(token) : null;
  if (payload?.superAdmin !== true) {
    return res.status(403).json({
      error: "Доступ только для супер-администратора",
      request_id: ctx.requestId,
    });
  }

  let body: Record<string, unknown> =
    req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
  if (typeof req.body === "string") {
    try {
      body = JSON.parse(req.body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON body", request_id: ctx.requestId });
    }
  }

  const action = typeof body.action === "string" ? body.action : "";
  const adminLogin = payload?.login?.trim() || "super_admin";

  const db = await getPool().connect();
  try {
    if (action === "snapshot") {
      validCity(body.city);
      validDate(body.date);
      const snapshot = await adminSnapshot(db, body.city as string, body.date as string);
      return res.status(200).json({ ...snapshot, request_id: ctx.requestId });
    }

    if (action === "delete_route") {
      requireValue(typeof body.id === "string", "Некорректный идентификатор");
      requireValue(body.version !== undefined && body.version !== null, "Укажите версию маршрута");
      await db.query("BEGIN");
      const result = await deletePickupRoute(db, {
        routeId: body.id as string,
        version: body.version,
        policy: "super_admin_completed",
        actorLogin: adminLogin,
        logEvent: async (actionName, _routeId, jobId, data) => {
          await db.query(
            "INSERT INTO pickup_events(id,route_id,job_id,actor,action,data) VALUES($1,$2,$3,$4,$5,$6)",
            [
              randomUUID(),
              null,
              jobId,
              `admin:${adminLogin}`,
              actionName,
              JSON.stringify(data ?? {}),
            ],
          );
        },
      });
      await db.query("COMMIT");
      return res.status(200).json({ ...result, request_id: ctx.requestId });
    }

    return res.status(400).json({ error: "Неизвестное действие", request_id: ctx.requestId });
  } catch (e: unknown) {
    await db.query("ROLLBACK").catch(() => {});
    if (e instanceof PickupError) {
      return res.status(e.status).json({ error: e.message, request_id: ctx.requestId });
    }
    const missing = (e as { code?: string })?.code === "42P01";
    logError(ctx, "admin_pickup_dispatch_failed", e);
    return res.status(missing ? 503 : 500).json({
      error: missing
        ? "Модуль ещё не настроен: примените миграцию 104_pickup_dispatch.sql"
        : (e as Error)?.message || "Не удалось выполнить действие",
      request_id: ctx.requestId,
    });
  } finally {
    db.release();
  }
}

export default withErrorLog(handler);

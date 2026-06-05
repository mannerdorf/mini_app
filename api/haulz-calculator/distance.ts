import type { VercelRequest, VercelResponse } from "@vercel/node";
import { haulzCalculatorPreflight } from "./_preflight.js";
import { getPool } from "../_db.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import { pgTableExists } from "../_haulzReturns.js";
import { resolveHaulzCalculatorAccess } from "../_haulzCalculator.js";
import { kmBeyondRing } from "../../lib/haulzCalculator/mkadDistance.js";
import type { CityCode, GeoPoint } from "../../lib/haulzCalculator/types.js";

function parsePoint(body: Record<string, unknown>): GeoPoint | null {
  const lat = Number(body.lat);
  const lon = Number(body.lon);
  if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
  const point = body.point as { lat?: unknown; lon?: unknown } | undefined;
  const plat = Number(point?.lat);
  const plon = Number(point?.lon);
  if (Number.isFinite(plat) && Number.isFinite(plon)) return { lat: plat, lon: plon };
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (haulzCalculatorPreflight(req, res)) return;
  const ctx = initRequestContext(req, res, "haulz_calculator_distance");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const access = await resolveHaulzCalculatorAccess(req, req.body);
  if (!access) {
    return res.status(401).json({ error: "Нет доступа", request_id: ctx.requestId });
  }

  const pool = getPool();
  if (!(await pgTableExists(pool, "haulz_calc_ring_exits"))) {
    return res.status(503).json({
      error: "Выполните миграцию migrations/083_haulz_calculator.sql",
      request_id: ctx.requestId,
    });
  }

  const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
  const cityRaw = String(body.city ?? "moscow").toLowerCase();
  const city: CityCode = cityRaw === "kaliningrad" ? "kaliningrad" : "moscow";
  const point = parsePoint(body);
  if (!point) {
    return res.status(400).json({ error: "lat/lon обязательны", request_id: ctx.requestId });
  }

  const kmOverride =
    body.kmOverride != null && Number.isFinite(Number(body.kmOverride)) ? Number(body.kmOverride) : undefined;

  try {
    const ring = await kmBeyondRing(pool, city, point, kmOverride);
    return res.status(200).json({
      city,
      km: ring.km,
      osrmKm: ring.osrmKm,
      dgisKm: ring.dgisKm,
      request_id: ctx.requestId,
    });
  } catch (e) {
    logError(ctx, "haulz_calculator_distance_failed", e);
    return res.status(500).json({
      error: (e as Error)?.message || "Ошибка расчёта км",
      request_id: ctx.requestId,
    });
  }
}

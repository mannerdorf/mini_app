import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import { pgTableExists } from "../_haulzReturns.js";
import { resolveHaulzCalculatorAccess } from "../_haulzCalculator.js";
import { pickHaulzCredentials } from "../_haulzReturns.js";
import { dadataGeolocateAddress } from "../../lib/dadata/geolocateAddress.js";
import { dgisGeocodeById, dgisGeocodeFull, dgisReverseGeocode } from "../../lib/haulzCalculator/dgisClient.js";
import type { GeoPoint } from "../../lib/haulzCalculator/types.js";

function parseBody(req: VercelRequest): Record<string, unknown> {
  const raw = req.body;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return {};
}

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
  const ctx = initRequestContext(req, res, "haulz_calculator_geocode");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const access = await resolveHaulzCalculatorAccess(req, req.body);
  if (!access) {
    const creds = pickHaulzCredentials(req, req.body);
    if (!creds.login || !creds.password) {
      return res.status(401).json({ error: "Нет доступа: укажите login и password", request_id: ctx.requestId });
    }
    return res.status(401).json({ error: "Нет доступа", request_id: ctx.requestId });
  }

  const pool = getPool();
  if (!(await pgTableExists(pool, "haulz_calc_api_cache"))) {
    return res.status(503).json({
      error: "Выполните миграцию migrations/083_haulz_calculator.sql",
      request_id: ctx.requestId,
    });
  }

  const body = parseBody(req);
  const point = parsePoint(body);
  const address = String(body.address ?? body.q ?? "").trim();
  const uri = String(body.uri ?? "").trim() || undefined;

  try {
    if (point) {
      let rev = await dgisReverseGeocode(point, pool);
      if (!rev) {
        try {
          const dadata = await dadataGeolocateAddress(point);
          if (dadata) rev = dadata;
        } catch {
          /* DaData не настроен */
        }
      }
      if (!rev) {
        return res.status(404).json({ error: "Адрес не найден", request_id: ctx.requestId });
      }
      return res.status(200).json({
        label: rev.label,
        fullAddress: rev.fullAddress,
        point: rev.point,
        request_id: ctx.requestId,
      });
    }

    if (!address && !uri) {
      return res.status(400).json({ error: "address или lat/lon обязательны", request_id: ctx.requestId });
    }

    const fwd = address
      ? await dgisGeocodeFull(address, pool)
      : uri
        ? await dgisGeocodeById(uri, pool)
        : null;
    if (!fwd) {
      return res.status(404).json({ error: "Адрес не найден", request_id: ctx.requestId });
    }
    return res.status(200).json({
      label: fwd.label,
      fullAddress: fwd.fullAddress,
      point: fwd.point,
      request_id: ctx.requestId,
    });
  } catch (e) {
    logError(ctx, "haulz_calculator_geocode_failed", e);
    const msg = (e as Error)?.message || "Ошибка геокодирования";
    const hint = msg.includes("HAULZ_DGIS") ? " Задайте HAULZ_DGIS_API_KEY на Vercel." : "";
    return res.status(500).json({ error: msg + hint, request_id: ctx.requestId });
  }
}

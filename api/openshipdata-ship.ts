import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initRequestContext, logError } from "./_lib/observability.js";

const OPENSHIPDATA_BASE = "https://ais.marineplan.com";

/**
 * GET /api/openshipdata-ship?mmsi=273355410
 * Прокси к OpenShipData API — разовый запрос позиции судна по MMSI.
 * Требует OPENSHIPDATA_API_KEY в env. Ключ запрашивается у MarinePlan.
 * https://marineplan.com/openshipdata-online-api-description/
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "openshipdata_ship");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const apiKey = process.env.OPENSHIPDATA_API_KEY?.trim();
  if (!apiKey) {
    return res.status(500).json({
      error: "OPENSHIPDATA_API_KEY not configured. Request key from MarinePlan.",
      request_id: ctx.requestId,
    });
  }

  const mmsiRaw = req.query.mmsi;
  const mmsi = typeof mmsiRaw === "string" ? mmsiRaw.trim().replace(/\D/g, "") : "";
  if (mmsi.length !== 9) {
    return res.status(400).json({
      error: "mmsi required (9 digits)",
      request_id: ctx.requestId,
    });
  }

  // Зона Балтики: SW lat,lon; NE lat,lon
  const area = "54.6,19.5;55.2,20.6";

  const url = new URL(`${OPENSHIPDATA_BASE}/location/2/ship.json`);
  url.searchParams.set("ship", mmsi);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("area", area);
  url.searchParams.set("source", "AIS");

  try {
    const resp = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });

    if (resp.status === 404) {
      return res.status(404).json({
        error: "Судно не найдено в зоне Балтики",
        request_id: ctx.requestId,
      });
    }

    if (resp.status === 400) {
      const text = await resp.text();
      return res.status(400).json({
        error: text || "Bad request",
        request_id: ctx.requestId,
      });
    }

    if (!resp.ok) {
      const text = await resp.text();
      logError(ctx, "openshipdata_fetch_error", new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`));
      return res.status(502).json({
        error: "OpenShipData API error",
        request_id: ctx.requestId,
      });
    }

    const data = (await resp.json()) as Record<string, unknown>;
    const reports = Array.isArray(data?.reports) ? data.reports : (data && typeof data === "object" ? [data] : []);
    const first = reports[0] as Record<string, unknown> | undefined;
    const point = first?.point as Record<string, unknown> | undefined;
    const lat = point?.latitude ?? first?.latitude;
    const lon = point?.longitude ?? first?.longitude;
    const mmsiVal = String(first?.mmsi ?? "").trim();
    const name = String(first?.boatName ?? first?.name ?? "").trim() || (mmsiVal ? `Судно ${mmsiVal}` : "");
    const speedKmh = typeof first?.speedKmh === "number" ? first.speedKmh : 0;
    const sog = speedKmh > 0 ? speedKmh / 1.852 : undefined;
    const cog = typeof first?.bearingDeg === "number" ? first.bearingDeg : undefined;
    const timeSecUtc = typeof first?.timeSecUtc === "number" ? first.timeSecUtc : undefined;
    const timeUtc = timeSecUtc ? new Date(timeSecUtc * 1000).toISOString() : undefined;

    return res.status(200).json({
      request_id: ctx.requestId,
      source: "OpenShipData",
      vessel: lat != null && lon != null && mmsiVal
        ? { mmsi: mmsiVal, name, lat: Number(lat), lon: Number(lon), sog, cog, timeUtc }
        : null,
      raw: data,
    });
  } catch (err) {
    logError(ctx, "openshipdata_request_failed", err);
    return res.status(502).json({
      error: (err as Error)?.message || "OpenShipData request failed",
      request_id: ctx.requestId,
    });
  }
}

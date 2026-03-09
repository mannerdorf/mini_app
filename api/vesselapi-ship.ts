import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initRequestContext, logError } from "./_lib/observability.js";

const VESSELAPI_BASE = "https://api.vesselapi.com/v1";

/**
 * GET /api/vesselapi-ship?mmsi=273355410
 * Прокси к VesselAPI — разовый запрос позиции судна по MMSI.
 * Требует VESSELAPI_API_KEY в env. Ключ в dashboard.vesselapi.com
 * https://vesselapi.com/docs/vessels
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "vesselapi_ship");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const apiKey = process.env.VESSELAPI_API_KEY?.trim();
  if (!apiKey) {
    return res.status(500).json({
      error: "VESSELAPI_API_KEY not configured. Get key at dashboard.vesselapi.com",
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

  const url = `${VESSELAPI_BASE}/vessel/${mmsi}/position?filter.idType=mmsi`;

  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });

    const data = (await resp.json()) as Record<string, unknown>;

    if (resp.status === 401) {
      return res.status(502).json({
        error: "VesselAPI: неверный API ключ",
        request_id: ctx.requestId,
      });
    }

    if (resp.status === 429) {
      return res.status(429).json({
        error: "VesselAPI: превышен лимит запросов",
        request_id: ctx.requestId,
      });
    }

    if (resp.status === 404 || (data?.error && (data.error as Record<string, unknown>)?.code === "not_found")) {
      return res.status(404).json({
        error: "Судно не найдено",
        request_id: ctx.requestId,
      });
    }

    if (!resp.ok) {
      const errMsg = (data?.error as Record<string, unknown>)?.message as string | undefined;
      logError(ctx, "vesselapi_fetch_error", new Error(`HTTP ${resp.status}: ${errMsg || ""}`));
      return res.status(502).json({
        error: errMsg || "VesselAPI error",
        request_id: ctx.requestId,
      });
    }

    const vessel = data?.vessel as Record<string, unknown> | undefined;
    const lat = vessel?.latitude;
    const lon = vessel?.longitude;
    const mmsiVal = String(vessel?.mmsi ?? mmsi).trim();
    const name = String(vessel?.vessel_name ?? vessel?.name ?? "").trim() || (mmsiVal ? `Судно ${mmsiVal}` : "");
    const sog = typeof vessel?.sog === "number" ? vessel.sog : undefined;
    const cog = typeof vessel?.cog === "number" ? vessel.cog : undefined;
    const timestamp = vessel?.timestamp ?? vessel?.processed_timestamp;
    const timeUtc = typeof timestamp === "string" ? timestamp : undefined;

    return res.status(200).json({
      request_id: ctx.requestId,
      source: "VesselAPI",
      vessel:
        lat != null && lon != null
          ? { mmsi: mmsiVal, name, lat: Number(lat), lon: Number(lon), sog, cog, timeUtc }
          : null,
      raw: data,
    });
  } catch (err) {
    logError(ctx, "vesselapi_request_failed", err);
    return res.status(502).json({
      error: (err as Error)?.message || "VesselAPI request failed",
      request_id: ctx.requestId,
    });
  }
}

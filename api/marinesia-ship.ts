import { requestMarinesia } from "../lib/marinesiaRequest.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initRequestContext, logError } from "./_lib/observability.js";

import { filterAisTrack } from "../lib/aisTrack.js";

const MARINESIA_BASE = "https://api.marinesia.com";

export function normalizeVesselHistory(value: unknown, mmsi: string) {
  if (!Array.isArray(value)) return [];
  return value.filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .filter(p => String(p.mmsi) === mmsi && p.valid !== false &&
      typeof p.lat === 'number' && Number.isFinite(p.lat) && Math.abs(p.lat) <= 90 &&
      typeof p.lng === 'number' && Number.isFinite(p.lng) && Math.abs(p.lng) <= 180 &&
      typeof p.ts === 'string' && Number.isFinite(Date.parse(p.ts.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(p.ts) ? p.ts : `${p.ts}Z`)))
    .map((p): Record<string, unknown> => ({ ...p, ts: new Date(Date.parse(String(p.ts).endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(String(p.ts)) ? String(p.ts) : `${p.ts}Z`)).toISOString() }))
    .sort((a, b) => Date.parse(String(a.ts)) - Date.parse(String(b.ts)));
}

/**
 * GET /api/marinesia-ship?mmsi=265510570
 * Прокси к Marinesia API — разовый запрос последней позиции судна по MMSI.
 * Требует MARINESIA_API_KEY в env. Ключ в marinesia.com (Free или Premium).
 * https://docs.marinesia.com/
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "marinesia_ship");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const apiKey = process.env.MARINESIA_API_KEY?.trim();
  if (!apiKey) {
    return res.status(500).json({
      error: "MARINESIA_API_KEY not configured. Get key at marinesia.com",
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

  const url = new URL(`${MARINESIA_BASE}/api/v1/vessel/${mmsi}/location/latest`);
  url.searchParams.set("key", apiKey);

  try {
    let track: { lat: number; lon: number; timeUtc: string; breakBefore?: boolean }[] = [];
    let historyError: string | undefined;
    let historyPayload: Record<string, unknown> | undefined;
    // One history request also supplies the newest position. Fall back to latest
    // when history is unavailable, so the map remains usable.
    if (req.query.history === '1') {
      const historyUrl = new URL(`${MARINESIA_BASE}/api/v1/vessel/${mmsi}/location`);
      historyUrl.searchParams.set('key', apiKey);
      try {
        const response = await requestMarinesia(historyUrl.toString(), { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
        const history = await response.json() as Record<string, unknown>;
        const points = response.ok && history.error !== true ? normalizeVesselHistory(history.data, mmsi) : [];
        const filtered = filterAisTrack(points.map(p => ({ lat: p.lat as number, lon: p.lng as number, timeUtc: p.ts as string })));
        track = filtered.points;
        historyPayload = points.slice().reverse().find(p => p.ts === track.at(-1)?.timeUtc);
        if (filtered.discarded || filtered.breaks) historyError = `Исключено подозрительных точек: ${filtered.discarded}. Разрывов линии: ${filtered.breaks}.`;
        if (!points.length) historyError = 'История движения недоступна. Показана последняя позиция.';
      } catch {
        historyError = 'Не удалось загрузить историю движения. Показана последняя позиция.';
      }
    }
    const resp = historyPayload ? new Response(JSON.stringify({ data: historyPayload }), { status: 200 }) : await requestMarinesia(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    }, req.query.badge === '1' ? 2 * 60 * 60 * 1000 : 300000);

    const data = (await resp.json()) as Record<string, unknown>;

    if (resp.status === 404 || (data?.error === true && String(data?.message ?? "").toLowerCase().includes("no data"))) {
      return res.status(404).json({
        error: "Судно не найдено",
        request_id: ctx.requestId,
      });
    }

    if (resp.status === 429) {
      return res.status(429).json({
        error: "Marinesia: превышен лимит запросов. Повторите немного позже.",
        request_id: ctx.requestId,
      });
    }

    if (resp.status === 401 || resp.status === 403) {
      return res.status(502).json({
        error: "Marinesia: неверный API ключ",
        request_id: ctx.requestId,
      });
    }

    if (!resp.ok) {
      const errMsg = String(data?.message ?? data?.detail ?? "").trim() || `HTTP ${resp.status}`;
      logError(ctx, "marinesia_fetch_error", new Error(errMsg));
      return res.status(502).json({
        error: errMsg || "Marinesia API error",
        request_id: ctx.requestId,
      });
    }

    const payload = data?.data as Record<string, unknown> | undefined;
    const lat = payload?.lat;
    const lon = payload?.lng;
    const mmsiVal = String(payload?.mmsi ?? mmsi).trim();
    const name = mmsiVal ? `Судно ${mmsiVal}` : "";
    const sog = typeof payload?.sog === "number" ? payload.sog : undefined;
    const cog = typeof payload?.cog === "number" ? payload.cog : undefined;
    const ts = payload?.ts;
    const timeUtc = typeof ts === "string" ? ts : undefined;
    const dest = typeof payload?.dest === "string" ? payload.dest : undefined;
    const eta = typeof payload?.eta === "string" ? payload.eta : undefined;
    const status = typeof payload?.status === "number" ? payload.status : undefined;
    const hdt = typeof payload?.hdt === "number" ? payload.hdt : undefined;
    const draught = typeof payload?.draught === "number" ? payload.draught : undefined;

    return res.status(200).json({
      request_id: ctx.requestId,
      source: "Marinesia",
      ...(req.query.history === '1' ? { track, historyError } : {}),
      vessel:
        lat != null && lon != null
          ? { mmsi: mmsiVal, name, lat: Number(lat), lon: Number(lon), sog, cog, timeUtc, dest, eta, status, hdt, draught }
          : null,
      raw: data,
    });
  } catch (err) {
    logError(ctx, "marinesia_request_failed", err);
    return res.status(502).json({
      error: (err as Error)?.message || "Marinesia request failed",
      request_id: ctx.requestId,
    });
  }
}

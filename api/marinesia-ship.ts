import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initRequestContext, logError } from "./_lib/observability.js";

const MARINESIA_BASE = "https://api.marinesia.com";

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
    const resp = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });

    const data = (await resp.json()) as Record<string, unknown>;

    if (resp.status === 404 || (data?.error === true && String(data?.message ?? "").toLowerCase().includes("no data"))) {
      return res.status(404).json({
        error: "Судно не найдено",
        request_id: ctx.requestId,
      });
    }

    if (resp.status === 429) {
      return res.status(429).json({
        error: "Marinesia: превышен лимит запросов (Free: 1 запрос / 30 мин)",
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

    return res.status(200).json({
      request_id: ctx.requestId,
      source: "Marinesia",
      vessel:
        lat != null && lon != null
          ? { mmsi: mmsiVal, name, lat: Number(lat), lon: Number(lon), sog, cog, timeUtc }
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

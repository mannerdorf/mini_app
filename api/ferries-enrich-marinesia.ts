import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest } from "../lib/adminAuth.js";
import { initRequestContext, logError } from "./_lib/observability.js";

const MARINESIA_BASE = "https://api.marinesia.com";

/**
 * POST /api/ferries-enrich-marinesia
 * Опросить Marinesia API (vessel/nearby по зоне Балтики), обновить IMO и тип судна для паромов.
 * Тело: { mmsiList?: string[] } — опционально список MMSI для обогащения; иначе все паромы.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "ferries_enrich_marinesia");

  if (!verifyAdminToken(getAdminTokenFromRequest(req))) {
    return res.status(401).json({ error: "Требуется авторизация админа", request_id: ctx.requestId });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const apiKey = process.env.MARINESIA_API_KEY?.trim();
  if (!apiKey) {
    return res.status(500).json({
      error: "MARINESIA_API_KEY не настроен. Настройте в Vercel.",
      request_id: ctx.requestId,
    });
  }

  const body = req.body as Record<string, unknown> | undefined;
  const mmsiList = Array.isArray(body?.mmsiList) ? body.mmsiList.map(String).filter((m) => /^\d{9}$/.test(m)) : null;

  try {
    const pool = getPool();
    const { rows: ferries } = await pool.query<{ id: number; mmsi: string; name: string }>(
      mmsiList && mmsiList.length > 0
        ? "SELECT id, mmsi, name FROM ferries WHERE mmsi = ANY($1)"
        : "SELECT id, mmsi, name FROM ferries",
      mmsiList && mmsiList.length > 0 ? [mmsiList] : []
    );

    if (ferries.length === 0) {
      return res.status(200).json({
        ok: true,
        updated: 0,
        message: "Нет паромов для обогащения",
        request_id: ctx.requestId,
      });
    }

    // Зона Балтики (паромы MSK-KGD и др.)
    const lat_min = 53;
    const lat_max = 60;
    const long_min = 18;
    const long_max = 32;

    const url = new URL(`${MARINESIA_BASE}/api/v1/vessel/nearby`);
    url.searchParams.set("lat_min", String(lat_min));
    url.searchParams.set("lat_max", String(lat_max));
    url.searchParams.set("long_min", String(long_min));
    url.searchParams.set("long_max", String(long_max));
    url.searchParams.set("key", apiKey);

    const resp = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20000),
    });

    const data = (await resp.json()) as Record<string, unknown>;
    if (!resp.ok) {
      const errMsg = String(data?.message ?? data?.detail ?? "").trim() || `HTTP ${resp.status}`;
      logError(ctx, "marinesia_nearby_failed", new Error(errMsg));
      return res.status(502).json({
        error: `Marinesia: ${errMsg}`,
        request_id: ctx.requestId,
      });
    }

    const vesselsRaw = data?.data;
    const vessels = Array.isArray(vesselsRaw) ? vesselsRaw : [];
    const byMmsi = new Map<string, { name?: string; imo?: number; type?: string }>();
    for (const v of vessels) {
      const m = v as Record<string, unknown>;
      const mmsi = String(m?.mmsi ?? "").trim();
      if (!mmsi) continue;
      byMmsi.set(mmsi, {
        name: typeof m.name === "string" ? m.name : undefined,
        imo: typeof m.imo === "number" ? m.imo : undefined,
        type: typeof m.type === "string" ? m.type : undefined,
      });
    }

    let updated = 0;
    for (const f of ferries) {
      const info = byMmsi.get(f.mmsi);
      if (!info) continue;
      const updates: string[] = [];
      const values: unknown[] = [];
      let i = 1;
      if (info.name && info.name !== f.name) {
        updates.push(`name = $${i++}`);
        values.push(info.name);
      }
      if (info.imo != null) {
        updates.push(`imo = $${i++}`);
        values.push(String(info.imo));
      }
      if (info.type != null) {
        updates.push(`vessel_type = $${i++}`);
        values.push(info.type);
      }
      if (updates.length > 0) {
        values.push(f.id);
        await pool.query(
          `UPDATE ferries SET ${updates.join(", ")}, updated_at = now() WHERE id = $${values.length}`,
          values
        );
        updated++;
      }
    }

    return res.status(200).json({
      ok: true,
      updated,
      total: ferries.length,
      vessels_in_area: vessels.length,
      request_id: ctx.requestId,
    });
  } catch (e) {
    logError(ctx, "ferries_enrich_failed", e);
    return res.status(500).json({
      error: (e as Error)?.message || "Ошибка обогащения",
      request_id: ctx.requestId,
    });
  }
}

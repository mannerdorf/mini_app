import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import { parseJsonBody, resolveDocumentsOrderAccess } from "../_documentsOrder.js";
import { getPvzCoordsByRefs, savePvzConfirmedCoords } from "../../lib/pickup/pvzCoords.js";
import type { CityCode } from "../../lib/haulzCalculator/types.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "documents_pvz_coords");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const body = parseJsonBody(req);
  const access = await resolveDocumentsOrderAccess(req, body);
  if (!access) {
    return res.status(401).json({ error: "Нет доступа", request_id: ctx.requestId });
  }

  const pool = getPool();
  const action = String(body.action ?? "get").trim();

  try {
    if (action === "save") {
      const pvzRef = String(body.pvzRef ?? body.pvz_ref ?? "").trim();
      const city = (body.city === "kaliningrad" ? "kaliningrad" : "moscow") as CityCode;
      const latitude = Number(body.latitude ?? body.lat);
      const longitude = Number(body.longitude ?? body.lon);
      const fullAddress = String(body.fullAddress ?? body.full_address ?? "").trim();
      if (!pvzRef) {
        return res.status(400).json({ error: "pvzRef обязателен", request_id: ctx.requestId });
      }
      await savePvzConfirmedCoords(pool, {
        pvzRef,
        city,
        latitude,
        longitude,
        fullAddress,
        confirmedBy: access.login,
      });
      return res.status(200).json({ ok: true, request_id: ctx.requestId });
    }

    const refs = Array.isArray(body.refs)
      ? body.refs.map((r: unknown) => String(r ?? "").trim()).filter(Boolean)
      : String(body.pvzRef ?? "")
          .trim()
          ? [String(body.pvzRef).trim()]
          : [];
    const map = await getPvzCoordsByRefs(pool, refs);
    const coords: Record<
      string,
      { latitude: number; longitude: number; fullAddress: string; city: CityCode }
    > = {};
    for (const [ref, row] of map) {
      coords[ref] = {
        latitude: row.latitude,
        longitude: row.longitude,
        fullAddress: row.fullAddress,
        city: row.city,
      };
    }
    return res.status(200).json({ coords, request_id: ctx.requestId });
  } catch (e) {
    logError(ctx, "documents_pvz_coords_failed", e);
    return res.status(500).json({
      error: (e as Error)?.message || "Ошибка координат ПВЗ",
      request_id: ctx.requestId,
    });
  }
}

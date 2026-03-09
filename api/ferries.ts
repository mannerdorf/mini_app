import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest } from "../lib/adminAuth.js";
import { initRequestContext, logError } from "./_lib/observability.js";

export type Ferry = {
  id: number;
  name: string;
  mmsi: string;
  imo: string | null;
  vessel_type: string | null;
  teu_capacity: number | null;
  trailer_capacity: number | null;
  operator: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * GET /api/ferries — список паромов (admin)
 * POST /api/ferries — создать или обновить паром (admin)
 * DELETE /api/ferries — удалить паром по id (admin)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "ferries");

  if (!verifyAdminToken(getAdminTokenFromRequest(req))) {
    return res.status(401).json({ error: "Требуется авторизация админа", request_id: ctx.requestId });
  }

  if (req.method === "DELETE") {
    const idRaw = req.query?.id ?? (req.body as Record<string, unknown>)?.id;
    const id = typeof idRaw === "number" ? idRaw : typeof idRaw === "string" ? parseInt(idRaw, 10) : undefined;
    if (id == null || !Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: "id обязателен (число)", request_id: ctx.requestId });
    }
    try {
      const pool = getPool();
      const { rowCount } = await pool.query("DELETE FROM ferries WHERE id = $1", [id]);
      return res.status(200).json({ ok: true, deleted: (rowCount ?? 0) > 0, request_id: ctx.requestId });
    } catch (e) {
      logError(ctx, "ferries_delete_failed", e);
      return res.status(500).json({ error: (e as Error)?.message || "Ошибка удаления", request_id: ctx.requestId });
    }
  }

  if (req.method === "GET") {
    try {
      const pool = getPool();
      const { rows } = await pool.query<Ferry>(
        `SELECT id, name, mmsi, imo, vessel_type, teu_capacity, trailer_capacity, operator, created_at::text, updated_at::text
         FROM ferries ORDER BY name`
      );
      return res.status(200).json({ ferries: rows, request_id: ctx.requestId });
    } catch (e) {
      logError(ctx, "ferries_list_failed", e);
      return res.status(500).json({ error: (e as Error)?.message || "Ошибка загрузки", request_id: ctx.requestId });
    }
  }

  if (req.method === "POST") {
    const body = req.body as Record<string, unknown> | undefined;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const mmsi = typeof body?.mmsi === "string" ? body.mmsi.replace(/\D/g, "").trim() : "";
    const id = typeof body?.id === "number" ? body.id : undefined;
    const imo = typeof body?.imo === "string" ? body.imo.trim() || null : undefined;
    const vessel_type = typeof body?.vessel_type === "string" ? body.vessel_type.trim() || null : undefined;
    const teu_capacity = typeof body?.teu_capacity === "number" ? body.teu_capacity : undefined;
    const trailer_capacity = typeof body?.trailer_capacity === "number" ? body.trailer_capacity : undefined;
    const operator = typeof body?.operator === "string" ? body.operator.trim() || null : undefined;

    if (!name || mmsi.length !== 9) {
      return res.status(400).json({ error: "Наименование и MMSI (9 цифр) обязательны", request_id: ctx.requestId });
    }

    try {
      const pool = getPool();
      if (id != null && id > 0) {
        await pool.query(
          `UPDATE ferries SET name=$1, mmsi=$2, imo=COALESCE($3, imo), vessel_type=COALESCE($4, vessel_type),
           teu_capacity=COALESCE($5, teu_capacity), trailer_capacity=COALESCE($6, trailer_capacity),
           operator=COALESCE($7, operator), updated_at=now() WHERE id=$8`,
          [name, mmsi, imo ?? null, vessel_type ?? null, teu_capacity ?? null, trailer_capacity ?? null, operator ?? null, id]
        );
        return res.status(200).json({ ok: true, request_id: ctx.requestId });
      }
      await pool.query(
        `INSERT INTO ferries (name, mmsi, imo, vessel_type, teu_capacity, trailer_capacity, operator)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (mmsi) DO UPDATE SET name=excluded.name, imo=COALESCE(excluded.imo, ferries.imo),
         vessel_type=COALESCE(excluded.vessel_type, ferries.vessel_type), updated_at=now()`,
        [name, mmsi, imo ?? null, vessel_type ?? null, teu_capacity ?? null, trailer_capacity ?? null, operator ?? null]
      );
      return res.status(200).json({ ok: true, request_id: ctx.requestId });
    } catch (e) {
      logError(ctx, "ferries_save_failed", e);
      return res.status(500).json({ error: (e as Error)?.message || "Ошибка сохранения", request_id: ctx.requestId });
    }
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
}

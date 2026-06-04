import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest } from "../lib/adminAuth.js";
import { writeAuditLog } from "../lib/adminAuditLog.js";
import { initRequestContext, logError } from "./_lib/observability.js";

function parseBody(req: VercelRequest): Record<string, unknown> {
  let body: unknown = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "admin-haulz-calculator-hubs");
  if (!verifyAdminToken(getAdminTokenFromRequest(req))) {
    return res.status(401).json({ error: "Требуется авторизация админа", request_id: ctx.requestId });
  }

  const pool = getPool();

  try {
    if (req.method === "GET") {
      const { rows } = await pool.query(
        `select id, code, name, lat, lon, role, active, created_at::text
         from haulz_calc_hubs order by role, name`,
      );
      return res.status(200).json({ hubs: rows, request_id: ctx.requestId });
    }

    if (req.method === "POST") {
      const body = parseBody(req);
      const id = Number(body.id);
      const code = String(body.code ?? "").trim();
      const name = String(body.name ?? "").trim();
      const lat = Number(body.lat);
      const lon = Number(body.lon);
      const role = body.role === "kaliningrad" ? "kaliningrad" : "moscow";
      const active = body.active !== false;

      if (!code || !name || !Number.isFinite(lat) || !Number.isFinite(lon)) {
        return res.status(400).json({ error: "code, name, lat, lon обязательны", request_id: ctx.requestId });
      }

      if (Number.isInteger(id) && id > 0) {
        await pool.query(
          `update haulz_calc_hubs set code=$1, name=$2, lat=$3, lon=$4, role=$5, active=$6 where id=$7`,
          [code, name, lat, lon, role, active, id],
        );
      } else {
        await pool.query(
          `insert into haulz_calc_hubs (code, name, lat, lon, role, active)
           values ($1,$2,$3,$4,$5,$6)
           on conflict (code) do update set name=excluded.name, lat=excluded.lat, lon=excluded.lon, role=excluded.role, active=excluded.active`,
          [code, name, lat, lon, role, active],
        );
      }
      await writeAuditLog(pool, {
        action: "haulz_calc_hub_update",
        target_type: "haulz_calc_hubs",
        details: { code, role },
      });
      return res.status(200).json({ ok: true, request_id: ctx.requestId });
    }

    if (req.method === "DELETE") {
      const id = Number(req.query.id ?? parseBody(req).id);
      if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({ error: "id обязателен", request_id: ctx.requestId });
      }
      await pool.query(`delete from haulz_calc_hubs where id=$1`, [id]);
      return res.status(200).json({ ok: true, request_id: ctx.requestId });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  } catch (e) {
    logError(ctx, "admin_haulz_calculator_hubs_failed", e);
    return res.status(500).json({
      error: (e as Error)?.message || "Ошибка",
      request_id: ctx.requestId,
    });
  }
}

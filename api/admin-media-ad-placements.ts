import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest, getAdminTokenPayload } from "../lib/adminAuth.js";
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
  const ctx = initRequestContext(req, res, "admin_media_ad_placements");
  const token = getAdminTokenFromRequest(req);
  if (!verifyAdminToken(token)) {
    return res.status(401).json({ error: "Требуется авторизация админа", request_id: ctx.requestId });
  }
  const login = getAdminTokenPayload(token)?.login ?? "admin";

  try {
    const pool = getPool();

    if (req.method === "GET") {
      const { rows } = await pool.query(
        `select * from media_ad_placements order by coalesce(start_date, created_at::date) desc, id desc limit 300`,
      );
      return res.status(200).json({ placements: rows, request_id: ctx.requestId });
    }

    if (req.method === "POST") {
      const body = parseBody(req);
      const partnerName = String(body.partner_name ?? body.partnerName ?? "").trim();
      const placementType = String(body.placement_type ?? body.placementType ?? "other").trim();
      if (!partnerName) {
        return res.status(400).json({ error: "partner_name обязателен", request_id: ctx.requestId });
      }
      const { rows } = await pool.query(
        `insert into media_ad_placements
           (placement_type, partner_name, contact, platform, description,
            cost_amount, cost_currency, start_date, end_date, url, utm_campaign, status, metrics_notes, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8::date,$9::date,$10,$11,$12,$13,$14)
         returning *`,
        [
          placementType,
          partnerName,
          String(body.contact ?? "").trim() || null,
          String(body.platform ?? "").trim() || null,
          String(body.description ?? "").trim() || null,
          body.cost_amount != null ? Number(body.cost_amount) : null,
          String(body.cost_currency ?? "RUB").trim() || "RUB",
          body.start_date ? String(body.start_date).slice(0, 10) : null,
          body.end_date ? String(body.end_date).slice(0, 10) : null,
          String(body.url ?? "").trim() || null,
          String(body.utm_campaign ?? "").trim() || null,
          String(body.status ?? "planned").trim() || "planned",
          String(body.metrics_notes ?? "").trim() || null,
          login,
        ],
      );
      return res.status(201).json({ placement: rows[0], request_id: ctx.requestId });
    }

    if (req.method === "PATCH") {
      const body = parseBody(req);
      const id = Number(body.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ error: "id обязателен", request_id: ctx.requestId });
      }
      const { rows } = await pool.query(
        `update media_ad_placements set
           placement_type = coalesce($2, placement_type),
           partner_name = coalesce($3, partner_name),
           contact = $4,
           platform = $5,
           description = $6,
           cost_amount = $7,
           cost_currency = coalesce($8, cost_currency),
           start_date = $9::date,
           end_date = $10::date,
           url = $11,
           utm_campaign = $12,
           status = coalesce($13, status),
           metrics_notes = $14,
           updated_at = now()
         where id = $1
         returning *`,
        [
          id,
          body.placement_type ? String(body.placement_type) : null,
          body.partner_name ? String(body.partner_name).trim() : null,
          body.contact != null ? String(body.contact).trim() || null : null,
          body.platform != null ? String(body.platform).trim() || null : null,
          body.description != null ? String(body.description).trim() || null : null,
          body.cost_amount != null ? Number(body.cost_amount) : null,
          body.cost_currency ? String(body.cost_currency) : null,
          body.start_date ? String(body.start_date).slice(0, 10) : null,
          body.end_date ? String(body.end_date).slice(0, 10) : null,
          body.url != null ? String(body.url).trim() || null : null,
          body.utm_campaign != null ? String(body.utm_campaign).trim() || null : null,
          body.status ? String(body.status) : null,
          body.metrics_notes != null ? String(body.metrics_notes).trim() || null : null,
        ],
      );
      if (!rows[0]) return res.status(404).json({ error: "Не найдено", request_id: ctx.requestId });
      return res.status(200).json({ placement: rows[0], request_id: ctx.requestId });
    }

    if (req.method === "DELETE") {
      const id = Number(req.query.id ?? parseBody(req).id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ error: "id обязателен", request_id: ctx.requestId });
      }
      await pool.query(`delete from media_ad_placements where id = $1`, [id]);
      return res.status(200).json({ ok: true, request_id: ctx.requestId });
    }

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  } catch (e) {
    logError(ctx, "admin_media_ad_placements_failed", e);
    return res.status(500).json({ error: (e as Error)?.message || "Ошибка", request_id: ctx.requestId });
  }
}

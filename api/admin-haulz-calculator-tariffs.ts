import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest } from "../lib/adminAuth.js";
import { writeAuditLog } from "../lib/adminAuditLog.js";
import { initRequestContext, logError } from "./_lib/observability.js";
import {
  getActiveVersion,
  listTariffSets,
  listVersionHistory,
  todayDateMoscow,
} from "../lib/haulzCalculator/tariffStore.js";

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

function parseIsoDateOnly(value: unknown): string | null {
  const s = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "admin-haulz-calculator-tariffs");
  const token = getAdminTokenFromRequest(req);
  if (!verifyAdminToken(token)) {
    return res.status(401).json({ error: "Требуется авторизация админа", request_id: ctx.requestId });
  }

  const pool = getPool();

  try {
    if (req.method === "GET") {
      const tariffSetId = parseInt(String(req.query.tariff_set_id ?? ""), 10);
      if (Number.isInteger(tariffSetId) && tariffSetId > 0) {
        const history = await listVersionHistory(pool, tariffSetId);
        const active = await getActiveVersion(pool, tariffSetId);
        return res.status(200).json({ history, active, request_id: ctx.requestId });
      }

      const sets = await listTariffSets(pool);
      const day = todayDateMoscow();
      const enriched = [];
      for (const set of sets) {
        const version = await getActiveVersion(pool, set.id, day);
        enriched.push({
          ...set,
          active_version: version,
        });
      }
      return res.status(200).json({ sets: enriched, as_of: day, request_id: ctx.requestId });
    }

    if (req.method === "POST") {
      const body = parseBody(req);
      const tariffSetId = Number(body.tariff_set_id);
      const effectiveFrom = parseIsoDateOnly(body.effective_from) || todayDateMoscow();
      const payload = body.payload;
      if (!Number.isInteger(tariffSetId) || tariffSetId < 1) {
        return res.status(400).json({ error: "tariff_set_id обязателен", request_id: ctx.requestId });
      }
      if (payload == null || typeof payload !== "object") {
        return res.status(400).json({ error: "payload обязателен (object)", request_id: ctx.requestId });
      }

      const createdBy = "admin";

      const { rows } = await pool.query<{ id: string }>(
        `insert into haulz_calc_tariff_versions (tariff_set_id, effective_from, payload, comment, created_by)
         values ($1, $2::date, $3::jsonb, $4, $5)
         on conflict (tariff_set_id, effective_from) do update set
           payload = excluded.payload,
           comment = excluded.comment,
           created_by = excluded.created_by
         returning id::text`,
        [
          tariffSetId,
          effectiveFrom,
          JSON.stringify(payload),
          typeof body.comment === "string" ? body.comment.trim() || null : null,
          createdBy,
        ],
      );

      await writeAuditLog(pool, {
        action: "haulz_calc_tariff_update",
        target_type: "haulz_calc_tariff_version",
        target_id: rows[0]?.id,
        details: { tariff_set_id: tariffSetId, effective_from: effectiveFrom },
      });

      return res.status(200).json({ ok: true, version_id: rows[0]?.id, request_id: ctx.requestId });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  } catch (e) {
    logError(ctx, "admin_haulz_calculator_tariffs_failed", e);
    return res.status(500).json({
      error: (e as Error)?.message || "Ошибка",
      request_id: ctx.requestId,
    });
  }
}

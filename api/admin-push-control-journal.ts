import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest, getAdminTokenPayload } from "../lib/adminAuth.js";
import { withErrorLog } from "../lib/requestErrorLog.js";
import { initRequestContext, logError } from "./_lib/observability.js";
import { normalizeNotificationInn } from "../lib/notificationInnScope.js";

async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "admin-push-control-journal");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const token = getAdminTokenFromRequest(req);
  if (!verifyAdminToken(token)) {
    return res.status(401).json({ error: "Требуется авторизация админа", request_id: ctx.requestId });
  }
  if (getAdminTokenPayload(token)?.superAdmin !== true) {
    return res.status(403).json({ error: "Доступ только для супер-администратора", request_id: ctx.requestId });
  }

  const login = String(req.query?.login || "").trim().toLowerCase();
  const inn = normalizeNotificationInn(req.query?.inn);
  const action = String(req.query?.action || "").trim();
  const limitRaw = Number(req.query?.limit);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 500) : 100;

  try {
    const pool = getPool();
    const where: string[] = [];
    const params: unknown[] = [];
    if (login) {
      params.push(login);
      where.push(`lower(trim(login)) = $${params.length}`);
    }
    if (inn) {
      params.push(inn);
      where.push(`inn = $${params.length}`);
    }
    if (action) {
      params.push(action);
      where.push(`action = $${params.length}`);
    }
    params.push(limit);
    const sql = `
      SELECT id, login, inn, action, channel, event_id, enabled,
             device_token_suffix, platform, meta, created_at
      FROM push_control_journal
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY created_at DESC, id DESC
      LIMIT $${params.length}
    `;
    const { rows } = await pool.query<{
      id: string | number;
      login: string;
      inn: string;
      action: string;
      channel: string;
      event_id: string | null;
      enabled: boolean | null;
      device_token_suffix: string | null;
      platform: string | null;
      meta: unknown;
      created_at: Date | string;
    }>(sql, params);

    return res.status(200).json({
      ok: true,
      count: rows.length,
      entries: rows.map((row) => ({
        id: row.id,
        login: row.login,
        inn: row.inn || "",
        action: row.action,
        channel: row.channel,
        eventId: row.event_id,
        enabled: row.enabled,
        deviceTokenSuffix: row.device_token_suffix,
        platform: row.platform,
        meta: row.meta ?? null,
        createdAt:
          row.created_at instanceof Date
            ? row.created_at.toISOString()
            : String(row.created_at || ""),
      })),
      request_id: ctx.requestId,
    });
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === "42P01") {
      return res.status(200).json({
        ok: true,
        count: 0,
        entries: [],
        notice: "Run migration 092_push_control_journal.sql",
        request_id: ctx.requestId,
      });
    }
    logError(ctx, "admin_push_control_journal_failed", e);
    return res.status(500).json({
      error: (e as Error)?.message || "Ошибка загрузки журнала",
      request_id: ctx.requestId,
    });
  }
}

export default withErrorLog(handler);

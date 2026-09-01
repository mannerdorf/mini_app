import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { initRequestContext, logError } from "./_lib/observability.js";
import { normalizeNotificationInn } from "../lib/notificationInnScope.js";
import { syncPushSelectedInnForLogin } from "../lib/pushSelectedInnSync.js";

/** POST { login, inn? } — сохранить ИНН выбранной компании для автопуша и пересинхронизировать реестр. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "push-selected-inn");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  let body: unknown = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON body", request_id: ctx.requestId });
    }
  }

  const bodyObj = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const login = String(bodyObj.login || "").trim().toLowerCase();
  const inn = bodyObj.inn == null ? "" : String(bodyObj.inn);

  if (!login) return res.status(400).json({ error: "login is required", request_id: ctx.requestId });

  let pool: Awaited<ReturnType<typeof getPool>>;
  try {
    pool = getPool();
  } catch {
    return res.status(503).json({ error: "Database not configured", request_id: ctx.requestId });
  }

  try {
    const result = await syncPushSelectedInnForLogin(pool, login, inn, {
      source: "push_selected_inn_api",
    });
    return res.status(200).json({
      ok: true,
      push_selected_inn: result.pushSelectedInn,
      push_inns: result.pushInns,
      request_id: ctx.requestId,
    });
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === "42P01") {
      return res.status(503).json({
        error: "Run migration 048_notification_preferences_state.sql",
        request_id: ctx.requestId,
      });
    }
    logError(ctx, "push_selected_inn_failed", e, { login, inn: normalizeNotificationInn(inn) });
    return res.status(500).json({ error: "Failed to save push selected INN", request_id: ctx.requestId });
  }
}

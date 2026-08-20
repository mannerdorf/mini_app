import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { initRequestContext, logError } from "./_lib/observability.js";
import { savePushPreferenceToggle } from "../lib/savePushPreferenceToggle.js";

/** POST { login, eventId, enabled } — атомарно вкл/выкл один push-тип. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "push-preference-toggle");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  let pool: Awaited<ReturnType<typeof getPool>>;
  try {
    pool = getPool();
  } catch {
    return res.status(503).json({ error: "Database not configured", request_id: ctx.requestId });
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
  const eventId = String(bodyObj.eventId || "").trim();
  const enabled = bodyObj.enabled;

  try {
    const result = await savePushPreferenceToggle(pool, login, eventId, enabled, {
      requestId: ctx.requestId,
    });
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error, request_id: ctx.requestId });
    }
    return res.status(200).json({
      ok: true,
      eventId: result.eventId,
      enabled: result.enabled,
      push: result.pushForClient,
      push_saved: result.pushSaved,
      inns: result.inns,
      request_id: ctx.requestId,
    });
  } catch (e: unknown) {
    logError(ctx, "push_preference_toggle_failed", e, { login, eventId, enabled });
    return res.status(500).json({ error: "Failed to save push preference", request_id: ctx.requestId });
  }
}

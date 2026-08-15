import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest, getAdminTokenPayload } from "../lib/adminAuth.js";
import { writeAuditLog } from "../lib/adminAuditLog.js";
import { withErrorLog } from "../lib/requestErrorLog.js";
import { initRequestContext, logError } from "./_lib/observability.js";
import { sendFcmToLogin } from "./_lib/fcmDelivery.js";
import {
  parsePushAudience,
  resolvePushRecipientLogins,
  splitLoginsByFcmToken,
} from "./_lib/adminPushRecipients.js";

function parseJsonBody(req: VercelRequest): Record<string, unknown> {
  let body: unknown = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return {};
    }
  }
  return (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
}

async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "admin-push-send");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const token = getAdminTokenFromRequest(req);
  if (!verifyAdminToken(token)) {
    return res.status(401).json({ error: "Требуется авторизация админа", request_id: ctx.requestId });
  }
  if (getAdminTokenPayload(token)?.superAdmin !== true) {
    return res.status(403).json({ error: "Доступ только для супер-администратора", request_id: ctx.requestId });
  }

  const body = parseJsonBody(req);
  const audience = parsePushAudience(body);
  if ("error" in audience) {
    return res.status(400).json({ error: audience.error, request_id: ctx.requestId });
  }

  const title = String(body.title || "").trim();
  const messageBody = String(body.body || "").trim();
  const url = String(body.url || "/").trim() || "/";
  const dryRun = body.dryRun === true;
  const limitRaw = Number(body.limit);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(5000, Math.floor(limitRaw))) : 500;

  if (!title) {
    return res.status(400).json({ error: "Укажите заголовок (title)", request_id: ctx.requestId });
  }
  if (!messageBody) {
    return res.status(400).json({ error: "Укажите текст (body)", request_id: ctx.requestId });
  }

  try {
    const pool = getPool();
    const allLogins = await resolvePushRecipientLogins(pool, audience);
    const { withToken, withoutToken } = await splitLoginsByFcmToken(pool, allLogins);
    const targets = withToken.slice(0, limit);

    if (dryRun) {
      return res.status(200).json({
        ok: true,
        dryRun: true,
        audience: audience.type,
        recipientsTotal: allLogins.length,
        selected: targets.length,
        skippedNoToken: withoutToken.length,
        truncated: withToken.length > limit,
        request_id: ctx.requestId,
      });
    }

    let sent = 0;
    let failed = 0;
    let devicesSent = 0;
    const failures: Array<{ login: string; error?: string }> = [];

    for (const login of targets) {
      const result = await sendFcmToLogin(login, { title, body: messageBody, url });
      if (result.ok) {
        sent += 1;
        devicesSent += result.sent;
      } else {
        failed += 1;
        if (failures.length < 20) {
          failures.push({ login, error: result.error });
        }
      }
    }

    await writeAuditLog(pool, {
      action: "admin_push_send",
      target_type: "push_notification",
      details: {
        audience: audience.type,
        title,
        body: messageBody.slice(0, 200),
        url,
        recipientsTotal: allLogins.length,
        selected: targets.length,
        sent,
        failed,
        devicesSent,
        skippedNoToken: withoutToken.length,
        truncated: withToken.length > limit,
        limit,
      },
    });

    return res.status(200).json({
      ok: sent > 0 || (targets.length === 0 && withoutToken.length > 0),
      audience: audience.type,
      recipientsTotal: allLogins.length,
      selected: targets.length,
      sent,
      failed,
      devicesSent,
      skippedNoToken: withoutToken.length,
      truncated: withToken.length > limit,
      failures,
      request_id: ctx.requestId,
    });
  } catch (e: unknown) {
    const err = e as Error;
    logError(ctx, "admin_push_send_failed", err);
    return res.status(500).json({ error: err?.message || "Ошибка отправки", request_id: ctx.requestId });
  }
}

export default withErrorLog(handler);

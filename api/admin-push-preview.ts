import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest, getAdminTokenPayload } from "../lib/adminAuth.js";
import { withErrorLog } from "../lib/requestErrorLog.js";
import { initRequestContext, logError } from "./_lib/observability.js";
import {
  parsePushAudience,
  resolvePushRecipientLogins,
  splitLoginsByFcmToken,
} from "./_lib/adminPushRecipients.js";

function parseJsonBody(req: VercelRequest): unknown {
  let body: unknown = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body || {};
}

async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "admin-push-preview");
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

  const audience = parsePushAudience(parseJsonBody(req));
  if ("error" in audience) {
    return res.status(400).json({ error: audience.error, request_id: ctx.requestId });
  }

  try {
    const pool = getPool();
    const logins = await resolvePushRecipientLogins(pool, audience);
    const { withToken, withoutToken } = await splitLoginsByFcmToken(pool, logins);
    const fcmConfigured = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim() || process.env.GOOGLE_APPLICATION_CREDENTIALS);

    return res.status(200).json({
      ok: true,
      audience: audience.type,
      recipientsTotal: logins.length,
      withToken: withToken.length,
      withoutToken: withoutToken.length,
      sampleLogins: withToken.slice(0, 20),
      sampleWithoutToken: withoutToken.slice(0, 10),
      fcmConfigured,
      request_id: ctx.requestId,
    });
  } catch (e: unknown) {
    const err = e as Error;
    logError(ctx, "admin_push_preview_failed", err);
    return res.status(500).json({ error: err?.message || "Ошибка предпросмотра", request_id: ctx.requestId });
  }
}

export default withErrorLog(handler);

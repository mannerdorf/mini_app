import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { requireCronAuth } from "../_lib/cronAuth.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import { dispatchAppUpdatePush, type AppUpdatePlatform } from "../../lib/dispatchAppUpdatePush.js";

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

/** POST/GET — push «Новая версия приложения» после деплоя APK / iOS build. Auth: CRON_SECRET. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "cron/app-update-push");
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const cronAuthError = requireCronAuth(req);
  if (cronAuthError) {
    return res.status(cronAuthError.status).json({ error: cronAuthError.error, request_id: ctx.requestId });
  }

  const body = req.method === "POST" ? parseJsonBody(req) : {};
  const platformRaw = String(body.platform ?? req.query.platform ?? "android").trim().toLowerCase();
  const platform: AppUpdatePlatform = platformRaw === "ios" ? "ios" : "android";
  const versionCode = Number(body.versionCode ?? body.version_code ?? req.query.versionCode ?? req.query.version_code);
  const versionName = String(body.versionName ?? body.version_name ?? req.query.versionName ?? req.query.version_name ?? "").trim();
  const dryRun = body.dryRun === true || req.query.dryRun === "1" || req.query.dry_run === "1";

  try {
    const pool = getPool();
    const result = await dispatchAppUpdatePush({
      pool,
      platform,
      versionCode,
      versionName,
      dryRun,
    });
    return res.status(200).json({
      ...result,
      platform,
      versionCode,
      versionName: versionName || null,
      request_id: ctx.requestId,
    });
  } catch (e: unknown) {
    logError(ctx, "app_update_push_failed", e, { platform, versionCode, versionName });
    return res.status(500).json({
      ok: false,
      error: (e as Error)?.message || "app_update push failed",
      request_id: ctx.requestId,
    });
  }
}

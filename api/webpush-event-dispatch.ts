import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { dispatchWebPushCargoEvents } from "./_lib/webpushEventDispatch.js";
import { initRequestContext, logError } from "./_lib/observability.js";

function pickSecret(req: VercelRequest): string {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7).trim();
  if (typeof req.query.secret === "string") return req.query.secret.trim();
  return "";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "webpush-event-dispatch");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }
  const expectedSecret = process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET || "";
  const providedSecret = pickSecret(req);
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return res.status(401).json({ error: "Unauthorized", request_id: ctx.requestId });
  }

  let body: any = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON body", request_id: ctx.requestId });
    }
  }

  const items = Array.isArray(body?.items) ? body.items : [];
  const source = String(body?.source || "api_webpush_event_dispatch").trim();
  const dedupeTtlSeconds = Math.max(60, Number(body?.dedupeTtlSeconds) || 300);
  if (items.length === 0) {
    return res.status(400).json({ error: "items array is required", request_id: ctx.requestId });
  }

  try {
    const pool = getPool();
    const result = await dispatchWebPushCargoEvents({
      pool,
      items,
      source,
      dedupeTtlSeconds,
    });
    return res.status(200).json({ ok: true, ...result, request_id: ctx.requestId });
  } catch (e: any) {
    logError(ctx, "webpush_event_dispatch_failed", e);
    return res.status(500).json({ ok: false, error: e?.message || String(e), request_id: ctx.requestId });
  }
}

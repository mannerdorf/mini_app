import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { initRequestContext, logError } from "./_lib/observability.js";
import { planFcmTokenUnsubscribe } from "../lib/fcmUnsubscribe.js";
import {
  deviceTokenSuffix,
  ensurePushControlTables,
  writePushControlJournal,
} from "../lib/pushControl.js";
import { loadEffectivePushLoginScopes } from "../lib/notificationInnScope.js";

/** POST { login, token } — удалить один FCM token. Без token не трогаем другие устройства логина. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "fcm-unsubscribe");
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
  const planned = planFcmTokenUnsubscribe(bodyObj);
  if (!planned.ok) {
    return res.status(planned.status).json({ error: planned.error, request_id: ctx.requestId });
  }
  const { login, token } = planned;

  let pool: Awaited<ReturnType<typeof getPool>>;
  try {
    pool = getPool();
  } catch {
    return res.status(503).json({ error: "Database not configured", request_id: ctx.requestId });
  }

  try {
    try {
      await ensurePushControlTables(pool);
    } catch {
      // optional
    }

    await pool.query("delete from fcm_device_tokens where login = $1 and token = $2", [login, token]);

    let inns: string[] = [];
    try {
      const scopes = await loadEffectivePushLoginScopes(pool);
      inns = [...(scopes.get(login)?.inns || [])];
    } catch {
      inns = [];
    }

    const remaining = await pool.query<{ n: string }>(
      "select count(*)::text as n from fcm_device_tokens where login = $1",
      [login],
    );
    const devicesLeft = Number(remaining.rows[0]?.n || 0) || 0;

    for (const inn of inns.length > 0 ? inns : [""]) {
      await writePushControlJournal(pool, {
        login,
        inn,
        action: "fcm_unsubscribe",
        deviceTokenSuffix: deviceTokenSuffix(token),
        meta: {
          request_id: ctx.requestId,
          all_tokens: false,
          devices_left: devicesLeft,
        },
      });
    }

    return res.status(200).json({ ok: true, devices_left: devicesLeft, request_id: ctx.requestId });
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === "42P01") {
      return res.status(503).json({ error: "Run migration 089_fcm_push.sql", request_id: ctx.requestId });
    }
    logError(ctx, "fcm_unsubscribe_failed", e);
    return res.status(500).json({ error: "Failed to remove FCM token", request_id: ctx.requestId });
  }
}

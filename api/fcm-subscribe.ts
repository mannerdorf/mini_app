import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { initRequestContext, logError } from "./_lib/observability.js";
import {
  deviceTokenSuffix,
  ensurePushControlTables,
  syncPushActivationForLogin,
  writePushControlJournal,
} from "../lib/pushControl.js";
import { normalizeNotificationPreferencesState } from "../lib/notificationEmailPrefs.js";

/** POST { login, token, platform?: "android" | "ios" } — сохранить FCM token устройства. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "fcm-subscribe");
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
  const token = String(bodyObj.token || "").trim();
  const platformRaw = String(bodyObj.platform || "android").trim().toLowerCase();
  const platform = platformRaw === "ios" ? "ios" : "android";

  if (!login) return res.status(400).json({ error: "login is required", request_id: ctx.requestId });
  if (!token) return res.status(400).json({ error: "token is required", request_id: ctx.requestId });

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
      // migration may be applied separately
    }

    await pool.query(
      `insert into fcm_device_tokens (token, login, platform, updated_at)
       values ($1, $2, $3, now())
       on conflict (token)
       do update set login = excluded.login, platform = excluded.platform, updated_at = now()`,
      [token, login, platform],
    );

    let pushPrefs: Record<string, boolean> | undefined;
    try {
      const stateRes = await pool.query<{ preferences: unknown }>(
        "SELECT preferences FROM notification_preferences_state WHERE login = $1 LIMIT 1",
        [login],
      );
      if (stateRes.rows[0]?.preferences) {
        pushPrefs = normalizeNotificationPreferencesState(stateRes.rows[0].preferences).push;
      }
    } catch {
      // optional
    }

    const suffix = deviceTokenSuffix(token);
    const synced = await syncPushActivationForLogin(pool, login, pushPrefs, {
      source: "fcm_subscribe",
      deviceTokenSuffix: suffix,
      platform,
    });

    for (const inn of synced.inns.length > 0 ? synced.inns : [""]) {
      await writePushControlJournal(pool, {
        login,
        inn,
        action: "fcm_subscribe",
        deviceTokenSuffix: suffix,
        platform,
        meta: {
          request_id: ctx.requestId,
          push_inns: synced.inns,
          enabled_events: synced.events.filter((e) => e.enabled).map((e) => e.eventId),
        },
      });
    }

    return res.status(200).json({
      ok: true,
      push_inns: synced.inns,
      request_id: ctx.requestId,
    });
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === "42P01") {
      return res.status(503).json({ error: "Run migration 089_fcm_push.sql / 092_push_control_journal.sql", request_id: ctx.requestId });
    }
    logError(ctx, "fcm_subscribe_failed", e);
    return res.status(500).json({ error: "Failed to save FCM token", request_id: ctx.requestId });
  }
}

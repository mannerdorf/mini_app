import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { initRequestContext, logError } from "./_lib/observability.js";
import {
  DEFAULT_EMAIL_PREFS,
  DEFAULT_PUSH_PREFS,
  EMAIL_NOTIFICATION_EVENTS,
  PUSH_NOTIFICATION_EVENTS,
  applyPushPreferenceToggle,
  buildPushPreferencesSavePayload,
  loadNotificationPreferencesState,
  mergePushPreferences,
  mergePushPreferencesForSave,
  normalizeNotificationPreferencesState,
  pushPreferencesForClient,
} from "../lib/notificationEmailPrefs.js";
import { syncPushActivationForLogin, writePushControlJournal } from "../lib/pushControl.js";

const DEFAULT_PREFS = {
  telegram: { daily_summary: true } as Record<string, boolean>,
  webpush: { daily_summary: false } as Record<string, boolean>,
  push: { ...DEFAULT_PUSH_PREFS } as Record<string, boolean>,
  email: { ...DEFAULT_EMAIL_PREFS } as Record<string, boolean>,
};

const EVENTS = [...PUSH_NOTIFICATION_EVENTS] as const;

/** GET ?login= — настройки из БД (notification_preferences). POST { login, preferences } — сохранить в БД. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "webpush-preferences");
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  let pool: Awaited<ReturnType<typeof getPool>>;
  try {
    pool = getPool();
  } catch {
    return res.status(503).json({ error: "Database not configured", request_id: ctx.requestId });
  }

  if (req.method === "GET") {
    const login = String(req.query?.login || "").trim().toLowerCase();
    if (!login) return res.status(400).json({ error: "login is required", request_id: ctx.requestId });

    const prefs = {
      telegram: { ...DEFAULT_PREFS.telegram },
      webpush: { ...DEFAULT_PREFS.webpush },
      push: { ...DEFAULT_PUSH_PREFS },
      email: { ...DEFAULT_EMAIL_PREFS },
    };
    try {
      try {
        const stateRes = await pool.query<{ preferences: unknown }>(
          "SELECT preferences FROM notification_preferences_state WHERE login = $1 LIMIT 1",
          [login]
        );
        if (stateRes.rows.length > 0) {
          const normalized = normalizeNotificationPreferencesState(stateRes.rows[0]?.preferences);
          return res.status(200).json({
            telegram: { ...DEFAULT_PREFS.telegram, ...normalized.telegram },
            webpush: { ...DEFAULT_PREFS.webpush, ...normalized.webpush },
            push: pushPreferencesForClient(normalized.push),
            email: { ...DEFAULT_EMAIL_PREFS, ...normalized.email },
            request_id: ctx.requestId,
          });
        }
      } catch (e: unknown) {
        const code = (e as { code?: string })?.code;
        if (code !== "42P01") {
          logError(ctx, "webpush_preferences_get_state_failed", e);
        }
      }
      const { rows } = await pool.query<{ channel: string; event_id: string; enabled: boolean }>(
        "SELECT channel, event_id, enabled FROM notification_preferences WHERE login = $1",
        [login]
      );
      for (const r of rows) {
        const ch =
          r.channel === "telegram"
            ? "telegram"
            : r.channel === "email"
              ? "email"
              : r.channel === "push"
                ? "push"
                : "webpush";
        const eventIds =
          ch === "email"
            ? (EMAIL_NOTIFICATION_EVENTS as readonly string[])
            : (EVENTS as readonly string[]);
        if (eventIds.includes(r.event_id)) {
          prefs[ch][r.event_id] = r.enabled;
        }
      }
      return res.status(200).json({
        ...prefs,
        push: pushPreferencesForClient(prefs.push),
        request_id: ctx.requestId,
      });
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === "42P01") {
        return res.status(200).json({ ...prefs, request_id: ctx.requestId });
      }
      logError(ctx, "webpush_preferences_get_failed", e);
      return res.status(500).json({ error: "Failed to load preferences", request_id: ctx.requestId });
    }
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
  const preferences = bodyObj.preferences;
  if (!login) return res.status(400).json({ error: "login is required", request_id: ctx.requestId });
  if (!preferences || typeof preferences !== "object") {
    return res.status(400).json({ error: "preferences object is required", request_id: ctx.requestId });
  }

  const prefObj = preferences as Record<string, unknown>;
  const telegram = prefObj.telegram && typeof prefObj.telegram === "object" ? (prefObj.telegram as Record<string, boolean>) : {};
  const webpush = prefObj.webpush && typeof prefObj.webpush === "object" ? (prefObj.webpush as Record<string, boolean>) : {};
  const pushRaw = prefObj.push && typeof prefObj.push === "object" ? (prefObj.push as Record<string, boolean>) : {};
  const email = prefObj.email && typeof prefObj.email === "object" ? (prefObj.email as Record<string, boolean>) : {};
  const existingState = await loadNotificationPreferencesState(pool, login);
  const pushToggleRaw = bodyObj.pushToggle;
  const pushToggle =
    pushToggleRaw && typeof pushToggleRaw === "object"
      ? (pushToggleRaw as Record<string, unknown>)
      : null;
  const toggleEventId = String(pushToggle?.eventId || "").trim();
  const toggleEnabled = pushToggle?.enabled === true;
  const pushSaved =
    toggleEventId && (PUSH_NOTIFICATION_EVENTS as readonly string[]).includes(toggleEventId)
      ? applyPushPreferenceToggle(existingState.push, toggleEventId, toggleEnabled)
      : mergePushPreferencesForSave(
          existingState.push,
          buildPushPreferencesSavePayload(pushRaw, {
            eventId: toggleEventId,
            value: toggleEnabled,
          }),
        );
  const pushEffective = mergePushPreferences(pushSaved);
  const current = normalizeNotificationPreferencesState({
    telegram: { ...DEFAULT_PREFS.telegram, ...telegram },
    webpush: { ...DEFAULT_PREFS.webpush, ...webpush },
    push: pushSaved,
    email: { ...DEFAULT_EMAIL_PREFS, ...email },
  });

  try {
    try {
      await pool.query(
        `INSERT INTO notification_preferences_state (login, preferences, updated_at)
         VALUES ($1, $2::jsonb, now())
         ON CONFLICT (login)
         DO UPDATE SET preferences = excluded.preferences, updated_at = now()`,
        [login, JSON.stringify(current)]
      );
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === "42P01") {
        return res.status(503).json({ error: "Run migration 048_notification_preferences_state.sql", request_id: ctx.requestId });
      }
      logError(ctx, "webpush_preferences_post_state_failed", e);
      return res.status(500).json({ error: "Failed to save preferences", request_id: ctx.requestId });
    }

    for (const eventId of EVENTS) {
      try {
        await pool.query(
          `INSERT INTO notification_preferences (login, channel, event_id, enabled, updated_at)
           VALUES ($1, 'telegram', $2, $3, now())
           ON CONFLICT (login, channel, event_id) DO UPDATE SET enabled = excluded.enabled, updated_at = now()`,
          [login, eventId, !!current.telegram[eventId]]
        );
        await pool.query(
          `INSERT INTO notification_preferences (login, channel, event_id, enabled, updated_at)
           VALUES ($1, 'web', $2, $3, now())
           ON CONFLICT (login, channel, event_id) DO UPDATE SET enabled = excluded.enabled, updated_at = now()`,
          [login, eventId, !!current.webpush[eventId]]
        );
        await pool.query(
          `INSERT INTO notification_preferences (login, channel, event_id, enabled, updated_at)
           VALUES ($1, 'push', $2, $3, now())
           ON CONFLICT (login, channel, event_id) DO UPDATE SET enabled = excluded.enabled, updated_at = now()`,
          [login, eventId, !!pushEffective[eventId]]
        );
      } catch (e: unknown) {
        const code = (e as { code?: string })?.code;
        if (code === "23514") {
          logError(ctx, "webpush_preferences_event_constraint", e, { eventId, hint: "Run migration 090_notification_cargo_stages.sql" });
          continue;
        }
        if (code === "42P01") continue;
        throw e;
      }
    }

    for (const eventId of EMAIL_NOTIFICATION_EVENTS) {
      try {
        await pool.query(
          `INSERT INTO notification_preferences (login, channel, event_id, enabled, updated_at)
           VALUES ($1, 'email', $2, $3, now())
           ON CONFLICT (login, channel, event_id) DO UPDATE SET enabled = excluded.enabled, updated_at = now()`,
          [login, eventId, !!current.email[eventId]]
        );
      } catch (e: unknown) {
        const code = (e as { code?: string })?.code;
        if (code === "23514" || code === "42P01") continue;
        throw e;
      }
    }

    try {
      const synced = await syncPushActivationForLogin(pool, login, pushSaved, {
        source: "prefs_save",
      });
      await writePushControlJournal(pool, {
        login,
        inn: synced.inns[0] || "",
        action: toggleEventId ? "push_toggle" : "prefs_save",
        eventId: toggleEventId || undefined,
        enabled: toggleEventId ? toggleEnabled : null,
        meta: {
          request_id: ctx.requestId,
          push: pushSaved,
          push_effective: pushEffective,
          push_inns: synced.inns,
          enabled_events: synced.events.filter((e) => e.enabled).map((e) => e.eventId),
        },
      });
    } catch (e: unknown) {
      logError(ctx, "webpush_preferences_push_control_failed", e);
    }

    return res.status(200).json({
      ok: true,
      preferences: {
        ...current,
        push: pushPreferencesForClient(current.push),
      },
      request_id: ctx.requestId,
    });
  } catch (e: unknown) {
    logError(ctx, "webpush_preferences_post_failed", e);
    return res.status(500).json({ error: "Failed to save preferences", request_id: ctx.requestId });
  }
}

import type { Pool } from "pg";
import {
  DEFAULT_EMAIL_PREFS,
  DEFAULT_PUSH_PREFS,
  EMAIL_NOTIFICATION_EVENTS,
  PUSH_NOTIFICATION_EVENTS,
  applyPushPreferenceToggle,
  loadNotificationPreferencesState,
  mergePushPreferences,
  normalizeNotificationPreferencesState,
  pushPreferencesForClient,
} from "./notificationEmailPrefs.js";
import { syncPushActivationForLogin, writePushControlJournal } from "./pushControl.js";

const DEFAULT_PREFS = {
  telegram: { daily_summary: true } as Record<string, boolean>,
  webpush: { daily_summary: false } as Record<string, boolean>,
};

export type SavePushPreferenceToggleResult = {
  ok: true;
  eventId: string;
  enabled: boolean;
  pushSaved: Record<string, boolean>;
  pushEffective: Record<string, boolean>;
  pushForClient: Record<string, boolean>;
  inns: string[];
};

export async function savePushPreferenceToggle(
  pool: Pool,
  loginRaw: string,
  eventIdRaw: string,
  enabledRaw: unknown,
  opts?: { requestId?: string; journalAction?: string },
): Promise<SavePushPreferenceToggleResult | { ok: false; error: string; status: number }> {
  const login = String(loginRaw || "").trim().toLowerCase();
  const eventId = String(eventIdRaw || "").trim();
  const enabled = enabledRaw === true;

  if (!login) return { ok: false, error: "login is required", status: 400 };
  if (!(PUSH_NOTIFICATION_EVENTS as readonly string[]).includes(eventId)) {
    return { ok: false, error: "invalid eventId", status: 400 };
  }

  const existingState = await loadNotificationPreferencesState(pool, login);
  const pushSaved = applyPushPreferenceToggle(existingState.push, eventId, enabled);
  const pushEffective = mergePushPreferences(pushSaved);
  const current = normalizeNotificationPreferencesState({
    telegram: { ...DEFAULT_PREFS.telegram, ...existingState.telegram },
    webpush: { ...DEFAULT_PREFS.webpush, ...existingState.webpush },
    push: pushSaved,
    email: { ...DEFAULT_EMAIL_PREFS, ...existingState.email },
  });

  try {
    await pool.query(
      `INSERT INTO notification_preferences_state (login, preferences, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (login)
       DO UPDATE SET preferences = excluded.preferences, updated_at = now()`,
      [login, JSON.stringify(current)],
    );
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === "42P01") {
      return { ok: false, error: "Run migration 048_notification_preferences_state.sql", status: 503 };
    }
    throw e;
  }

  for (const rowEventId of PUSH_NOTIFICATION_EVENTS) {
    try {
      await pool.query(
        `INSERT INTO notification_preferences (login, channel, event_id, enabled, updated_at)
         VALUES ($1, 'push', $2, $3, now())
         ON CONFLICT (login, channel, event_id) DO UPDATE SET enabled = excluded.enabled, updated_at = now()`,
        [login, rowEventId, !!pushEffective[rowEventId]],
      );
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === "23514") continue;
      if (code === "42P01") continue;
      throw e;
    }
  }

  for (const rowEventId of EMAIL_NOTIFICATION_EVENTS) {
    try {
      await pool.query(
        `INSERT INTO notification_preferences (login, channel, event_id, enabled, updated_at)
         VALUES ($1, 'email', $2, $3, now())
         ON CONFLICT (login, channel, event_id) DO UPDATE SET enabled = excluded.enabled, updated_at = now()`,
        [login, rowEventId, !!current.email[rowEventId]],
      );
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === "23514" || code === "42P01") continue;
      throw e;
    }
  }

  let inns: string[] = [];
  try {
    const synced = await syncPushActivationForLogin(pool, login, pushSaved, {
      source: "prefs_toggle",
    });
    inns = synced.inns;
    await writePushControlJournal(pool, {
      login,
      inn: synced.inns[0] || "",
      action: opts?.journalAction || "push_toggle",
      eventId,
      enabled,
      meta: {
        request_id: opts?.requestId,
        push: pushSaved,
        push_effective: pushEffective,
        push_inns: synced.inns,
        enabled_events: synced.events.filter((e) => e.enabled).map((e) => e.eventId),
      },
    });
  } catch {
    /* journal/activation best-effort */
  }

  return {
    ok: true,
    eventId,
    enabled,
    pushSaved,
    pushEffective,
    pushForClient: pushPreferencesForClient(pushSaved),
    inns,
  };
}

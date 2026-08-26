import type { Pool } from "pg";
import { loadPushLoginScopes, normalizeNotificationInn } from "./notificationInnScope.js";
import {
  PUSH_NOTIFICATION_EVENTS,
  isPushNotificationEnabled,
  mergePushPreferences,
} from "./notificationEmailPrefs.js";

export type PushControlAction =
  | "fcm_subscribe"
  | "fcm_unsubscribe"
  | "prefs_save"
  | "activation_sync";

export type PushJournalEntry = {
  login: string;
  inn?: string;
  action: PushControlAction | string;
  channel?: string;
  eventId?: string | null;
  enabled?: boolean | null;
  deviceTokenSuffix?: string | null;
  platform?: string | null;
  meta?: Record<string, unknown> | null;
};

type Queryable = {
  query: <T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

export function deviceTokenSuffix(token: string | null | undefined): string | null {
  const raw = String(token || "").trim();
  if (!raw) return null;
  return raw.length <= 12 ? raw : raw.slice(-12);
}

export async function ensurePushControlTables(pool: Queryable): Promise<void> {
  await pool.query(`
    create table if not exists push_control_journal (
      id bigserial primary key,
      login text not null,
      inn text not null default '',
      action text not null,
      channel text not null default 'push',
      event_id text,
      enabled boolean,
      device_token_suffix text,
      platform text,
      meta jsonb,
      created_at timestamptz not null default now()
    )
  `);
  await pool.query(`
    create table if not exists push_activation (
      login text not null,
      inn text not null,
      event_id text not null,
      enabled boolean not null default false,
      updated_at timestamptz not null default now(),
      primary key (login, inn, event_id)
    )
  `);
}

export async function writePushControlJournal(
  pool: Queryable,
  entry: PushJournalEntry,
): Promise<void> {
  const login = String(entry.login || "").trim().toLowerCase();
  if (!login || !entry.action) return;
  const inn = normalizeNotificationInn(entry.inn) || "";
  try {
    await pool.query(
      `INSERT INTO push_control_journal (
         login, inn, action, channel, event_id, enabled, device_token_suffix, platform, meta
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [
        login,
        inn,
        String(entry.action),
        String(entry.channel || "push"),
        entry.eventId == null ? null : String(entry.eventId),
        entry.enabled == null ? null : Boolean(entry.enabled),
        entry.deviceTokenSuffix || null,
        entry.platform || null,
        entry.meta ? JSON.stringify(entry.meta) : null,
      ],
    );
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === "42P01") return;
    throw e;
  }
}

/** Синхронизировать реестр активаций login×ИНН×событие из настроек и скоупа ИНН. */
export async function syncPushActivationForLogin(
  pool: Pool,
  loginRaw: string,
  pushPrefs: Record<string, boolean> | undefined,
  opts?: { source?: string; deviceTokenSuffix?: string | null; platform?: string | null },
): Promise<{ inns: string[]; events: Array<{ eventId: string; enabled: boolean }> }> {
  const login = String(loginRaw || "").trim().toLowerCase();
  if (!login) return { inns: [], events: [] };

  try {
    await ensurePushControlTables(pool);
  } catch {
    // best-effort
  }

  const scopes = await loadPushLoginScopes(pool);
  const scope = scopes.get(login);
  const inns = [...(scope?.inns || [])].map((inn) => normalizeNotificationInn(inn)).filter(Boolean);
  const merged = mergePushPreferences(pushPrefs);
  const events = PUSH_NOTIFICATION_EVENTS.map((eventId) => ({
    eventId,
    enabled: isPushNotificationEnabled(merged, eventId),
  }));

  if (inns.length === 0) {
    try {
      await pool.query(`DELETE FROM push_activation WHERE lower(trim(login)) = $1`, [login]);
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code !== "42P01") throw e;
    }
    await writePushControlJournal(pool, {
      login,
      action: "activation_sync",
      meta: {
        source: opts?.source || "sync",
        inns: [],
        reason: scope?.serviceWide ? "service_wide_empty" : "no_bound_inn",
        events,
      },
      deviceTokenSuffix: opts?.deviceTokenSuffix,
      platform: opts?.platform,
    });
    return { inns: [], events };
  }

  try {
    await pool.query(
      `DELETE FROM push_activation
       WHERE lower(trim(login)) = $1
         AND inn <> ALL($2::text[])`,
      [login, inns],
    );

    for (const inn of inns) {
      for (const row of events) {
        await pool.query(
          `INSERT INTO push_activation (login, inn, event_id, enabled, updated_at)
           VALUES ($1, $2, $3, $4, now())
           ON CONFLICT (login, inn, event_id)
           DO UPDATE SET enabled = excluded.enabled, updated_at = now()`,
          [login, inn, row.eventId, row.enabled],
        );
      }
      await writePushControlJournal(pool, {
        login,
        inn,
        action: "activation_sync",
        meta: {
          source: opts?.source || "sync",
          events: Object.fromEntries(events.map((e) => [e.eventId, e.enabled])),
        },
        deviceTokenSuffix: opts?.deviceTokenSuffix,
        platform: opts?.platform,
      });
    }
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === "42P01") return { inns, events };
    throw e;
  }

  return { inns, events };
}

/** Карта enabled по event_id для пары login+inn. null — реестра ещё нет (legacy fallback). */
export async function loadPushActivationEvents(
  pool: Queryable,
  loginRaw: string,
  innRaw: string,
): Promise<Record<string, boolean> | null> {
  const login = String(loginRaw || "").trim().toLowerCase();
  const inn = normalizeNotificationInn(innRaw);
  if (!login || !inn) return null;
  try {
    const { rows } = await pool.query<{ event_id: string; enabled: boolean }>(
      `SELECT event_id, enabled
       FROM push_activation
       WHERE lower(trim(login)) = $1 AND inn = $2`,
      [login, inn],
    );
    if (rows.length === 0) return null;
    const out: Record<string, boolean> = {};
    for (const row of rows) {
      out[String(row.event_id)] = row.enabled === true;
    }
    return out;
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === "42P01") return null;
    throw e;
  }
}

/**
 * Разрешена ли автоотправка FCM для login+inn+event.
 * Если есть строки в push_activation — только они; иначе fallback на prefs (legacy).
 * Отсутствующий event_id в реестре (новые типы после последней синхронизации) → prefs/дефолты.
 */
export function isPushEventAllowedForInn(params: {
  activation: Record<string, boolean> | null | undefined;
  prefs: Record<string, boolean> | undefined;
  eventId: string;
}): boolean {
  if (params.activation && Object.prototype.hasOwnProperty.call(params.activation, params.eventId)) {
    return params.activation[params.eventId] === true;
  }
  return isPushNotificationEnabled(params.prefs || {}, params.eventId);
}

export async function loadPushActivationByLogins(
  pool: Queryable,
  logins: string[],
): Promise<Map<string, Map<string, Record<string, boolean>>>> {
  const out = new Map<string, Map<string, Record<string, boolean>>>();
  const keys = [...new Set(logins.map((l) => String(l || "").trim().toLowerCase()).filter(Boolean))];
  if (keys.length === 0) return out;
  try {
    const { rows } = await pool.query<{ login: string; inn: string; event_id: string; enabled: boolean }>(
      `SELECT lower(trim(login)) AS login, inn, event_id, enabled
       FROM push_activation
       WHERE lower(trim(login)) = ANY($1::text[])`,
      [keys],
    );
    for (const row of rows) {
      const login = String(row.login || "").trim().toLowerCase();
      const inn = normalizeNotificationInn(row.inn);
      if (!login || !inn) continue;
      let byInn = out.get(login);
      if (!byInn) {
        byInn = new Map();
        out.set(login, byInn);
      }
      let events = byInn.get(inn);
      if (!events) {
        events = {};
        byInn.set(inn, events);
      }
      events[String(row.event_id)] = row.enabled === true;
    }
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code !== "42P01") throw e;
  }
  return out;
}

export async function listLoginsWithFcmTokens(pool: Queryable, logins: string[]): Promise<Set<string>> {
  const keys = [...new Set(logins.map((l) => String(l || "").trim().toLowerCase()).filter(Boolean))];
  const out = new Set<string>();
  if (keys.length === 0) return out;
  try {
    const { rows } = await pool.query<{ login: string }>(
      `SELECT DISTINCT lower(trim(login)) AS login
       FROM fcm_device_tokens
       WHERE lower(trim(login)) = ANY($1::text[])`,
      [keys],
    );
    for (const row of rows) {
      const login = String(row.login || "").trim().toLowerCase();
      if (login) out.add(login);
    }
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code !== "42P01") throw e;
  }
  return out;
}

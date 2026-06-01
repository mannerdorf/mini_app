import type { Pool } from "pg";

export const EMAIL_NOTIFICATION_EVENTS = [
  "accepted",
  "in_transit",
  "delivered",
  "bill_created",
  "bill_paid",
  "daily_summary",
  "weekly_summary",
] as const;

export type EmailNotificationEventId = (typeof EMAIL_NOTIFICATION_EVENTS)[number];

export const DEFAULT_EMAIL_PREFS: Record<string, boolean> = {
  accepted: true,
  in_transit: true,
  delivered: true,
  bill_created: true,
  bill_paid: true,
  daily_summary: true,
  weekly_summary: true,
};

export type NotificationPreferencesState = {
  telegram: Record<string, boolean>;
  webpush: Record<string, boolean>;
  email: Record<string, boolean>;
};

export function normalizeNotificationPreferencesState(raw: unknown): NotificationPreferencesState {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const telegram = obj.telegram && typeof obj.telegram === "object" ? (obj.telegram as Record<string, boolean>) : {};
  const webpush = obj.webpush && typeof obj.webpush === "object" ? (obj.webpush as Record<string, boolean>) : {};
  const email = obj.email && typeof obj.email === "object" ? (obj.email as Record<string, boolean>) : {};
  return {
    telegram: { ...telegram },
    webpush: { ...webpush },
    email: { ...DEFAULT_EMAIL_PREFS, ...email },
  };
}

export async function loadNotificationPreferencesState(
  pool: Pool,
  login: string,
): Promise<NotificationPreferencesState> {
  const key = String(login || "").trim().toLowerCase();
  if (!key) {
    return { telegram: {}, webpush: {}, email: { ...DEFAULT_EMAIL_PREFS } };
  }
  try {
    const { rows } = await pool.query<{ preferences: unknown }>(
      `SELECT preferences FROM notification_preferences_state WHERE login = $1 LIMIT 1`,
      [key],
    );
    if (rows[0]?.preferences) return normalizeNotificationPreferencesState(rows[0].preferences);
  } catch {
    /* ignore */
  }
  return { telegram: {}, webpush: {}, email: { ...DEFAULT_EMAIL_PREFS } };
}

/** По умолчанию включено, если настройка не задана явно. */
export async function isEmailNotificationEnabled(
  pool: Pool,
  login: string,
  eventId: EmailNotificationEventId,
): Promise<boolean> {
  const prefs = await loadNotificationPreferencesState(pool, login);
  const value = prefs.email[eventId];
  return value !== false;
}

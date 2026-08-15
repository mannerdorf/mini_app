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

/** По умолчанию все email-уведомления выключены — клиент включает сам. */
export const DEFAULT_EMAIL_PREFS: Record<string, boolean> = {
  accepted: false,
  in_transit: false,
  delivered: false,
  bill_created: false,
  bill_paid: false,
  daily_summary: false,
  weekly_summary: false,
};

export const PUSH_NOTIFICATION_EVENTS = [
  "accepted",
  "in_transit",
  "delivered",
  "bill_created",
  "bill_paid",
  "daily_summary",
] as const;

export type NotificationPreferencesState = {
  telegram: Record<string, boolean>;
  webpush: Record<string, boolean>;
  push: Record<string, boolean>;
  email: Record<string, boolean>;
};

export function normalizeNotificationPreferencesState(raw: unknown): NotificationPreferencesState {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const telegram = obj.telegram && typeof obj.telegram === "object" ? (obj.telegram as Record<string, boolean>) : {};
  const webpush = obj.webpush && typeof obj.webpush === "object" ? (obj.webpush as Record<string, boolean>) : {};
  const push = obj.push && typeof obj.push === "object" ? (obj.push as Record<string, boolean>) : {};
  const emailRaw = obj.email && typeof obj.email === "object" ? (obj.email as Record<string, boolean>) : {};
  const email: Record<string, boolean> = {};
  for (const eventId of EMAIL_NOTIFICATION_EVENTS) {
    if (typeof emailRaw[eventId] === "boolean") email[eventId] = emailRaw[eventId];
  }
  return {
    telegram: { ...telegram },
    webpush: { ...webpush },
    push: { ...push },
    email,
  };
}

export async function loadNotificationPreferencesState(
  pool: Pool,
  login: string,
): Promise<NotificationPreferencesState> {
  const key = String(login || "").trim().toLowerCase();
  if (!key) {
    return { telegram: {}, webpush: {}, push: {}, email: {} };
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
  return { telegram: {}, webpush: {}, push: {}, email: {} };
}

/** Отправляем только если клиент явно включил тип в профиле. */
export async function isEmailNotificationEnabled(
  pool: Pool,
  login: string,
  eventId: EmailNotificationEventId,
): Promise<boolean> {
  const prefs = await loadNotificationPreferencesState(pool, login);
  return prefs.email[eventId] === true;
}

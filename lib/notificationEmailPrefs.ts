import type { Pool } from "pg";

import {
  CARGO_STAGE_EVENT_IDS,
  isCargoStageNotificationEnabled,
  type CargoStageEventId,
} from "./notificationCargoEvents.js";

export const EMAIL_NOTIFICATION_EVENTS = [
  ...CARGO_STAGE_EVENT_IDS,
  "bill_created",
  "bill_paid",
  "daily_summary",
  "weekly_summary",
] as const;

export type EmailNotificationEventId = (typeof EMAIL_NOTIFICATION_EVENTS)[number];

/** По умолчанию все email-уведомления выключены — клиент включает сам. */
export const DEFAULT_EMAIL_PREFS: Record<string, boolean> = {
  info_received: false,
  received_at_warehouse: false,
  measured: false,
  consolidation: false,
  loaded: false,
  sent: false,
  arrived: false,
  delivery_scheduled: false,
  delivered: false,
  bill_created: false,
  bill_paid: false,
  daily_summary: false,
  weekly_summary: false,
};

export const PUSH_NOTIFICATION_EVENTS = [
  ...CARGO_STAGE_EVENT_IDS,
  "bill_created",
  "bill_paid",
  "daily_summary",
] as const;

/**
 * Push по умолчанию: счета и сводка — да; этапы груза — нет.
 * Иначе при одном ИНН на логин устройство засыпается всеми статусами всех перевозок компании.
 */
export const DEFAULT_PUSH_PREFS: Record<string, boolean> = {
  ...Object.fromEntries(CARGO_STAGE_EVENT_IDS.map((id) => [id, false])),
  bill_created: true,
  bill_paid: true,
  daily_summary: true,
};

export function isLegacyImplicitDailySummaryOff(push: Record<string, boolean> | undefined): boolean {
  const src = push && typeof push === "object" ? push : {};
  if (src.daily_summary !== false) return false;
  return !CARGO_STAGE_EVENT_IDS.some((id) => typeof src[id] === "boolean");
}

export function mergePushPreferences(saved: Record<string, boolean> | undefined): Record<string, boolean> {
  const src = saved && typeof saved === "object" ? saved : {};
  const merged = { ...DEFAULT_PUSH_PREFS, ...src };
  if (isLegacyImplicitDailySummaryOff(src)) merged.daily_summary = true;
  return merged;
}

/** Сохраняем только явные значения клиента, без подмешивания DEFAULT (иначе «выкл» затирает включённые этапы). */
export function sanitizePushPreferencesForSave(raw: Record<string, boolean> | undefined): Record<string, boolean> {
  const src = raw && typeof raw === "object" ? raw : {};
  const out: Record<string, boolean> = {};
  for (const eventId of PUSH_NOTIFICATION_EVENTS) {
    if (typeof src[eventId] === "boolean") out[eventId] = src[eventId];
  }
  return out;
}

/** Для UI/отправки: дефолты счетов/сводки + явные этапы груза. */
export function pushPreferencesForClient(raw: Record<string, boolean> | undefined): Record<string, boolean> {
  return mergePushPreferences(sanitizePushPreferencesForSave(raw));
}

export function shouldSendDailySummaryPush(push: Record<string, boolean> | undefined): boolean {
  const src = push && typeof push === "object" ? push : {};
  if (src.daily_summary === true) return true;
  if (src.daily_summary === false && isLegacyImplicitDailySummaryOff(src)) return true;
  return src.daily_summary !== false;
}

/** Push: счета/сводка по умолчанию вкл; этапы груза — только явное включение. */
export function isPushNotificationEnabled(prefs: Record<string, boolean>, eventId: string): boolean {
  const merged = mergePushPreferences(prefs);
  if (eventId === "bill_created" || eventId === "bill_paid" || eventId === "daily_summary") {
    return merged[eventId] !== false;
  }
  return isCargoStageNotificationEnabled(merged, eventId as CargoStageEventId);
}

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

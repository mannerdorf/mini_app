import type { Pool } from "pg";

import {
  CARGO_STAGE_EVENT_IDS,
  isCargoStageNotificationEnabled,
  isLegacyCoarseDeliveredFlag,
  type CargoStageEventId,
} from "./notificationCargoEvents.js";

const PUSH_BILL_AND_SUMMARY = ["bill_created", "bill_paid", "daily_summary"] as const;

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

/** Перенос legacy accepted / in_transit / delivered → новые этапы. */
export function migrateLegacyPushPreferences(raw: Record<string, boolean> | undefined): Record<string, boolean> {
  const src = raw && typeof raw === "object" ? { ...raw } : {};
  const legacyCoarseDelivered = isLegacyCoarseDeliveredFlag(src);
  if (src.accepted === true) {
    for (const id of ["info_received", "received_at_warehouse", "measured", "consolidation"] as const) {
      if (src[id] !== false) src[id] = true;
    }
  }
  if (src.in_transit === true) {
    for (const id of ["loaded", "sent", "arrived"] as const) {
      if (src[id] !== false) src[id] = true;
    }
  }
  if (legacyCoarseDelivered) {
    if (src.delivery_scheduled !== false) src.delivery_scheduled = true;
    src.delivered = true;
  }
  delete src.accepted;
  delete src.in_transit;
  return src;
}

/**
 * Слияние push при сохранении: не затираем уже включённые этапы «ложным false» из GET-дефолтов.
 * incoming: true — вкл; false — явное выкл; отсутствие ключа — не менять.
 */
export function mergePushPreferencesForSave(
  existingRaw: Record<string, boolean> | undefined,
  incomingRaw: Record<string, boolean> | undefined,
): Record<string, boolean> {
  const existing = migrateLegacyPushPreferences(existingRaw);
  const incoming = incomingRaw && typeof incomingRaw === "object" ? incomingRaw : {};
  const out: Record<string, boolean> = {};

  for (const eventId of PUSH_BILL_AND_SUMMARY) {
    if (typeof incoming[eventId] === "boolean") out[eventId] = incoming[eventId];
    else if (typeof existing[eventId] === "boolean") out[eventId] = existing[eventId];
  }

  const falseCargoIncoming = CARGO_STAGE_EVENT_IDS.filter((id) => incoming[id] === false);
  const ignoreIncomingFalse = falseCargoIncoming.length > 1;

  for (const eventId of CARGO_STAGE_EVENT_IDS) {
    if (incoming[eventId] === true) {
      out[eventId] = true;
      continue;
    }
    if (incoming[eventId] === false && !ignoreIncomingFalse) {
      continue;
    }
    if (existing[eventId] === true) out[eventId] = true;
  }

  return out;
}

/** Сохранённый push для БД: granular-этапы + счета, без legacy accepted/in_transit. */
export function finalizePushSavedState(raw: Record<string, boolean> | undefined): Record<string, boolean> {
  const src = raw && typeof raw === "object" ? raw : {};
  const out: Record<string, boolean> = {};
  for (const eventId of PUSH_NOTIFICATION_EVENTS) {
    if (typeof src[eventId] === "boolean") out[eventId] = src[eventId];
  }
  return out;
}

/** Атомарное переключение одного push-события поверх сохранённого состояния. */
export function applyPushPreferenceToggle(
  existingRaw: Record<string, boolean> | undefined,
  eventId: string,
  enabled: boolean,
): Record<string, boolean> {
  const key = String(eventId || "").trim();
  if (!(PUSH_NOTIFICATION_EVENTS as readonly string[]).includes(key)) {
    return finalizePushSavedState(existingRaw);
  }
  const merged = mergePushPreferencesForSave(existingRaw, { [key]: enabled });
  const finalized = finalizePushSavedState(merged);
  if (enabled) finalized[key] = true;
  else delete finalized[key];
  return finalized;
}

/** Payload от клиента: только включённые этапы + счета/сводка (без массовых false). */
export function buildPushPreferencesSavePayload(
  push: Record<string, boolean> | undefined,
  touch?: { eventId: string; value: boolean },
): Record<string, boolean> {
  const src = push && typeof push === "object" ? push : {};
  const out: Record<string, boolean> = {};

  for (const eventId of CARGO_STAGE_EVENT_IDS) {
    if (src[eventId] === true) out[eventId] = true;
  }
  if (touch && (CARGO_STAGE_EVENT_IDS as readonly string[]).includes(touch.eventId)) {
    if (touch.value) out[touch.eventId] = true;
    else out[touch.eventId] = false;
  }

  for (const eventId of PUSH_BILL_AND_SUMMARY) {
    if (typeof src[eventId] === "boolean") out[eventId] = src[eventId];
  }

  return out;
}

/** Для UI/отправки: дефолты счетов/сводки + явные этапы груза. */
export function pushPreferencesForClient(raw: Record<string, boolean> | undefined): Record<string, boolean> {
  const src = raw && typeof raw === "object" ? { ...raw } : {};
  const explicitDelivered = src.delivered;
  const migrated = migrateLegacyPushPreferences(src);
  if (explicitDelivered === true && !isLegacyCoarseDeliveredFlag(src)) {
    migrated.delivered = true;
  } else if (explicitDelivered === false) {
    migrated.delivered = false;
  }
  return mergePushPreferences(migrated);
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

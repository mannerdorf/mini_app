import type { Pool } from "pg";

import {
  CARGO_STAGE_EVENT_IDS,
  isCargoStageNotificationEnabled,
  isLegacyCoarseDeliveredFlag,
  type CargoStageEventId,
} from "./notificationCargoEvents.js";

const PUSH_BILL_AND_SUMMARY = [
  "bill_created",
  "bill_paid",
  "daily_summary",
  "planned_delivery_date",
  "app_update",
] as const;

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
  "planned_delivery_date",
  "app_update",
] as const;

/**
 * Push по умолчанию: счета, сводка, плановая дата и обновление приложения — да; этапы груза — нет.
 * Иначе при одном ИНН на логин устройство засыпается всеми статусами всех перевозок компании.
 */
export const DEFAULT_PUSH_PREFS: Record<string, boolean> = {
  ...Object.fromEntries(CARGO_STAGE_EVENT_IDS.map((id) => [id, false])),
  bill_created: true,
  bill_paid: true,
  daily_summary: true,
  planned_delivery_date: true,
  app_update: true,
};

/** Все типы push вкл. — при первом согласии пользователя на Android. */
export function buildAllPushPreferencesEnabled(): Record<string, boolean> {
  return Object.fromEntries(PUSH_NOTIFICATION_EVENTS.map((id) => [id, true]));
}

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

/** Push: счета/сводка/плановая дата/обновление по умолчанию вкл; этапы груза — только явное включение. */
export function isPushNotificationEnabled(prefs: Record<string, boolean>, eventId: string): boolean {
  const merged = mergePushPreferences(prefs);
  if (
    eventId === "bill_created" ||
    eventId === "bill_paid" ||
    eventId === "daily_summary" ||
    eventId === "planned_delivery_date" ||
    eventId === "app_update"
  ) {
    return merged[eventId] !== false;
  }
  return isCargoStageNotificationEnabled(merged, eventId as CargoStageEventId);
}

export type NotificationPreferencesState = {
  telegram: Record<string, boolean>;
  webpush: Record<string, boolean>;
  push: Record<string, boolean>;
  email: Record<string, boolean>;
  /** ИНН компании из переключателя шапки — для автопуша без служебного режима. */
  pushSelectedInn?: string | null;
};

export function readPushSelectedInn(raw: unknown): string {
  if (typeof raw === "string" || typeof raw === "number") {
    return String(raw).replace(/\D/g, "").trim();
  }
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return String(obj.push_selected_inn ?? "")
    .replace(/\D/g, "")
    .trim();
}

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
  const pushSelectedInn = readPushSelectedInn(obj) || null;
  return {
    telegram: { ...telegram },
    webpush: { ...webpush },
    push: { ...push },
    email,
    pushSelectedInn,
  };
}

export function serializeNotificationPreferencesState(state: NotificationPreferencesState): Record<string, unknown> {
  const pushSelectedInn = readPushSelectedInn(state.pushSelectedInn);
  return {
    telegram: state.telegram,
    webpush: state.webpush,
    push: state.push,
    email: state.email,
    ...(pushSelectedInn ? { push_selected_inn: pushSelectedInn } : {}),
  };
}

export async function savePushSelectedInn(
  pool: Pool,
  loginRaw: string,
  innRaw: string | null | undefined,
): Promise<{ pushSelectedInn: string | null }> {
  const login = String(loginRaw || "").trim().toLowerCase();
  const pushSelectedInn = readPushSelectedInn(innRaw) || null;
  if (!login) return { pushSelectedInn: null };

  const existing = await loadNotificationPreferencesState(pool, login);
  const next = normalizeNotificationPreferencesState({
    ...serializeNotificationPreferencesState(existing),
    push_selected_inn: pushSelectedInn,
  });

  try {
    await pool.query(
      `INSERT INTO notification_preferences_state (login, preferences, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (login)
       DO UPDATE SET preferences = excluded.preferences, updated_at = now()`,
      [login, JSON.stringify(serializeNotificationPreferencesState(next))],
    );
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === "42P01") throw new Error("Run migration 048_notification_preferences_state.sql");
    throw e;
  }

  return { pushSelectedInn };
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

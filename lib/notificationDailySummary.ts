import type { Pool } from "pg";
import { getPaymentKey } from "./notificationPoll.js";
import { buildNotificationEmailPreview } from "./notificationEmailPreview.js";
import { isEmailNotificationEnabled, shouldSendDailySummaryPush } from "./notificationEmailPrefs.js";

export { shouldSendDailySummaryPush };
import { hasSummaryEmailSentToday } from "./haulzSummaryEmailDailyLimit.js";
import { readCacheRow } from "./documentCacheRefreshCore.js";
import { cacheHistoryDateFrom } from "./cacheHistoryDays.js";
import { readDocumentsFromCacheByPeriod } from "./documentCacheRead.js";
import { isNormalizedCacheReady } from "./documentCacheNormalized.js";
import {
  perevozkiCustomerInn,
  perevozkiReceiverInn,
  perevozkiSenderInn,
} from "./perevozkiPartyMatch.js";
import { perevozkiItemInn } from "../api/perevozki.js";
import { loadPushLoginScopes, normalizeNotificationInn } from "./notificationInnScope.js";

export type DailySummaryStats = {
  activeStatusCounts: Map<string, number>;
  unpaidCount: number;
  unpaidSum: number;
};

export type DailySummaryChannelPrefs = {
  telegram: boolean;
  push: boolean;
  email: boolean;
};

export function normalizeInn(v: unknown): string {
  return normalizeNotificationInn(v) || String(v ?? "").trim();
}

function normalizeInnCanon(inn: string): string {
  return normalizeNotificationInn(inn) || String(inn ?? "").trim();
}

export function normalizeStatus(state: unknown): string {
  if (state == null) return "Без статуса";
  if (typeof state === "string") {
    const s = state.trim();
    return s || "Без статуса";
  }
  if (typeof state === "object") {
    const o = state as Record<string, unknown>;
    for (const k of ["Name", "name", "Value", "value", "State", "state", "Статус"]) {
      const v = o[k];
      if (v != null && typeof v !== "object") {
        const s = String(v).trim();
        if (s) return s;
      }
    }
  }
  const s = String(state).trim();
  return s || "Без статуса";
}

export function invoiceSum(item: Record<string, unknown>): number {
  const v = item?.SumDoc ?? item?.Sum ?? item?.sum ?? item?.Amount ?? item?.["Сумма"] ?? 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function invoiceItemInn(item: Record<string, unknown>): string {
  return normalizeInnCanon(String(item.INN ?? item.Inn ?? item.inn ?? ""));
}

/** Preloaded cache indexes for one daily-summary run (avoids live 1C + repeated blob scans). */
export type DailySummaryCacheIndex = {
  cargoByInn: Map<string, Record<string, unknown>[]>;
  invoicesByInn: Map<string, Record<string, unknown>[]>;
  source: "normalized" | "blob";
};

function pushIndexedItem(
  map: Map<string, Record<string, unknown>[]>,
  inn: string,
  item: Record<string, unknown>,
): void {
  const key = normalizeInnCanon(inn);
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key)!.push(item);
}

function indexCargoByPartyInns(
  cargoByInn: Map<string, Record<string, unknown>[]>,
  item: Record<string, unknown>,
): void {
  const inns = new Set<string>();
  for (const raw of [
    perevozkiCustomerInn(item),
    perevozkiSenderInn(item),
    perevozkiReceiverInn(item),
    perevozkiItemInn(item),
  ]) {
    const inn = normalizeInnCanon(raw);
    if (inn) inns.add(inn);
  }
  for (const inn of inns) pushIndexedItem(cargoByInn, inn, item);
}

async function loadDailySummaryCacheIndexFromBlob(pool: Pool): Promise<DailySummaryCacheIndex> {
  const cargoByInn = new Map<string, Record<string, unknown>[]>();
  const invoicesByInn = new Map<string, Record<string, unknown>[]>();

  const cargoRows = await readCacheRow(pool, "cache_perevozki");
  for (const raw of cargoRows) {
    if (!raw || typeof raw !== "object") continue;
    indexCargoByPartyInns(cargoByInn, raw as Record<string, unknown>);
  }

  const invoiceRows = await readCacheRow(pool, "cache_invoices");
  for (const raw of invoiceRows) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const inn = invoiceItemInn(item);
    if (!inn) continue;
    pushIndexedItem(invoicesByInn, inn, item);
  }

  return { cargoByInn, invoicesByInn, source: "blob" };
}

async function loadDailySummaryCacheIndexFromNormalized(pool: Pool): Promise<DailySummaryCacheIndex> {
  const cargoByInn = new Map<string, Record<string, unknown>[]>();
  const invoicesByInn = new Map<string, Record<string, unknown>[]>();
  const dateFrom = cacheHistoryDateFrom();
  const dateTo = new Date().toISOString().split("T")[0];

  const [cargoReady, invoicesReady] = await Promise.all([
    isNormalizedCacheReady(pool, "perevozki"),
    isNormalizedCacheReady(pool, "invoices"),
  ]);

  if (cargoReady) {
    const { items } = await readDocumentsFromCacheByPeriod(pool, "perevozki", dateFrom, dateTo);
    for (const raw of items) {
      if (!raw || typeof raw !== "object") continue;
      indexCargoByPartyInns(cargoByInn, raw as Record<string, unknown>);
    }
  }

  if (invoicesReady) {
    const { items } = await readDocumentsFromCacheByPeriod(pool, "invoices", dateFrom, dateTo);
    for (const raw of items) {
      if (!raw || typeof raw !== "object") continue;
      const item = raw as Record<string, unknown>;
      const inn = invoiceItemInn(item);
      if (!inn) continue;
      pushIndexedItem(invoicesByInn, inn, item);
    }
  }

  return { cargoByInn, invoicesByInn, source: "normalized" };
}

export async function loadDailySummaryCacheIndex(pool: Pool): Promise<DailySummaryCacheIndex> {
  try {
    const [cargoReady, invoicesReady] = await Promise.all([
      isNormalizedCacheReady(pool, "perevozki"),
      isNormalizedCacheReady(pool, "invoices"),
    ]);
    if (cargoReady || invoicesReady) {
      return await loadDailySummaryCacheIndexFromNormalized(pool);
    }
  } catch {
    // fallback to legacy blob tables
  }
  return loadDailySummaryCacheIndexFromBlob(pool);
}

export function computeDailySummaryStatsFromCache(
  inns: Iterable<string>,
  index: DailySummaryCacheIndex,
): DailySummaryStats {
  const activeStatusCounts = new Map<string, number>();
  let unpaidCount = 0;
  let unpaidSum = 0;

  for (const innRaw of inns) {
    const inn = normalizeInnCanon(normalizeInn(innRaw));
    if (!inn) continue;

    for (const item of index.cargoByInn.get(inn) || []) {
      const status = normalizeStatus(item?.State);
      const statusLower = status.toLowerCase();
      const isDelivered = statusLower.includes("достав") || statusLower.includes("заверш");
      if (isDelivered) continue;
      activeStatusCounts.set(status, (activeStatusCounts.get(status) || 0) + 1);
    }

    for (const inv of index.invoicesByInn.get(inn) || []) {
      const paymentKey = getPaymentKey(String(inv?.StateBill ?? inv?.Status ?? inv?.State ?? ""));
      if (paymentKey === "paid") continue;
      unpaidCount += 1;
      unpaidSum += invoiceSum(inv);
    }
  }

  return { activeStatusCounts, unpaidCount, unpaidSum };
}

/** @deprecated Prefer cache-based compute for cron; kept for tests/manual. */
export async function computeDailySummaryStats(
  inns: Iterable<string>,
  serviceLogin: string,
  servicePassword: string,
): Promise<{ stats: DailySummaryStats; errors: string[] }> {
  const { fetchInvoicesByInn, fetchPerevozkiByInn } = await import("./notificationPoll.js");
  const activeStatusCounts = new Map<string, number>();
  let unpaidCount = 0;
  let unpaidSum = 0;
  const errors: string[] = [];

  for (const innRaw of inns) {
    const inn = normalizeInn(innRaw);
    if (!inn) continue;

    try {
      const { items: cargoItems } = await fetchPerevozkiByInn(inn, serviceLogin, servicePassword);
      for (const item of cargoItems) {
        const status = normalizeStatus(item?.State);
        const statusLower = status.toLowerCase();
        const isDelivered = statusLower.includes("достав") || statusLower.includes("заверш");
        if (isDelivered) continue;
        activeStatusCounts.set(status, (activeStatusCounts.get(status) || 0) + 1);
      }
    } catch (e: unknown) {
      errors.push(`cargo ${inn}: ${(e as { message?: string })?.message || String(e)}`);
    }

    try {
      const { items: invoiceItems } = await fetchInvoicesByInn(inn, serviceLogin, servicePassword);
      for (const inv of invoiceItems) {
        const paymentKey = getPaymentKey(String(inv?.StateBill ?? inv?.Status ?? inv?.State ?? ""));
        if (paymentKey === "paid") continue;
        unpaidCount += 1;
        unpaidSum += invoiceSum(inv as Record<string, unknown>);
      }
    } catch (e: unknown) {
      errors.push(`invoices ${inn}: ${(e as { message?: string })?.message || String(e)}`);
    }
  }

  return {
    stats: { activeStatusCounts, unpaidCount, unpaidSum },
    errors,
  };
}

export function aggregateDailySummaryCargoCounts(
  activeStatusCounts: Map<string, number>,
): { inTransit: number; readyForPickup: number } {
  let inTransit = 0;
  let readyForPickup = 0;

  for (const [status, count] of activeStatusCounts) {
    const lower = status.toLowerCase();
    if (lower.includes("готов")) {
      readyForPickup += count;
      continue;
    }
    if (lower.includes("пути") || lower.includes("отправлен")) {
      inTransit += count;
    }
  }

  return { inTransit, readyForPickup };
}

export function formatDailySummaryPlainText(stats: DailySummaryStats): string {
  const { inTransit, readyForPickup } = aggregateDailySummaryCargoCounts(stats.activeStatusCounts);
  const sumFmt = new Intl.NumberFormat("ru-RU").format(Math.round(stats.unpaidSum));

  return (
    `В пути: ${inTransit}\n` +
    `Готово к выдаче: ${readyForPickup}\n` +
    `Неоплаченные счета: ${stats.unpaidCount} шт. на сумму ${sumFmt} ₽`
  );
}

export async function loadDailySummaryPrefsByLogin(
  pool: Pool,
  logins: string[],
): Promise<Map<string, DailySummaryChannelPrefs>> {
  const result = new Map<string, DailySummaryChannelPrefs>();
  for (const login of logins) {
    const key = String(login || "").trim().toLowerCase();
    if (!key) continue;
    // Defaults: telegram + push summary on; email opt-in.
    result.set(key, { telegram: true, push: true, email: false });
  }
  if (logins.length === 0) return result;

  const keys = [...result.keys()];
  const loadedFromState = new Set<string>();

  try {
    const stateRes = await pool.query<{ login: string; preferences: unknown }>(
      `SELECT login, preferences FROM notification_preferences_state WHERE login = ANY($1::text[])`,
      [keys],
    );
    for (const row of stateRes.rows) {
      const login = String(row.login || "").trim().toLowerCase();
      if (!login) continue;
      const raw = row.preferences && typeof row.preferences === "object" ? (row.preferences as Record<string, unknown>) : {};
      const telegram = raw.telegram && typeof raw.telegram === "object" ? (raw.telegram as Record<string, boolean>) : {};
      const push = raw.push && typeof raw.push === "object" ? (raw.push as Record<string, boolean>) : {};
      const email = raw.email && typeof raw.email === "object" ? (raw.email as Record<string, boolean>) : {};
      result.set(login, {
        telegram: telegram.daily_summary !== false,
        push: shouldSendDailySummaryPush(push),
        email: email.daily_summary === true,
      });
      loadedFromState.add(login);
    }
  } catch {
    // fallback below
  }

  const missing = keys.filter((k) => !loadedFromState.has(k));
  if (missing.length > 0) {
    try {
      const legacyRes = await pool.query<{ login: string; channel: string; enabled: boolean }>(
        `SELECT lower(trim(login)) AS login, channel, enabled
         FROM notification_preferences
         WHERE event_id = 'daily_summary' AND lower(trim(login)) = ANY($1::text[])`,
        [missing],
      );
      for (const row of legacyRes.rows) {
        const login = String(row.login || "").trim().toLowerCase();
        if (!login) continue;
        const current = result.get(login) || { telegram: true, push: true, email: false };
        if (row.channel === "telegram") current.telegram = !!row.enabled;
        if (row.channel === "push") current.push = row.enabled !== false;
        if (row.channel === "email") current.email = !!row.enabled;
        result.set(login, current);
      }
    } catch {
      // ignore
    }
  }

  return result;
}

export async function loadLoginInns(pool: Pool): Promise<Map<string, Set<string>>> {
  const byLogin = new Map<string, Set<string>>();
  const scopes = await loadPushLoginScopes(pool);
  for (const scope of scopes.values()) {
    if (scope.inns.size === 0) continue;
    byLogin.set(scope.login, new Set(scope.inns));
  }
  return byLogin;
}

export async function loadTelegramChatIds(pool: Pool, logins: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (logins.length === 0) return map;
  try {
    const { rows } = await pool.query<{ login: string; telegram_chat_id: string }>(
      `SELECT lower(trim(login)) AS login, telegram_chat_id
       FROM telegram_chat_links
       WHERE chat_status = 'active'
         AND telegram_chat_id IS NOT NULL
         AND trim(telegram_chat_id) <> ''
         AND lower(trim(login)) = ANY($1::text[])`,
      [logins],
    );
    for (const row of rows) {
      const login = String(row.login || "").trim().toLowerCase();
      const chatId = String(row.telegram_chat_id || "").trim();
      if (login && chatId) map.set(login, chatId);
    }
  } catch {
    // ignore
  }
  return map;
}

export async function resolveLoginEmail(pool: Pool, login: string): Promise<string | null> {
  const key = String(login || "").trim().toLowerCase();
  if (!key) return null;
  if (key.includes("@")) return key;
  try {
    const { rows } = await pool.query<{ email: string | null }>(
      `SELECT email FROM cache_customers WHERE lower(trim(email)) = $1 LIMIT 1`,
      [key],
    );
    const email = String(rows[0]?.email || "").trim().toLowerCase();
    return email || null;
  } catch {
    return null;
  }
}

export async function sendDailySummaryEmail(
  pool: Pool,
  params: { login: string; inn: string; companyName?: string },
): Promise<{ ok: boolean; error?: string }> {
  const login = String(params.login || "").trim().toLowerCase();
  if (!(await isEmailNotificationEnabled(pool, login, "daily_summary"))) {
    return { ok: false, error: "daily_summary disabled in profile" };
  }
  if (await hasSummaryEmailSentToday(pool, login)) {
    return { ok: false, error: "already sent today" };
  }
  const to = await resolveLoginEmail(pool, login);
  if (!to) return { ok: false, error: "email not found" };

  const inn = normalizeInn(params.inn);
  const companyName = String(params.companyName || inn).trim() || inn;
  const preview = await buildNotificationEmailPreview(pool, {
    kind: "daily_summary",
    targetLogin: login,
    inn,
    companyName,
  });

  const { isSummaryEmailUnsubscribed } = await import("./haulzSummaryUnsubscribe.js");
  if (await isSummaryEmailUnsubscribed(pool, to)) {
    return { ok: false, error: "unsubscribed" };
  }

  const {
    createSummaryMessageId,
    injectSummaryEmailTracking,
    recordSummaryEmailSend,
  } = await import("./haulzSummaryEmailTrack.js");
  const messageId = createSummaryMessageId();
  const trackedHtml = injectSummaryEmailTracking(preview.html, messageId, login);
  const { sendHaulzEmail } = await import("./sendRegistrationEmail.js");
  const result = await sendHaulzEmail(pool, { to, subject: preview.subject, html: trackedHtml });
  if (result.ok) {
    await recordSummaryEmailSend(pool, {
      messageId,
      toEmail: to,
      subject: preview.subject,
      targetLogin: login,
      inn,
    });
  }
  return result;
}

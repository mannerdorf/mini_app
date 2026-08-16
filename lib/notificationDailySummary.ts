import type { Pool } from "pg";
import { fetchInvoicesByInn, fetchPerevozkiByInn, getPaymentKey } from "./notificationPoll.js";
import { buildNotificationEmailPreview } from "./notificationEmailPreview.js";
import { isEmailNotificationEnabled } from "./notificationEmailPrefs.js";
import { hasSummaryEmailSentToday } from "./haulzSummaryEmailDailyLimit.js";

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
  return String(v ?? "").trim();
}

export function normalizeStatus(state: unknown): string {
  const s = String(state ?? "").trim();
  return s || "Без статуса";
}

export function invoiceSum(item: Record<string, unknown>): number {
  const v = item?.SumDoc ?? item?.Sum ?? item?.sum ?? item?.Amount ?? item?.["Сумма"] ?? 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export async function computeDailySummaryStats(
  inns: Iterable<string>,
  serviceLogin: string,
  servicePassword: string,
): Promise<{ stats: DailySummaryStats; errors: string[] }> {
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

export function formatDailySummaryPlainText(stats: DailySummaryStats): string {
  const statuses = Array.from(stats.activeStatusCounts.entries()).sort((a, b) => b[1] - a[1]);
  const statusLine =
    statuses.length > 0
      ? statuses.map(([name, count]) => `${name}: ${count}`).join("; ")
      : "нет активных перевозок";
  const sumFmt = new Intl.NumberFormat("ru-RU").format(Math.round(stats.unpaidSum));

  return (
    `Доброе утро! Ежедневная сводка на 10:00.\n` +
    `Активные перевозки: ${statusLine}.\n` +
    `Неоплаченные счета: ${stats.unpaidCount} шт. на сумму ${sumFmt} ₽.`
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
    result.set(key, { telegram: true, push: false, email: false });
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
        push: push.daily_summary === true,
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
        const current = result.get(login) || { telegram: true, push: false, email: false };
        if (row.channel === "telegram") current.telegram = !!row.enabled;
        if (row.channel === "push") current.push = !!row.enabled;
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
  const { rows } = await pool.query<{ login: string; inn: string }>(
    `SELECT lower(trim(login)) AS login, inn
     FROM account_companies
     WHERE inn IS NOT NULL AND trim(inn) <> ''`,
  );
  for (const row of rows) {
    const login = String(row.login || "").trim().toLowerCase();
    const inn = normalizeInn(row.inn);
    if (!login || !inn) continue;
    if (!byLogin.has(login)) byLogin.set(login, new Set());
    byLogin.get(login)!.add(inn);
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

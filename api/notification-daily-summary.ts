import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db";
import {
  fetchPerevozkiByInn,
  fetchInvoicesByInn,
  getPaymentKey,
} from "../lib/notificationPoll";

const CRON_SECRET = process.env.CRON_SECRET;
const TG_BOT_TOKEN = process.env.HAULZ_TELEGRAM_BOT_TOKEN || process.env.TG_BOT_TOKEN;
const POLL_SERVICE_LOGIN = process.env.POLL_SERVICE_LOGIN;
const POLL_SERVICE_PASSWORD = process.env.POLL_SERVICE_PASSWORD;

async function sendTelegramMessage(chatId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  if (!TG_BOT_TOKEN) return { ok: false, error: "TG_BOT_TOKEN not set" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) return { ok: false, error: data?.description || String(res.status) };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

function normalizeInn(v: unknown): string {
  return String(v ?? "").trim();
}

function normalizeStatus(state: unknown): string {
  const s = String(state ?? "").trim();
  return s || "Без статуса";
}

function invoiceSum(item: any): number {
  const v = item?.SumDoc ?? item?.Sum ?? item?.sum ?? item?.Amount ?? item?.Сумма ?? 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "POST, GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth =
    (req.headers.authorization && req.headers.authorization.replace(/^Bearer\s+/i, "")) ||
    (req.query?.secret as string) ||
    "";
  if (!CRON_SECRET || auth !== CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!POLL_SERVICE_LOGIN || !POLL_SERVICE_PASSWORD) {
    return res.status(503).json({ error: "POLL_SERVICE_LOGIN and POLL_SERVICE_PASSWORD are required" });
  }
  if (!TG_BOT_TOKEN) {
    return res.status(503).json({ error: "HAULZ_TELEGRAM_BOT_TOKEN is required" });
  }

  let pool: Awaited<ReturnType<typeof getPool>>;
  try {
    pool = getPool();
  } catch {
    return res.status(503).json({ error: "Database not configured" });
  }

  try {
    const linksRes = await pool.query<{ login: string; telegram_chat_id: string; inn: string | null }>(
      `select lower(trim(login)) as login, telegram_chat_id, inn
       from telegram_chat_links
       where chat_status = 'active' and telegram_chat_id is not null and telegram_chat_id <> ''`
    );
    if (linksRes.rows.length === 0) {
      return res.status(200).json({ ok: true, sent: 0, reason: "no active telegram links" });
    }

    const summaryPrefsRes = await pool.query<{ login: string; enabled: boolean }>(
      `select lower(trim(login)) as login, enabled
       from notification_preferences
       where channel = 'telegram' and event_id = 'daily_summary'`
    );
    const summaryPrefs = new Map<string, boolean>();
    for (const row of summaryPrefsRes.rows) {
      if (row.login) summaryPrefs.set(row.login, !!row.enabled);
    }

    let sent = 0;
    const errors: Array<{ login: string; error: string }> = [];
    let skippedByPrefs = 0;

    for (const link of linksRes.rows) {
      const login = link.login;
      const chatId = String(link.telegram_chat_id || "").trim();
      if (!login || !chatId) continue;
      const enabled = summaryPrefs.get(login);
      if (enabled === false) {
        skippedByPrefs += 1;
        continue;
      }

      const innsRes = await pool.query<{ inn: string }>(
        "select inn from account_companies where lower(trim(login)) = $1 and inn is not null and inn <> ''",
        [login]
      );
      const inns = new Set(
        innsRes.rows.map((r) => normalizeInn(r.inn)).filter(Boolean)
      );
      if (link.inn) inns.add(normalizeInn(link.inn));
      if (inns.size === 0) continue;

      const activeStatusCounts = new Map<string, number>();
      let unpaidCount = 0;
      let unpaidSum = 0;

      for (const inn of inns) {
        try {
          const { items: cargoItems } = await fetchPerevozkiByInn(
            inn,
            POLL_SERVICE_LOGIN,
            POLL_SERVICE_PASSWORD
          );
          for (const item of cargoItems) {
            const status = normalizeStatus(item?.State);
            const statusLower = status.toLowerCase();
            const isDelivered = statusLower.includes("достав") || statusLower.includes("заверш");
            if (isDelivered) continue;
            activeStatusCounts.set(status, (activeStatusCounts.get(status) || 0) + 1);
          }
        } catch (e: any) {
          errors.push({ login, error: `cargo ${inn}: ${e?.message || String(e)}` });
        }

        try {
          const { items: invoiceItems } = await fetchInvoicesByInn(
            inn,
            POLL_SERVICE_LOGIN,
            POLL_SERVICE_PASSWORD
          );
          for (const inv of invoiceItems) {
            const paymentKey = getPaymentKey(inv?.StateBill ?? inv?.Status ?? inv?.State);
            if (paymentKey === "paid") continue;
            unpaidCount += 1;
            unpaidSum += invoiceSum(inv);
          }
        } catch (e: any) {
          errors.push({ login, error: `invoices ${inn}: ${e?.message || String(e)}` });
        }
      }

      const statuses = Array.from(activeStatusCounts.entries()).sort((a, b) => b[1] - a[1]);
      const statusLine =
        statuses.length > 0
          ? statuses.map(([name, count]) => `${name}: ${count}`).join("; ")
          : "нет активных перевозок";
      const sumFmt = new Intl.NumberFormat("ru-RU").format(Math.round(unpaidSum));

      const text =
        `Доброе утро! Ежедневная сводка на 10:00.\n` +
        `Активные перевозки: ${statusLine}.\n` +
        `Неоплаченные счета: ${unpaidCount} шт. на сумму ${sumFmt} ₽.`;

      const sendRes = await sendTelegramMessage(chatId, text);
      if (sendRes.ok) {
        sent += 1;
      } else {
        errors.push({ login, error: sendRes.error || "send failed" });
      }
    }

    return res.status(200).json({
      ok: true,
      sent,
      skipped_by_preferences: skippedByPrefs,
      errors_count: errors.length,
      errors: errors.slice(0, 20),
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}


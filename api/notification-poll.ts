import type { VercelRequest, VercelResponse } from "@vercel/node";
import webpush from "web-push";
import { getPool } from "./_db";
import { getRedisValue } from "./redis";
import {
  type CargoEvent,
  getCargoStatusKey,
  getPaymentKey,
  fetchPerevozkiByInn,
  formatTelegramMessage,
} from "../lib/notificationPoll";

const CRON_SECRET = process.env.CRON_SECRET;
const TG_BOT_TOKEN = process.env.HAULZ_TELEGRAM_BOT_TOKEN || process.env.TG_BOT_TOKEN;
const POLL_SERVICE_LOGIN = process.env.POLL_SERVICE_LOGIN;
const POLL_SERVICE_PASSWORD = process.env.POLL_SERVICE_PASSWORD;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

const NOTIFICATION_EVENTS: CargoEvent[] = ["accepted", "in_transit", "delivered", "bill_created", "bill_paid"];

function hasBillData(item: any): boolean {
  const number = String(
    item?.NumberBill ?? item?.BillNumber ?? item?.Invoice ?? item?.InvoiceNumber ?? item?.["Счет"] ?? item?.["Счёт"] ?? ""
  ).trim();
  if (number) return true;
  const stateBill = String(item?.StateBill ?? item?.StatusBill ?? "").trim();
  return !!stateBill;
}

async function sendTelegramMessage(
  chatId: string,
  text: string,
  replyMarkup?: Record<string, unknown>
): Promise<{ ok: boolean; error?: string }> {
  if (!TG_BOT_TOKEN) return { ok: false, error: "TG_BOT_TOKEN not set" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) return { ok: false, error: data?.description || String(res.status) };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

async function sendWebPushToLogin(
  login: string,
  title: string,
  body: string
): Promise<{ ok: boolean; sent: number; error?: string }> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return { ok: false, sent: 0, error: "VAPID not set" };
  const raw = await getRedisValue(`webpush:subs:${login}`);
  let list: any[] = [];
  try {
    list = raw ? JSON.parse(raw) : [];
  } catch {
    list = [];
  }
  if (!Array.isArray(list)) list = [];
  webpush.setVapidDetails("mailto:support@haulz.ru", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  const payload = JSON.stringify({ title, body, url: "/" });
  let sent = 0;
  for (const sub of list) {
    if (!sub?.endpoint || !sub?.keys) continue;
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
          expirationTime: sub.expirationTime ?? undefined,
        },
        payload,
        { TTL: 60 * 60 * 24 }
      );
      sent += 1;
    } catch (_) {}
  }
  return { ok: sent > 0, sent };
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

  let pool: Awaited<ReturnType<typeof getPool>>;
  try {
    pool = getPool();
  } catch {
    return res.status(503).json({ error: "Database not configured" });
  }

  if (!POLL_SERVICE_LOGIN || !POLL_SERVICE_PASSWORD) {
    return res.status(503).json({
      error: "POLL_SERVICE_LOGIN and POLL_SERVICE_PASSWORD required for notification poll",
    });
  }

  const runResult = await pool.query<{ id: string }>(
    `insert into notification_poll_runs (status, inns_polled, notifications_sent) values ('running', 0, 0) returning id`
  );
  const runId = runResult.rows[0]?.id;
  if (!runId) {
    return res.status(500).json({ error: "Failed to create poll run" });
  }

  let status: "ok" | "partial" | "error" = "ok";
  let errorMessage: string | null = null;
  let innsPolled = 0;
  let notificationsSent = 0;
  const appDomain =
    process.env.NEXT_PUBLIC_APP_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://mini-app-lake-phi.vercel.app");

  try {
    const companiesResult = await pool.query<{ login: string; inn: string }>(
      "SELECT login, inn FROM account_companies WHERE inn IS NOT NULL AND inn != ''"
    );
    const loginInnPairs = companiesResult.rows;

    const prefsResult = await pool.query<{ login: string; channel: string; event_id: string }>(
      "SELECT login, channel, event_id FROM notification_preferences WHERE enabled = true"
    );
    const prefsByLogin = new Map<
      string,
      { telegram: Record<string, boolean>; web: Record<string, boolean> }
    >();
    for (const r of prefsResult.rows) {
      const key = r.login.toLowerCase();
      let p = prefsByLogin.get(key);
      if (!p) {
        p = { telegram: {}, web: {} };
        prefsByLogin.set(key, p);
      }
      const ch = r.channel === "telegram" ? "telegram" : "web";
      if (NOTIFICATION_EVENTS.includes(r.event_id as CargoEvent)) {
        p[ch][r.event_id] = true;
      }
    }

    const uniqueLogins = [...new Set(loginInnPairs.map((r) => r.login.toLowerCase()))];
    const chatIdByLogin = new Map<string, string>();
    try {
      const tgLinks = await pool.query<{ login: string; telegram_chat_id: string }>(
        `select login, telegram_chat_id
         from telegram_chat_links
         where chat_status = 'active' and telegram_chat_id is not null and telegram_chat_id <> ''`
      );
      for (const row of tgLinks.rows) {
        const loginKey = String(row.login || "").trim().toLowerCase();
        const chatId = String(row.telegram_chat_id || "").trim();
        if (loginKey && chatId) {
          chatIdByLogin.set(loginKey, chatId);
        }
      }
    } catch (e: any) {
      if (e?.code !== "42P01") {
        console.error("notification-poll telegram_chat_links query failed:", e?.message || e);
      }
    }
    for (const login of uniqueLogins) {
      if (chatIdByLogin.has(login)) continue;
      const chatId = await getRedisValue(`tg:by_login:${login}`);
      if (chatId) chatIdByLogin.set(login, chatId);
    }

    const subscribersByInn = new Map<
      string,
      Array<{
        login: string;
        telegramChatId: string | null;
        prefsTelegram: Record<string, boolean>;
        prefsWeb: Record<string, boolean>;
      }>
    >();
    for (const { login, inn } of loginInnPairs) {
      const key = login.toLowerCase();
      const prefs = prefsByLogin.get(key);
      if (!prefs) continue;
      const hasAny =
        NOTIFICATION_EVENTS.some((ev) => prefs.telegram[ev]) || NOTIFICATION_EVENTS.some((ev) => prefs.web[ev]);
      if (!hasAny) continue;
      const telegramChatId = chatIdByLogin.get(key) || null;
      const list = subscribersByInn.get(inn) || [];
      list.push({
        login: key,
        telegramChatId,
        prefsTelegram: prefs.telegram,
        prefsWeb: prefs.web,
      });
      subscribersByInn.set(inn, list);
    }

    const innsToPoll = [...subscribersByInn.keys()];

    for (const inn of innsToPoll) {
      innsPolled += 1;
      let items: any[];
      try {
        const { items: list } = await fetchPerevozkiByInn(
          inn,
          POLL_SERVICE_LOGIN,
          POLL_SERVICE_PASSWORD
        );
        items = list || [];
      } catch (e: any) {
        console.error("notification-poll fetch perevozki by inn failed:", inn, e?.message || e);
        status = "partial";
        if (!errorMessage) errorMessage = `Fetch INN ${inn}: ${e?.message || e}`;
        continue;
      }

      if (items.length === 0) continue;

      const cargoNumbers = items.map((i: any) => String(i?.Number ?? i?.number ?? "").trim()).filter(Boolean);
      const lastStateResult = await pool.query<{ cargo_number: string; state: string | null; state_bill: string | null }>(
        "SELECT cargo_number, state, state_bill FROM cargo_last_state WHERE inn = $1 AND cargo_number = ANY($2)",
        [inn, cargoNumbers]
      );
      const lastByNumber = new Map(
        lastStateResult.rows.map((r) => [r.cargo_number, { state: r.state, state_bill: r.state_bill }])
      );

      const subscribers = subscribersByInn.get(inn) || [];

      for (const item of items) {
        const number = String(item?.Number ?? item?.number ?? "").trim();
        if (!number) continue;
        const currentState = item?.State ?? null;
        const currentStateBill = item?.StateBill ?? null;
        const stateKey = getCargoStatusKey(currentState);
        const payKey = getPaymentKey(currentStateBill);
        const last = lastByNumber.get(number);

        const eventsToSend: CargoEvent[] = [];
        if (!last) {
          if (stateKey === "accepted") eventsToSend.push("accepted");
          if (hasBillData(item)) eventsToSend.push("bill_created");
          if (payKey === "paid") eventsToSend.push("bill_paid");
        } else {
          const prevStateKey = getCargoStatusKey(last.state ?? undefined);
          if (stateKey && stateKey !== prevStateKey) {
            if (stateKey === "accepted") eventsToSend.push("accepted");
            if (stateKey === "in_transit") eventsToSend.push("in_transit");
            if (stateKey === "delivered") eventsToSend.push("delivered");
          }
          const prevPayKey = getPaymentKey(last.state_bill ?? undefined);
          if (prevPayKey === "unknown" && hasBillData(item)) eventsToSend.push("bill_created");
          if (payKey === "paid" && prevPayKey !== "paid") eventsToSend.push("bill_paid");
        }

        for (const event of eventsToSend) {
          const text = formatTelegramMessage(event, number, item);
          const title = "HAULZ";
          let docButton: Record<string, unknown> | undefined;
          if (event === "accepted") {
            const erUrl = `${appDomain}/api/doc-short?metod=${encodeURIComponent("ЭР")}&number=${encodeURIComponent(number)}`;
            docButton = { inline_keyboard: [[{ text: "Получить ЭР", url: erUrl }]] };
          } else if (event === "bill_created") {
            const billUrl = `${appDomain}/api/doc-short?metod=${encodeURIComponent("СЧЕТ")}&number=${encodeURIComponent(number)}`;
            docButton = { inline_keyboard: [[{ text: "Получить счет", url: billUrl }]] };
          } else if (event === "delivered") {
            const appUrl = `${appDomain}/api/doc-short?metod=${encodeURIComponent("АПП")}&number=${encodeURIComponent(number)}`;
            docButton = { inline_keyboard: [[{ text: "Получить АПП", url: appUrl }]] };
          } else if (event === "bill_paid") {
            const updUrl = `${appDomain}/api/doc-short?metod=${encodeURIComponent("УПД")}&number=${encodeURIComponent(number)}`;
            docButton = { inline_keyboard: [[{ text: "Скачать УПД", url: updUrl }]] };
          }
          for (const sub of subscribers) {
            if (sub.prefsTelegram[event] && sub.telegramChatId) {
              const sendResult = await sendTelegramMessage(sub.telegramChatId, text, docButton);
              notificationsSent += 1;
              await pool.query(
                `insert into notification_deliveries (poll_run_id, login, inn, cargo_number, event, channel, telegram_chat_id, success, error_message)
                 values ($1, $2, $3, $4, $5, 'telegram', $6, $7, $8)`,
                [runId, sub.login, inn, number, event, sub.telegramChatId, sendResult.ok, sendResult.error || null]
              );
              if (!sendResult.ok) status = "partial";
            }
            if (sub.prefsWeb[event]) {
              const sendResult = await sendWebPushToLogin(sub.login, title, text);
              notificationsSent += 1;
              await pool.query(
                `insert into notification_deliveries (poll_run_id, login, inn, cargo_number, event, channel, telegram_chat_id, success, error_message)
                 values ($1, $2, $3, $4, $5, 'web', null, $6, $7)`,
                [runId, sub.login, inn, number, event, sendResult.ok, sendResult.error || null]
              );
              if (!sendResult.ok) status = "partial";
            }
          }
        }

        await pool.query(
          `insert into cargo_last_state (inn, cargo_number, state, state_bill, updated_at)
           values ($1, $2, $3, $4, now())
           on conflict (inn, cargo_number) do update set state = excluded.state, state_bill = excluded.state_bill, updated_at = now()`,
          [inn, number, currentState, currentStateBill]
        );
      }
    }

    await pool.query(
      `update notification_poll_runs set finished_at = now(), status = $1, inns_polled = $2, notifications_sent = $3, error_message = $4 where id = $5`,
      [status, innsPolled, notificationsSent, errorMessage, runId]
    );

    return res.status(200).json({
      ok: true,
      runId,
      status,
      innsPolled,
      notificationsSent,
      error: errorMessage || undefined,
    });
  } catch (e: any) {
    errorMessage = e?.message || String(e);
    await pool
      .query(
        `update notification_poll_runs set finished_at = now(), status = 'error', error_message = $1 where id = $2`,
        [errorMessage, runId]
      )
      .catch(() => {});
    console.error("notification-poll error:", e);
    return res.status(500).json({
      ok: false,
      runId,
      error: errorMessage,
    });
  }
}

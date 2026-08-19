import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { getRedisValue } from "./redis.js";
import { sendWebPushToLogin } from "./_lib/webpushDelivery.js";
import { sendFcmToLogin } from "./_lib/fcmDelivery.js";
import { initRequestContext, logError } from "./_lib/observability.js";
import { getPublicApiOrigin } from "../lib/publicApiOrigin.js";
import {
  type CargoEvent,
  type CargoStageEventId,
  CARGO_STAGE_EVENT_IDS,
  getCargoStageEventsOnStateChange,
  getPaymentKey,
  fetchPerevozkiByInn,
  hasBillSignal,
  isCargoStageNotificationEnabled,
  isRecentNotificationItem,
} from "../lib/notificationPoll.js";
import { loadPushLoginScopes, normalizeNotificationInn } from "../lib/notificationInnScope.js";
import { wasSuccessfulNotificationDelivery } from "./_lib/notificationDeliveryDedupe.js";
import {
  isPushEventAllowedForInn,
  listLoginsWithFcmTokens,
  loadPushActivationByLogins,
} from "../lib/pushControl.js";
import {
  loadCargoCustomerInnByNumbers,
  notificationCargoBelongsToInn,
  resolveNotificationCargoOwnerInn,
} from "../lib/notificationCargoOwnerInn.js";
import { loadPushNotificationTemplates, formatPushNotificationMessage } from "../lib/pushNotificationTemplates.js";

const CRON_SECRET = process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET;
const TG_BOT_TOKEN = process.env.HAULZ_TELEGRAM_BOT_TOKEN || process.env.TG_BOT_TOKEN;
const POLL_SERVICE_LOGIN = process.env.POLL_SERVICE_LOGIN;
const POLL_SERVICE_PASSWORD = process.env.POLL_SERVICE_PASSWORD;

const NOTIFICATION_EVENTS: CargoEvent[] = [...CARGO_STAGE_EVENT_IDS, "bill_created", "bill_paid"];

function isOptInNotificationEventEnabled(prefs: Record<string, boolean>, event: CargoEvent): boolean {
  if (event === "bill_created" || event === "bill_paid") return prefs[event] === true;
  return isCargoStageNotificationEnabled(prefs, event as CargoStageEventId);
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
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (!res.ok || !data?.ok) return { ok: false, error: data?.description || String(res.status) };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "notification-poll");
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "POST, GET");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const auth =
    (req.headers.authorization && req.headers.authorization.replace(/^Bearer\s+/i, "")) ||
    (req.query?.secret as string) ||
    "";
  if (!CRON_SECRET || auth !== CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized", request_id: ctx.requestId });
  }

  let pool: Awaited<ReturnType<typeof getPool>>;
  try {
    pool = getPool();
  } catch {
    return res.status(503).json({ error: "Database not configured", request_id: ctx.requestId });
  }

  if (!POLL_SERVICE_LOGIN || !POLL_SERVICE_PASSWORD) {
    return res.status(503).json({
      error: "POLL_SERVICE_LOGIN and POLL_SERVICE_PASSWORD required for notification poll",
      request_id: ctx.requestId,
    });
  }

  const runResult = await pool.query<{ id: string }>(
    `insert into notification_poll_runs (status, inns_polled, notifications_sent) values ('running', 0, 0) returning id`
  );
  const runId = runResult.rows[0]?.id;
  if (!runId) {
    return res.status(500).json({ error: "Failed to create poll run", request_id: ctx.requestId });
  }

  let status: "ok" | "partial" | "error" = "ok";
  let errorMessage: string | null = null;
  let innsPolled = 0;
  let notificationsSent = 0;
  const appDomain = getPublicApiOrigin();

  try {
    const scopes = await loadPushLoginScopes(pool);
    const pushTemplates = await loadPushNotificationTemplates(pool);
    const loginInnPairs: Array<{ login: string; inn: string }> = [];
    for (const scope of scopes.values()) {
      for (const inn of scope.inns) {
        loginInnPairs.push({ login: scope.login, inn });
      }
    }
    const prefsByLogin = new Map<
      string,
      { telegram: Record<string, boolean>; web: Record<string, boolean>; push: Record<string, boolean> }
    >();

    const loginKeys = [...new Set(loginInnPairs.map((r) => String(r.login || "").trim().toLowerCase()).filter(Boolean))];
    const prefsStateLoaded = new Set<string>();
    try {
      const stateRows = await pool.query<{ login: string; preferences: any }>(
        `SELECT login, preferences
         FROM notification_preferences_state
         WHERE login = ANY($1::text[])`,
        [loginKeys]
      );
      for (const row of stateRows.rows) {
        const key = String(row.login || "").trim().toLowerCase();
        if (!key) continue;
        const raw = row.preferences || {};
        const telegram = raw?.telegram && typeof raw.telegram === "object" ? raw.telegram : {};
        const webpush = raw?.webpush && typeof raw.webpush === "object" ? raw.webpush : {};
        const push = raw?.push && typeof raw.push === "object" ? raw.push : {};
        const p = { telegram: {} as Record<string, boolean>, web: {} as Record<string, boolean>, push: {} as Record<string, boolean> };
        for (const ev of NOTIFICATION_EVENTS) {
          p.telegram[ev] = !!telegram[ev];
          p.web[ev] = !!webpush[ev];
          p.push[ev] = !!push[ev];
        }
        prefsByLogin.set(key, p);
        prefsStateLoaded.add(key);
      }
    } catch {
      // Fallback to legacy table below.
    }

    const missingLogins = loginKeys.filter((k) => !prefsStateLoaded.has(k));
    if (missingLogins.length > 0) {
      const prefsResult = await pool.query<{ login: string; channel: string; event_id: string }>(
        "SELECT login, channel, event_id FROM notification_preferences WHERE enabled = true AND login = ANY($1::text[])",
        [missingLogins]
      );
      for (const r of prefsResult.rows) {
        const key = String(r.login || "").trim().toLowerCase();
        let p = prefsByLogin.get(key);
        if (!p) {
          p = { telegram: {}, web: {}, push: {} };
          prefsByLogin.set(key, p);
        }
        const ch =
          r.channel === "telegram" ? "telegram" : r.channel === "push" ? "push" : "web";
        if (NOTIFICATION_EVENTS.includes(r.event_id as CargoEvent)) {
          p[ch][r.event_id] = true;
        }
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
        logError(ctx, "notification_poll_tg_links_query_failed", e);
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
        prefsPush: Record<string, boolean>;
        pushActivation: Record<string, boolean> | null;
        hasFcmToken: boolean;
      }>
    >();
    const loginsWithToken = await listLoginsWithFcmTokens(pool, uniqueLogins);
    const activationByLogin = await loadPushActivationByLogins(pool, uniqueLogins);
    for (const { login, inn } of loginInnPairs) {
      const key = login.toLowerCase();
      const prefs = prefsByLogin.get(key) || { telegram: {}, web: {}, push: {} };
      const innKey = normalizeNotificationInn(inn);
      if (!innKey) continue;
      const activation = activationByLogin.get(key)?.get(innKey) || null;
      const hasFcmToken = loginsWithToken.has(key);
      const pushWanted = NOTIFICATION_EVENTS.some((ev) =>
        isPushEventAllowedForInn({ activation, prefs: prefs.push, eventId: ev }),
      );
      const hasAny =
        NOTIFICATION_EVENTS.some((ev) => prefs.telegram[ev]) ||
        NOTIFICATION_EVENTS.some((ev) => prefs.web[ev]) ||
        (hasFcmToken && pushWanted);
      if (!hasAny) continue;
      const telegramChatId = chatIdByLogin.get(key) || null;
      const list = subscribersByInn.get(innKey) || [];
      list.push({
        login: key,
        telegramChatId,
        prefsTelegram: prefs.telegram,
        prefsWeb: prefs.web,
        prefsPush: prefs.push,
        pushActivation: activation,
        hasFcmToken,
      });
      subscribersByInn.set(innKey, list);
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
        logError(ctx, "notification_poll_fetch_perevozki_failed", e, { inn });
        status = "partial";
        if (!errorMessage) errorMessage = `Fetch INN ${inn}: ${e?.message || e}`;
        continue;
      }

      if (items.length === 0) continue;

      const cargoNumbers = items.map((i: any) => String(i?.Number ?? i?.number ?? "").trim()).filter(Boolean);
      const ownerInnByCargo = await loadCargoCustomerInnByNumbers(pool, cargoNumbers);
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
        if (!notificationCargoBelongsToInn(item, inn, ownerInnByCargo)) {
          continue;
        }
        const ownerInn = resolveNotificationCargoOwnerInn(item, ownerInnByCargo) || inn;
        const currentState = item?.State ?? null;
        const currentStateBill = item?.StateBill ?? null;
        const payKey = getPaymentKey(currentStateBill);
        const last = lastByNumber.get(number);
        const isFirstSeen = !last;
        const notifyFirstSeen = isRecentNotificationItem(item);

        const eventsToSend: CargoEvent[] = [
          ...getCargoStageEventsOnStateChange(last?.state, currentState, isFirstSeen, { notifyFirstSeen }),
        ];
        if (hasBillSignal(item) && (!isFirstSeen || notifyFirstSeen)) {
          const prevPayKey = isFirstSeen ? "unknown" : getPaymentKey(last?.state_bill ?? undefined);
          if (prevPayKey === "unknown") eventsToSend.push("bill_created");
          if (payKey === "paid" && prevPayKey !== "paid") eventsToSend.push("bill_paid");
        }

        for (const event of eventsToSend) {
          const message = formatPushNotificationMessage(event, number, item, pushTemplates);
          const text = message.body;
          const title = message.title;
          let docButton: Record<string, unknown> | undefined;
          if (event === "info_received" || event === "received_at_warehouse") {
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
            if (isOptInNotificationEventEnabled(sub.prefsTelegram, event) && sub.telegramChatId) {
                if (
                !(await wasSuccessfulNotificationDelivery(pool, {
                  login: sub.login,
                  inn: ownerInn,
                  cargoNumber: number,
                  event,
                  channel: "telegram",
                }))
              ) {
                const sendResult = await sendTelegramMessage(sub.telegramChatId, text, docButton);
                notificationsSent += 1;
                await pool.query(
                  `insert into notification_deliveries (poll_run_id, login, inn, cargo_number, event, channel, telegram_chat_id, success, error_message)
                   values ($1, $2, $3, $4, $5, 'telegram', $6, $7, $8)`,
                  [runId, sub.login, ownerInn, number, event, sub.telegramChatId, sendResult.ok, sendResult.error || null]
                );
                if (!sendResult.ok) status = "partial";
              }
            }
            if (isOptInNotificationEventEnabled(sub.prefsWeb, event)) {
              if (
                !(await wasSuccessfulNotificationDelivery(pool, {
                  login: sub.login,
                  inn: ownerInn,
                  cargoNumber: number,
                  event,
                  channel: "web",
                }))
              ) {
                const sendResult = await sendWebPushToLogin(sub.login, { title, body: text, url: "/" });
                notificationsSent += 1;
                await pool.query(
                  `insert into notification_deliveries (poll_run_id, login, inn, cargo_number, event, channel, telegram_chat_id, success, error_message)
                   values ($1, $2, $3, $4, $5, 'web', null, $6, $7)`,
                  [runId, sub.login, ownerInn, number, event, sendResult.ok, sendResult.error || null]
                );
                if (!sendResult.ok) status = "partial";
              }
            }
            if (
              sub.hasFcmToken &&
              isPushEventAllowedForInn({
                activation: sub.pushActivation,
                prefs: sub.prefsPush,
                eventId: event,
              })
            ) {
              if (
                !(await wasSuccessfulNotificationDelivery(pool, {
                  login: sub.login,
                  inn: ownerInn,
                  cargoNumber: number,
                  event,
                  channel: "push",
                }))
              ) {
                const sendResult = await sendFcmToLogin(sub.login, {
                  title,
                  body: text,
                  url: "/",
                  delivery: { event, inn: ownerInn, cargoNumber: number, title, body: text },
                });
                notificationsSent += 1;
                if (!sendResult.ok) status = "partial";
              }
            }
          }
        }

        await pool.query(
          `insert into cargo_last_state (inn, cargo_number, state, state_bill, updated_at)
           values ($1, $2, $3, $4, now())
           on conflict (inn, cargo_number) do update set state = excluded.state, state_bill = excluded.state_bill, updated_at = now()`,
          [ownerInn, number, currentState, currentStateBill]
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
      request_id: ctx.requestId,
    });
  } catch (e: any) {
    errorMessage = e?.message || String(e);
    await pool
      .query(
        `update notification_poll_runs set finished_at = now(), status = 'error', error_message = $1 where id = $2`,
        [errorMessage, runId]
      )
      .catch(() => {});
    logError(ctx, "notification_poll_failed", e);
    return res.status(500).json({
      ok: false,
      runId,
      error: errorMessage,
      request_id: ctx.requestId,
    });
  }
}

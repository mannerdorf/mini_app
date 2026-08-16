import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { sendFcmToLogin } from "./_lib/fcmDelivery.js";
import { initRequestContext, logError } from "./_lib/observability.js";
import {
  computeDailySummaryStats,
  formatDailySummaryPlainText,
  loadDailySummaryPrefsByLogin,
  loadLoginInns,
  loadTelegramChatIds,
  sendDailySummaryEmail,
} from "../lib/notificationDailySummary.js";

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
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (!res.ok || !data?.ok) return { ok: false, error: data?.description || String(res.status) };
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: (e as { message?: string })?.message || String(e) };
  }
}

async function logDelivery(
  pool: Awaited<ReturnType<typeof getPool>>,
  params: {
    login: string;
    inn: string;
    channel: "telegram" | "push" | "email";
    success: boolean;
    error?: string | null;
    telegramChatId?: string | null;
  },
) {
  try {
    await pool.query(
      `INSERT INTO notification_deliveries (
         poll_run_id, login, inn, cargo_number, event, channel, telegram_chat_id, success, error_message
       ) VALUES (NULL, $1, $2, '', 'daily_summary', $3, $4, $5, $6)`,
      [params.login, params.inn, params.channel, params.telegramChatId || null, params.success, params.error || null],
    );
  } catch {
    // best-effort
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "notification-daily-summary");
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

  if (!POLL_SERVICE_LOGIN || !POLL_SERVICE_PASSWORD) {
    return res.status(503).json({
      error: "POLL_SERVICE_LOGIN and POLL_SERVICE_PASSWORD are required",
      request_id: ctx.requestId,
    });
  }

  let pool: Awaited<ReturnType<typeof getPool>>;
  try {
    pool = getPool();
  } catch {
    return res.status(503).json({ error: "Database not configured", request_id: ctx.requestId });
  }

  try {
    const loginInns = await loadLoginInns(pool);
    if (loginInns.size === 0) {
      return res.status(200).json({ ok: true, sent: 0, reason: "no logins with INN", request_id: ctx.requestId });
    }

    const logins = [...loginInns.keys()];
    const prefsByLogin = await loadDailySummaryPrefsByLogin(pool, logins);
    const chatIds = await loadTelegramChatIds(pool, logins);

    let sentTelegram = 0;
    let sentPush = 0;
    let sentEmail = 0;
    let skippedByPrefs = 0;
    const errors: Array<{ login: string; channel: string; error: string }> = [];

    for (const login of logins) {
      const prefs = prefsByLogin.get(login) || { telegram: true, push: false, email: false };
      const wantsAny = prefs.telegram || prefs.push || prefs.email;
      if (!wantsAny) {
        skippedByPrefs += 1;
        continue;
      }

      const inns = loginInns.get(login);
      if (!inns || inns.size === 0) continue;
      const primaryInn = [...inns][0] || "";

      const { stats, errors: computeErrors } = await computeDailySummaryStats(
        inns,
        POLL_SERVICE_LOGIN,
        POLL_SERVICE_PASSWORD,
      );
      for (const err of computeErrors) {
        errors.push({ login, channel: "compute", error: err });
      }

      const text = formatDailySummaryPlainText(stats);

      if (prefs.telegram) {
        const chatId = chatIds.get(login);
        if (!chatId) {
          errors.push({ login, channel: "telegram", error: "no active telegram link" });
        } else {
          const sendRes = await sendTelegramMessage(chatId, text);
          await logDelivery(pool, {
            login,
            inn: primaryInn,
            channel: "telegram",
            success: sendRes.ok,
            error: sendRes.error || null,
            telegramChatId: chatId,
          });
          if (sendRes.ok) sentTelegram += 1;
          else errors.push({ login, channel: "telegram", error: sendRes.error || "send failed" });
        }
      }

      if (prefs.push) {
        const sendResult = await sendFcmToLogin(login, {
          title: "HAULZ: ежедневная сводка",
          body: text,
          url: "/",
        });
        await logDelivery(pool, {
          login,
          inn: primaryInn,
          channel: "push",
          success: sendResult.ok && sendResult.sent > 0,
          error: sendResult.error || (sendResult.sent > 0 ? null : "no active FCM tokens"),
        });
        if (sendResult.ok && sendResult.sent > 0) sentPush += 1;
        else errors.push({ login, channel: "push", error: sendResult.error || "no active FCM tokens" });
      }

      if (prefs.email) {
        const emailRes = await sendDailySummaryEmail(pool, { login, inn: primaryInn });
        await logDelivery(pool, {
          login,
          inn: primaryInn,
          channel: "email",
          success: emailRes.ok,
          error: emailRes.error || null,
        });
        if (emailRes.ok) sentEmail += 1;
        else if (emailRes.error && emailRes.error !== "already sent today") {
          errors.push({ login, channel: "email", error: emailRes.error });
        }
      }
    }

    return res.status(200).json({
      ok: true,
      sent_telegram: sentTelegram,
      sent_push: sentPush,
      sent_email: sentEmail,
      skipped_by_preferences: skippedByPrefs,
      errors_count: errors.length,
      errors: errors.slice(0, 30),
      request_id: ctx.requestId,
    });
  } catch (e: unknown) {
    logError(ctx, "notification_daily_summary_failed", e);
    return res.status(500).json({
      ok: false,
      error: (e as { message?: string })?.message || String(e),
      request_id: ctx.requestId,
    });
  }
}

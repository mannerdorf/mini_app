import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRedisValue, setRedisValue, deleteRedisValue } from "./redis.js";
import { initRequestContext } from "./_lib/observability.js";

const TG_BOT_TOKEN = process.env.HAULZ_TELEGRAM_BOT_TOKEN || process.env.TG_BOT_TOKEN;
const CODE_TTL_SECONDS = 60 * 5; // 5 minutes

async function sendTelegramMessage(chatId: string, text: string): Promise<boolean> {
  if (!TG_BOT_TOKEN) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "2fa-telegram");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  if (!TG_BOT_TOKEN) {
    return res.status(500).json({ error: "TG_BOT_TOKEN not configured", request_id: ctx.requestId });
  }

  let body: any = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON body", request_id: ctx.requestId });
    }
  }

  const loginRaw = String(body?.login || "").trim();
  const login = loginRaw.toLowerCase();
  const action = String(body?.action || "").trim();
  if (!login) {
    return res.status(400).json({ error: "login is required", request_id: ctx.requestId });
  }

  if (action === "send") {
    const chatId =
      (await getRedisValue(`tg:by_login:${login}`)) ||
      (loginRaw && loginRaw !== login ? await getRedisValue(`tg:by_login:${loginRaw}`) : null);
    if (!chatId) {
      return res.status(400).json({ error: "Telegram is not linked for this login", request_id: ctx.requestId });
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const saved = await setRedisValue(`2fa:code:${login}`, code, CODE_TTL_SECONDS);
    if (!saved) {
      return res.status(500).json({ error: "Failed to store code", request_id: ctx.requestId });
    }
    const sent = await sendTelegramMessage(chatId, `Код подтверждения: ${code}`);
    if (!sent) {
      return res.status(500).json({ error: "Failed to send Telegram message", request_id: ctx.requestId });
    }
    return res.status(200).json({ ok: true, request_id: ctx.requestId });
  }

  if (action === "verify") {
    const code = String(body?.code || "").trim();
    if (!code) {
      return res.status(400).json({ error: "code is required", request_id: ctx.requestId });
    }
    const stored = await getRedisValue(`2fa:code:${login}`);
    if (!stored || stored !== code) {
      return res.status(400).json({ error: "invalid code", request_id: ctx.requestId });
    }
    await deleteRedisValue(`2fa:code:${login}`);
    return res.status(200).json({ ok: true, request_id: ctx.requestId });
  }

  if (action === "unlink") {
    await deleteRedisValue(`tg:by_login:${login}`);
    if (loginRaw && loginRaw !== login) {
      await deleteRedisValue(`tg:by_login:${loginRaw}`);
    }
    await deleteRedisValue(`2fa:code:${login}`);
    const settingsRaw = await getRedisValue(`2fa:login:${login}`);
    let settings: any = {};
    try {
      settings = settingsRaw ? JSON.parse(settingsRaw) : {};
    } catch {
      settings = {};
    }
    const payload = JSON.stringify({
      enabled: false,
      method: settings?.method === "google" ? "google" : "google",
      telegramLinked: false,
    });
    await setRedisValue(`2fa:login:${login}`, payload);
    return res.status(200).json({ ok: true, request_id: ctx.requestId });
  }

  return res.status(400).json({ error: "invalid action", request_id: ctx.requestId });
}

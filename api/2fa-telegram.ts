import type { VercelRequest, VercelResponse } from "@vercel/node";

const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
const CODE_TTL_SECONDS = 60 * 5; // 5 minutes

async function getRedisValue(key: string): Promise<string | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    const response = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([["GET", key]]),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const firstResult = Array.isArray(data) ? data[0] : data;
    if (firstResult?.error) return null;
    const value = firstResult?.result;
    if (value === null || value === undefined) return null;
    return String(value);
  } catch {
    return null;
  }
}

async function setRedisValue(key: string, value: string, ttlSeconds: number): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return false;

  try {
    const response = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["SET", key, value],
        ["EXPIRE", key, ttlSeconds],
      ]),
    });
    if (!response.ok) return false;
    const data = await response.json();
    const firstResult = Array.isArray(data) ? data[0] : data;
    return firstResult?.result === "OK" || firstResult?.result === true;
  } catch {
    return false;
  }
}

async function deleteRedisValue(key: string): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return false;

  try {
    const response = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([["DEL", key]]),
    });
    if (!response.ok) return false;
    const data = await response.json();
    const firstResult = Array.isArray(data) ? data[0] : data;
    return typeof firstResult?.result === "number" ? firstResult.result > 0 : false;
  } catch {
    return false;
  }
}

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
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!TG_BOT_TOKEN) {
    return res.status(500).json({ error: "TG_BOT_TOKEN not configured" });
  }

  let body: any = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON body" });
    }
  }

  const login = String(body?.login || "").trim();
  const action = String(body?.action || "").trim();
  if (!login) {
    return res.status(400).json({ error: "login is required" });
  }

  const chatId = await getRedisValue(`tg:by_login:${login}`);
  if (!chatId) {
    return res.status(400).json({ error: "Telegram is not linked for this login" });
  }

  if (action === "send") {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const saved = await setRedisValue(`2fa:code:${login}`, code, CODE_TTL_SECONDS);
    if (!saved) {
      return res.status(500).json({ error: "Failed to store code" });
    }
    const sent = await sendTelegramMessage(chatId, `Код подтверждения: ${code}`);
    if (!sent) {
      return res.status(500).json({ error: "Failed to send Telegram message" });
    }
    return res.status(200).json({ ok: true });
  }

  if (action === "verify") {
    const code = String(body?.code || "").trim();
    if (!code) {
      return res.status(400).json({ error: "code is required" });
    }
    const stored = await getRedisValue(`2fa:code:${login}`);
    if (!stored || stored !== code) {
      return res.status(400).json({ error: "invalid code" });
    }
    await deleteRedisValue(`2fa:code:${login}`);
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: "invalid action" });
}

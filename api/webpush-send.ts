import type { VercelRequest, VercelResponse } from "@vercel/node";
import webpush from "web-push";

async function getRedisValue(key: string): Promise<string | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const response = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify([["GET", key]]),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const firstResult = Array.isArray(data) ? data[0] : data;
    if (firstResult?.error) return null;
    const value = firstResult?.result;
    if (value == null) return null;
    return String(value);
  } catch {
    return null;
  }
}

/** POST: отправить Web Push одному или нескольким пользователям. Body: { logins: string[], title, body?, url? } */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    return res.status(503).json({ error: "Web Push not configured (VAPID keys)" });
  }

  let body: any = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON body" });
    }
  }

  const logins = Array.isArray(body?.logins) ? body.logins : body?.login ? [body.login] : [];
  const title = String(body?.title || "HAULZ");
  const bodyText = String(body?.body || "");
  const url = String(body?.url || "/").trim() || "/";

  if (logins.length === 0) {
    return res.status(400).json({ error: "logins or login is required" });
  }

  webpush.setVapidDetails("mailto:support@haulz.ru", publicKey, privateKey);

  const payload = JSON.stringify({ title, body: bodyText, url });
  const results: { login: string; sent: number; failed: number }[] = [];

  for (const login of logins) {
    const key = `webpush:subs:${String(login).trim().toLowerCase()}`;
    const raw = await getRedisValue(key);
    let list: any[] = [];
    try {
      list = raw ? JSON.parse(raw) : [];
    } catch {
      list = [];
    }
    if (!Array.isArray(list)) list = [];

    let sent = 0;
    let failed = 0;
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
      } catch {
        failed += 1;
      }
    }
    results.push({ login: String(login), sent, failed });
  }

  return res.status(200).json({ ok: true, results });
}

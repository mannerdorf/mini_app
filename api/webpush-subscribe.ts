import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRedisValue, setRedisValue } from "./redis";

const REDIS_TTL = 60 * 60 * 24 * 365; // 1 year

/** POST: сохранить подписку Web Push для login. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body: any = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON body" });
    }
  }

  const login = String(body?.login || "").trim().toLowerCase();
  const subscription = body?.subscription;
  if (!login || !subscription || typeof subscription !== "object") {
    return res.status(400).json({ error: "login and subscription are required" });
  }

  const endpoint = subscription?.endpoint;
  if (!endpoint || typeof endpoint !== "string") {
    return res.status(400).json({ error: "subscription.endpoint is required" });
  }

  const key = `webpush:subs:${login}`;
  const raw = await getRedisValue(key);
  let list: any[] = [];
  try {
    list = raw ? JSON.parse(raw) : [];
  } catch {
    list = [];
  }
  if (!Array.isArray(list)) list = [];

  const existing = list.findIndex((s: any) => s?.endpoint === endpoint);
  const subRecord = {
    endpoint: subscription.endpoint,
    keys: subscription.keys,
    expirationTime: subscription.expirationTime ?? null,
  };
  if (existing >= 0) list[existing] = subRecord;
  else list.push(subRecord);

  const saved = await setRedisValue(key, JSON.stringify(list), REDIS_TTL);
  if (!saved) return res.status(500).json({ error: "Failed to save subscription" });

  return res.status(200).json({ ok: true });
}

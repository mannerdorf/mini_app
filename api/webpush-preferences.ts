import type { VercelRequest, VercelResponse } from "@vercel/node";

const REDIS_TTL = 60 * 60 * 24 * 365; // 1 year

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

async function setRedisValue(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return false;
  try {
    const pipeline = ttlSeconds ? [["SET", key, value], ["EXPIRE", key, ttlSeconds]] : [["SET", key, value]];
    const response = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(pipeline),
    });
    if (!response.ok) return false;
    const data = await response.json();
    const firstResult = Array.isArray(data) ? data[0] : data;
    return firstResult?.result === "OK" || firstResult?.result === true;
  } catch {
    return false;
  }
}

const DEFAULT_PREFS = {
  telegram: {} as Record<string, boolean>,
  webpush: {} as Record<string, boolean>,
};

/** GET ?login= — вернуть настройки уведомлений. POST { login, preferences } — сохранить. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (req.method === "GET") {
    const login = String(req.query?.login || "").trim().toLowerCase();
    if (!login) return res.status(400).json({ error: "login is required" });

    const key = `notif_prefs:${login}`;
    const raw = await getRedisValue(key);
    let prefs = DEFAULT_PREFS;
    try {
      if (raw) prefs = { ...DEFAULT_PREFS, ...JSON.parse(raw) };
    } catch {
      // keep default
    }
    return res.status(200).json(prefs);
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
  const preferences = body?.preferences;
  if (!login) return res.status(400).json({ error: "login is required" });
  if (!preferences || typeof preferences !== "object") {
    return res.status(400).json({ error: "preferences object is required" });
  }

  const key = `notif_prefs:${login}`;
  const raw = await getRedisValue(key);
  let current: typeof DEFAULT_PREFS = DEFAULT_PREFS;
  try {
    if (raw) current = { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    // keep default
  }

  if (preferences.telegram && typeof preferences.telegram === "object") {
    current.telegram = { ...current.telegram, ...preferences.telegram };
  }
  if (preferences.webpush && typeof preferences.webpush === "object") {
    current.webpush = { ...current.webpush, ...preferences.webpush };
  }

  const saved = await setRedisValue(key, JSON.stringify(current), REDIS_TTL);
  if (!saved) return res.status(500).json({ error: "Failed to save preferences" });

  return res.status(200).json({ ok: true, preferences: current });
}

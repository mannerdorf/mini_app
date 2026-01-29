import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRedisValue, setRedisValue } from "./redis";

const REDIS_TTL = 60 * 60 * 24 * 365; // 1 year

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

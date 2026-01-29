import type { VercelRequest, VercelResponse } from "@vercel/node";

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
    if (value === null || value === undefined) return null;
    return String(value);
  } catch {
    return null;
  }
}

async function delRedisKeys(keys: string[]): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token || keys.length === 0) return false;
  try {
    const pipeline = keys.map((k) => ["DEL", k] as [string, string]);
    const response = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(pipeline),
    });
    if (!response.ok) return false;
    return true;
  } catch {
    return false;
  }
}

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

  const login = typeof body?.login === "string" ? body.login.trim().toLowerCase() : "";
  if (!login) {
    return res.status(400).json({ error: "login is required" });
  }

  const userId = await getRedisValue(`alice:login:${login}`);
  if (!userId) {
    return res.status(200).json({ ok: true, message: "Привязка к Алисе не найдена или уже отключена." });
  }

  const deleted = await delRedisKeys([`alice:bind:${userId}`, `alice:login:${login}`]);
  return res.status(200).json({ ok: true, unlinked: deleted });
}

import type { VercelRequest, VercelResponse } from "@vercel/node";

const CODE_TTL_SECONDS = 60 * 10; // 10 minutes

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

  const login = String(body?.login || "").trim();
  const password = String(body?.password || "").trim();
  const customer = body?.customer ? String(body.customer) : null;
  if (!login || !password) {
    return res.status(400).json({ error: "login and password are required" });
  }

  let code = "";
  for (let i = 0; i < 5; i += 1) {
    code = String(Math.floor(100000 + Math.random() * 900000));
    const saved = await setRedisValue(
      `alice:link:${code}`,
      JSON.stringify({ login, password, customer, createdAt: Date.now() }),
      CODE_TTL_SECONDS
    );
    if (saved) {
      return res.status(200).json({ ok: true, code, ttl: CODE_TTL_SECONDS });
    }
  }

  return res.status(500).json({ error: "Failed to generate code" });
}

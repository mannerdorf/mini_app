import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";

const TOKEN_TTL_SECONDS = 60 * 60 * 24; // 24 hours

async function setRedis(key: string, value: string, ttl: number) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.warn("[max-link] Upstash Redis not configured");
    return false;
  }

  try {
    const response = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["SET", key, value],
        ["EXPIRE", key, ttl],
      ]),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("[max-link] Redis set error:", response.status, text);
      return false;
    }

    const data = await response.json();
    const firstResult = Array.isArray(data) ? data[0] : data;
    return firstResult?.result === "OK" || firstResult?.result === true;
  } catch (error) {
    console.error("[max-link] Redis set exception:", error);
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    let body: any = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: "Invalid JSON body" });
      }
    }

    const { login, password, customer, accountId } = body || {};
    if (!login || !password) {
      return res.status(400).json({ error: "login and password are required" });
    }

    const token = crypto.randomBytes(16).toString("hex");
    const redisKey = `max:link:${token}`;
    const payload = JSON.stringify({
      login,
      password,
      customer: customer || null,
      accountId: accountId || null,
      createdAt: Date.now(),
    });

    const saved = await setRedis(redisKey, payload, TOKEN_TTL_SECONDS);
    if (!saved) {
      return res.status(500).json({ error: "Failed to store token" });
    }

    return res.status(200).json({ token, ttl: TOKEN_TTL_SECONDS });
  } catch (error: any) {
    console.error("[max-link] error:", error);
    return res.status(500).json({ error: "Failed to create token", message: error?.message || String(error) });
  }
}

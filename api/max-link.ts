import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";
import { initRequestContext, logError } from "./_lib/observability.js";

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
  const ctx = initRequestContext(req, res, "max-link");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  try {
    let body: any = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: "Invalid JSON body", request_id: ctx.requestId });
      }
    }

    const { login, password, customer, inn, accountId } = body || {};
    if (!login || !password) {
      return res.status(400).json({ error: "login and password are required", request_id: ctx.requestId });
    }

    const token = crypto.randomBytes(16).toString("hex");
    const redisKey = `max:link:${token}`;
    const payload = JSON.stringify({
      login,
      password,
      customer: customer || null,
      inn: inn || null,
      accountId: accountId || null,
      createdAt: Date.now(),
    });

    const saved = await setRedis(redisKey, payload, TOKEN_TTL_SECONDS);
    if (!saved) {
      return res.status(500).json({ error: "Failed to store token", request_id: ctx.requestId });
    }

    return res.status(200).json({ token, ttl: TOKEN_TTL_SECONDS, request_id: ctx.requestId });
  } catch (error: any) {
    logError(ctx, "max_link_failed", error);
    return res.status(500).json({ error: "Failed to create token", message: error?.message || String(error), request_id: ctx.requestId });
  }
}

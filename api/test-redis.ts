import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initRequestContext, logError } from "./_lib/observability.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "test-redis");
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return res.status(500).json({ 
      error: "Redis config missing", 
      url: !!url, 
      token: !!token,
      request_id: ctx.requestId,
    });
  }

  try {
    const testKey = "test_connection_" + Date.now();
    const setRes = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["SET", testKey, "ok"],
        ["GET", testKey],
        ["DEL", testKey]
      ]),
    });

    const data = await setRes.json();
    return res.status(200).json({ 
      ok: setRes.ok, 
      status: setRes.status,
      data,
      request_id: ctx.requestId,
    });
  } catch (e: any) {
    logError(ctx, "test_redis_failed", e);
    return res.status(500).json({ error: e.message, request_id: ctx.requestId });
  }
}

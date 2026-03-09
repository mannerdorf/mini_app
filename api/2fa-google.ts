import type { VercelRequest, VercelResponse } from "@vercel/node";
import { generateSecret, verify, generateURI } from "otplib";
import { getRedisValue, setRedisValue, deleteRedisValue } from "./redis.js";
import { initRequestContext } from "./_lib/observability.js";

const ISSUER = "HAULZ";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "2fa-google");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  let body: any = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON body", request_id: ctx.requestId });
    }
  }

  const loginRaw = String(body?.login || "").trim();
  const login = loginRaw.toLowerCase();
  const action = String(body?.action || "").trim();
  if (!login) {
    return res.status(400).json({ error: "login is required", request_id: ctx.requestId });
  }

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!redisUrl || !redisToken) {
    return res.status(500).json({ error: "Redis not configured", request_id: ctx.requestId });
  }

  const secretKey = `2fa:google_secret:${login}`;
  const secretKeyRaw = loginRaw !== login ? `2fa:google_secret:${loginRaw}` : null;

  if (action === "setup") {
    const secret = generateSecret();
    const label = loginRaw || login;
    const otpauthUrl = generateURI({ issuer: ISSUER, label, secret });
    const saved = await setRedisValue(secretKey, secret);
    if (secretKeyRaw) {
      await setRedisValue(secretKeyRaw, secret);
    }
    if (!saved) {
      return res.status(500).json({ error: "Failed to store secret", request_id: ctx.requestId });
    }
    return res.status(200).json({ ok: true, secret, otpauthUrl, request_id: ctx.requestId });
  }

  if (action === "verify") {
    const code = String(body?.code || "").trim();
    if (!code) {
      return res.status(400).json({ error: "code is required", request_id: ctx.requestId });
    }
    let secret = await getRedisValue(secretKey);
    if (!secret && secretKeyRaw) {
      secret = await getRedisValue(secretKeyRaw);
    }
    if (!secret) {
      return res.status(400).json({ error: "Google 2FA not set up for this login", request_id: ctx.requestId });
    }
    try {
      const result = await verify({ secret, token: code });
      if (!result?.valid) {
        return res.status(400).json({ error: "invalid code", request_id: ctx.requestId });
      }
      return res.status(200).json({ ok: true, request_id: ctx.requestId });
    } catch {
      return res.status(400).json({ error: "invalid code", request_id: ctx.requestId });
    }
  }

  if (action === "disable") {
    await deleteRedisValue(secretKey);
    if (secretKeyRaw) {
      await deleteRedisValue(secretKeyRaw);
    }
    return res.status(200).json({ ok: true, request_id: ctx.requestId });
  }

  return res.status(400).json({ error: "invalid action", request_id: ctx.requestId });
}

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { generateSecret, verify, generateURI } from "otplib";
import { getRedisValue, setRedisValue, deleteRedisValue } from "./redis";

const ISSUER = "HAULZ";

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

  const loginRaw = String(body?.login || "").trim();
  const login = loginRaw.toLowerCase();
  const action = String(body?.action || "").trim();
  if (!login) {
    return res.status(400).json({ error: "login is required" });
  }

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!redisUrl || !redisToken) {
    return res.status(500).json({ error: "Redis not configured" });
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
      return res.status(500).json({ error: "Failed to store secret" });
    }
    return res.status(200).json({ ok: true, secret, otpauthUrl });
  }

  if (action === "verify") {
    const code = String(body?.code || "").trim();
    if (!code) {
      return res.status(400).json({ error: "code is required" });
    }
    let secret = await getRedisValue(secretKey);
    if (!secret && secretKeyRaw) {
      secret = await getRedisValue(secretKeyRaw);
    }
    if (!secret) {
      return res.status(400).json({ error: "Google 2FA not set up for this login" });
    }
    try {
      const result = await verify({ secret, token: code });
      if (!result?.valid) {
        return res.status(400).json({ error: "invalid code" });
      }
      return res.status(200).json({ ok: true });
    } catch {
      return res.status(400).json({ error: "invalid code" });
    }
  }

  if (action === "disable") {
    await deleteRedisValue(secretKey);
    if (secretKeyRaw) {
      await deleteRedisValue(secretKeyRaw);
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: "invalid action" });
}

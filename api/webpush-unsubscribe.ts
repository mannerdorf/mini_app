import type { VercelRequest, VercelResponse } from "@vercel/node";
import { deleteRedisValue, getRedisValue, setRedisValue } from "./redis.js";
import { initRequestContext } from "./_lib/observability.js";

const REDIS_TTL = 60 * 60 * 24 * 365; // 1 year

/** POST: удалить подписку Web Push для login по endpoint. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "webpush-unsubscribe");
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

  const login = String(body?.login || "").trim().toLowerCase();
  const endpoint = String(body?.endpoint || "").trim();
  if (!login || !endpoint) {
    return res.status(400).json({ error: "login and endpoint are required", request_id: ctx.requestId });
  }

  const key = `webpush:subs:${login}`;
  const raw = await getRedisValue(key);
  let list: any[] = [];
  try {
    list = raw ? JSON.parse(raw) : [];
  } catch {
    list = [];
  }
  if (!Array.isArray(list) || list.length === 0) {
    return res.status(200).json({ ok: true, removed: 0, request_id: ctx.requestId });
  }
  const next = list.filter((sub: any) => String(sub?.endpoint || "").trim() !== endpoint);
  const removed = Math.max(0, list.length - next.length);
  if (next.length === 0) {
    await deleteRedisValue(key).catch(() => false);
    return res.status(200).json({ ok: true, removed, request_id: ctx.requestId });
  }
  const saved = await setRedisValue(key, JSON.stringify(next), REDIS_TTL);
  if (!saved) return res.status(500).json({ error: "Failed to update subscriptions", request_id: ctx.requestId });
  return res.status(200).json({ ok: true, removed, request_id: ctx.requestId });
}

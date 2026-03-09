import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initRequestContext } from "./_lib/observability.js";

/** GET: возвращает публичный VAPID ключ для подписки на клиенте. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "webpush-vapid");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return res.status(503).json({ error: "Web Push not configured (VAPID_PUBLIC_KEY)", request_id: ctx.requestId });
  }
  return res.status(200).json({ publicKey, request_id: ctx.requestId });
}

import type { VercelRequest, VercelResponse } from "@vercel/node";

/** GET: возвращает публичный VAPID ключ для подписки на клиенте. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return res.status(503).json({ error: "Web Push not configured (VAPID_PUBLIC_KEY)" });
  }
  return res.status(200).json({ publicKey });
}

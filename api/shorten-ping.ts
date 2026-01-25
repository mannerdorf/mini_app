import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Минимальный пинг без импорта сторонних библиотек.
 * GET /api/shorten-ping → { ok: true, tinyurl_configured: boolean }
 * Используется для «Проверить подключение» в тесте сокращателя.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const configured = !!(process.env.TINYURL_API_TOKEN || "").trim();
  return res.status(200).json({ ok: true, tinyurl_configured: configured });
}

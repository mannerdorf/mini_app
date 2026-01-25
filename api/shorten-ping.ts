import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Минимальный пинг без импорта Bitly.
 * GET /api/shorten-ping → { ok: true, bitly_configured: boolean }
 * Используется для «Проверить подключение» в тесте Bitly.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const configured = !!(process.env.BITLY_ACCESS_TOKEN || "").trim();
  return res.status(200).json({ ok: true, bitly_configured: configured });
}

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { shortenUrl } from "./bitly";

/**
 * Создает короткую ссылку через Bitly API
 * POST /api/shorten
 * Body: { url: "https://..." }
 * 
 * Токен должен быть добавлен в Vercel Environment Variables:
 * - BITLY_ACCESS_TOKEN
 */
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

    const { url } = body || {};

    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "URL is required" });
    }

    // Валидация URL
    try {
      new URL(url);
    } catch {
      return res.status(400).json({ error: "Invalid URL format" });
    }

    // Создаем короткую ссылку через Bitly
    const shortUrl = await shortenUrl(url);

    if (!shortUrl) {
      return res.status(500).json({
        error: "Failed to create short URL via Bitly",
        message: "Bitly service unavailable or token not configured",
      });
    }

    return res.status(200).json({
      shortUrl,
      originalUrl: url,
    });
  } catch (error: any) {
    console.error("[shorten] Error:", error);
    return res.status(500).json({
      error: "Failed to create short URL",
      message: error?.message || String(error),
    });
  }
}

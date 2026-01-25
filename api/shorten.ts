import type { VercelRequest, VercelResponse } from "@vercel/node";

function truncateUrl(u: string, max = 80): string {
  if (!u || u.length <= max) return u;
  return u.slice(0, max) + "...";
}

/**
 * Создает короткую ссылку через Bitly API
 * GET  /api/shorten → { ok: true, bitly_configured: boolean } (диагностика)
 * POST /api/shorten Body: { url: "https://..." }
 * 
 * Токен: BITLY_ACCESS_TOKEN в Vercel Environment Variables.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const send = (status: number, body: object) => {
    try {
      res.status(status).json(body);
    } catch (e) {
      console.error("[shorten] Failed to send JSON:", e);
    }
  };

  try {
    if (req.method === "GET") {
      const configured = !!(process.env.BITLY_ACCESS_TOKEN || "").trim();
      return send(200, { ok: true, bitly_configured: configured });
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return send(405, { error: "Method not allowed" });
    }

    let body: any = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return send(400, { error: "Invalid JSON body" });
      }
    }

    const { url } = body || {};
    if (!url || typeof url !== "string") {
      return send(400, { error: "URL is required" });
    }

    try {
      new URL(url);
    } catch {
      return send(400, { error: "Invalid URL format" });
    }

    const BITLY_URL = "https://api-ssl.bitly.com/v4/shorten";
    const debug = {
      bitly_url: BITLY_URL,
      bitly_method: "POST",
      bitly_headers: "Content-Type: application/json, Authorization: Bearer ***",
      bitly_body: { long_url: truncateUrl(url) },
      bitly_body_url_length: url.length,
    };

    console.log(`[shorten] Shortening URL: ${truncateUrl(url)} (length: ${url.length})`);
    console.log(`[shorten] BITLY_ACCESS_TOKEN: ${process.env.BITLY_ACCESS_TOKEN ? "YES" : "NO"}`);
    console.log(`[shorten] Вызов Bitly: POST ${BITLY_URL}, body: {"long_url":"${truncateUrl(url)}"}`);

    const { shortenUrl } = await import("./bitly");
    const result = await shortenUrl(url);

    if (result.ok) {
      console.log(`[shorten] OK: ${truncateUrl(url)} -> ${result.shortUrl}`);
      return send(200, {
        shortUrl: result.shortUrl,
        originalUrl: url,
        bitly_called: true,
        debug,
      });
    }

    console.error(`[shorten] Bitly failed: ${result.error} (status: ${result.status})`);
    return send(500, {
      error: "Failed to create short URL via Bitly",
      message: result.error || "Bitly error",
      bitly_called: true,
      bitly_error: result.error,
      bitly_status: result.status,
      bitly_raw: result.raw ? result.raw.slice(0, 300) : undefined,
      debug,
    });
  } catch (error: any) {
    console.error("[shorten] Handler error:", error?.message || error);
    const BITLY_URL = "https://api-ssl.bitly.com/v4/shorten";
    return send(500, {
      error: "Failed to create short URL",
      message: error?.message || String(error),
      bitly_called: false,
      debug: {
        bitly_url: BITLY_URL,
        bitly_method: "POST",
        bitly_headers: "Content-Type: application/json, Authorization: Bearer ***",
        bitly_body: { long_url: "(не дошли до запроса)" },
      },
    });
  }
}

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initRequestContext, logError } from "./_lib/observability.js";

/**
 * Создает короткую ссылку через TinyURL API
 * POST /api/shorten Body: { url: "https://..." }
 * 
 * Токен: TINYURL_API_TOKEN в Vercel Environment Variables.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "shorten");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: "URL is required", request_id: ctx.requestId });
  }

  const apiToken = process.env.TINYURL_API_TOKEN;

  if (!apiToken) {
    return res.status(500).json({ error: "TinyURL API token not configured", request_id: ctx.requestId });
  }

  try {
    const response = await fetch("https://api.tinyurl.com/create", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        url: url,
        domain: "tinyurl.com",
      }),
    });

    const rawResponse = await response.text();
    let data: any;
    try {
      data = JSON.parse(rawResponse);
    } catch {
      data = { raw: rawResponse };
    }

    if (!response.ok) {
      console.error("TinyURL error response:", rawResponse);
      return res.status(response.status).json({
        error: "TinyURL API error",
        status: response.status,
        details: data.errors || data.message || data,
        request_id: ctx.requestId,
      });
    }

    return res.status(200).json({
      short_url: data.data?.tiny_url || data.tiny_url,
      request_id: ctx.requestId,
    });
  } catch (error: any) {
    logError(ctx, "shorten_failed", error);
    return res.status(500).json({
      error: "Failed to shorten URL",
      details: error.message,
      request_id: ctx.requestId,
    });
  }
}

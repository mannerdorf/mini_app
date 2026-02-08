/**
 * Регистрация webhook для второго чат-бота в MAX.
 *
 * Переменные окружения: MAX_BOT_TOKEN_2
 *
 * После деплоя вызови:
 *   GET или POST https://<домен>/api/register-max-webhook-2
 * Webhook будет зарегистрирован на: https://<домен>/api/max-webhook-2
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

const MAX_API_BASE = "https://platform-api.max.ru";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "POST, GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const MAX_BOT_TOKEN = process.env.MAX_BOT_TOKEN_2;
  if (!MAX_BOT_TOKEN) {
    return res.status(500).json({
      error: "MAX_BOT_TOKEN_2 is not configured. Add it in Vercel Environment Variables.",
    });
  }

  const host = req.headers.host || req.headers["x-forwarded-host"];
  const protocol = req.headers["x-forwarded-proto"] || "https";
  const webhookUrl = `${protocol}://${host}/api/max-webhook-2`;

  let body: any = {};
  if (req.method === "POST") {
    if (typeof req.body === "string") {
      try {
        body = JSON.parse(req.body);
      } catch {}
    } else {
      body = req.body || {};
    }
  }

  const finalWebhookUrl = body.url || webhookUrl;

  if (!finalWebhookUrl.startsWith("https://")) {
    return res.status(400).json({
      error: "Webhook URL must be HTTPS",
      detected: webhookUrl,
    });
  }

  try {
    console.log("🔗 Registering MAX webhook-2:", finalWebhookUrl);

    const response = await fetch(`${MAX_API_BASE}/subscriptions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: MAX_BOT_TOKEN,
      },
      body: JSON.stringify({
        url: finalWebhookUrl,
        events: ["message"],
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("❌ MAX API error (webhook-2):", response.status, result);
      return res.status(response.status).json({
        error: "Failed to register webhook-2 in MAX",
        status: response.status,
        details: result,
        webhookUrl: finalWebhookUrl,
      });
    }

    console.log("✅ Webhook-2 registered:", finalWebhookUrl);

    return res.status(200).json({
      success: true,
      message: "Webhook for second MAX bot registered successfully",
      webhookUrl: finalWebhookUrl,
      result,
    });
  } catch (error: any) {
    console.error("🔥 Webhook-2 registration error:", error);
    return res.status(500).json({
      error: "Failed to register webhook-2",
      message: error?.message || String(error),
      webhookUrl: finalWebhookUrl,
    });
  }
}

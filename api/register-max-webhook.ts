/**
 * Endpoint для регистрации MAX webhook через Vercel.
 *
 * В интерфейсе платформы MAX (business.max.ru) нет поля для ввода URL вебхука —
 * подписка на уведомления настраивается только через API (POST /subscriptions).
 * Вызов этого endpoint'а регистрирует webhook за вас.
 *
 * Использование:
 * 1. Добавь MAX_BOT_TOKEN в Vercel Environment Variables
 * 2. После деплоя открой в браузере или вызови: https://<твой-домен>/api/register-max-webhook
 *
 * Документация: https://dev.max.ru/docs/chatbots/bots-coding/prepare
 * API: https://dev.max.ru/docs-api/methods/POST/subscriptions
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

const MAX_API_BASE = "https://platform-api.max.ru";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Разрешаем GET для удобства (можно открыть в браузере)
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "POST, GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const MAX_BOT_TOKEN = process.env.MAX_BOT_TOKEN;
  if (!MAX_BOT_TOKEN) {
    return res.status(500).json({ 
      error: "MAX_BOT_TOKEN is not configured. Add it in Vercel Environment Variables." 
    });
  }

  // Определяем URL webhook автоматически на основе Vercel URL
  const host = req.headers.host || req.headers["x-forwarded-host"];
  const protocol = req.headers["x-forwarded-proto"] || "https";
  const webhookUrl = `${protocol}://${host}/api/max-webhook`;

  // Если в body передан другой URL — используем его
  let body: any = {};
  if (req.method === "POST") {
    if (typeof req.body === "string") {
      try {
        body = JSON.parse(req.body);
      } catch {
        // игнорируем ошибки парсинга
      }
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
    console.log("🔗 Registering webhook:", finalWebhookUrl);

    // Регистрируем webhook через MAX API (см. POST /subscriptions в документации)
    const response = await fetch(`${MAX_API_BASE}/subscriptions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: MAX_BOT_TOKEN,
      },
      body: JSON.stringify({
        url: finalWebhookUrl,
        update_types: ["message_created", "bot_started"], // сообщения и запуск по диплинку
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("❌ MAX API error:", response.status, result);
      return res.status(response.status).json({
        error: "Failed to register webhook in MAX",
        status: response.status,
        details: result,
        webhookUrl: finalWebhookUrl,
      });
    }

    console.log("✅ Webhook registered successfully:", finalWebhookUrl);

    return res.status(200).json({
      success: true,
      message: "Webhook registered successfully in MAX",
      webhookUrl: finalWebhookUrl,
      result,
    });
  } catch (error: any) {
    console.error("🔥 Webhook registration error:", error);
    return res.status(500).json({
      error: "Failed to register webhook",
      message: error?.message || String(error),
      webhookUrl: finalWebhookUrl,
    });
  }
}

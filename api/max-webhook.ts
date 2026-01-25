import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  extractCargoNumberFromPayload,
  getMaxWebhookSecret,
  maxSendMessage,
} from "./maxBot";

// MAX bot token must be stored in Vercel Environment Variables (server-side only)
const MAX_BOT_TOKEN = process.env.MAX_BOT_TOKEN;
const MAX_WEBHOOK_SECRET = process.env.MAX_WEBHOOK_SECRET;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!MAX_BOT_TOKEN) {
    return res.status(500).json({ error: "MAX_BOT_TOKEN is not configured" });
  }

  // Optional shared-secret guard (recommended)
  if (MAX_WEBHOOK_SECRET) {
    const incoming = getMaxWebhookSecret(req);
    if (incoming !== MAX_WEBHOOK_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  const update: any = typeof req.body === "string" ? safeJson(req.body) : req.body;
  if (!update) return res.status(400).json({ error: "Invalid JSON" });

  // Best-effort extraction of chat_id and payload.
  // MAX Update shapes can vary; we handle common patterns.
  const chatId =
    update?.chat_id ??
    update?.chatId ??
    update?.message?.chat_id ??
    update?.message?.chatId ??
    update?.chat?.id ??
    update?.chat?.chat_id;

  if (!chatId) {
    return res.status(200).json({ ok: true });
  }

  const rawText =
    update?.message?.text ??
    update?.text ??
    update?.payload ??
    update?.start_param ??
    update?.startapp ??
    "";

  const cargoNumber = extractCargoNumberFromPayload(rawText);

  // Если есть номер перевозки — отправляем сообщение с кнопками документов
  if (cargoNumber) {
    // Получаем домен из env или используем дефолтный
    const appDomain = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : process.env.NEXT_PUBLIC_APP_URL || "https://<твой-домен>";
    
    // Формируем кнопки для документов (скрытые ссылки через кнопки типа "link")
    // По документации MAX, кнопка типа "link" имеет payload как URL
    const docUrl = (metod: string) => 
      `${appDomain}/api/download?metod=${encodeURIComponent(metod)}&Number=${encodeURIComponent(cargoNumber)}`;
    
    const attachments = [{
      type: "inline_keyboard" as const,
      payload: {
        buttons: [
          [
            { 
              type: "link" as const, 
              text: "ЭР", 
              payload: docUrl("ЭР")
            },
            { 
              type: "link" as const, 
              text: "СЧЕТ", 
              payload: docUrl("СЧЕТ")
            },
          ],
          [
            { 
              type: "link" as const, 
              text: "УПД", 
              payload: docUrl("УПД")
            },
            { 
              type: "link" as const, 
              text: "АПП", 
              payload: docUrl("АПП")
            },
          ],
        ],
      },
    }];

    await maxSendMessage({
      token: MAX_BOT_TOKEN,
      chatId,
      text: `Добрый день!\n\nВижу, что у вас вопрос по перевозке ${cargoNumber}.\n\nВы можете скачать документы:`,
      attachments,
    });
  } else {
    // Обычное приветствие без кнопок
    await maxSendMessage({
      token: MAX_BOT_TOKEN,
      chatId,
      text: `Добрый день!\n\nНапишите, пожалуйста, ваш вопрос — мы поможем.`,
    });
  }

  return res.status(200).json({ ok: true });
}

function safeJson(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}


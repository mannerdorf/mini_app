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

  // Логируем весь update для диагностики
  console.log("MAX webhook received full update:", JSON.stringify(update, null, 2));

  // Best-effort extraction of chat_id and payload.
  // MAX Update shapes can vary; we handle common patterns.
  const chatId =
    update?.chat_id ??
    update?.chatId ??
    update?.message?.chat_id ??
    update?.message?.chatId ??
    update?.chat?.id ??
    update?.chat?.chat_id ??
    update?.user?.id ??
    update?.user_id;

  if (!chatId) {
    console.warn("MAX webhook: No chatId found in update:", JSON.stringify(update));
    return res.status(200).json({ ok: true });
  }

  // Проверяем разные источники payload для startapp параметра
  const rawText =
    update?.message?.text ??
    update?.text ??
    update?.payload ??
    update?.start_param ??
    update?.startapp ??
    update?.start_app ??
    update?.message?.start_param ??
    update?.message?.startapp ??
    update?.message?.start_app ??
    update?.data?.start_param ??
    update?.data?.startapp ??
    "";

  // Также проверяем тип события (может быть "start" или "message")
  const eventType = update?.type ?? update?.event ?? update?.message?.type ?? "";

  console.log("MAX webhook parsed:", JSON.stringify({ 
    chatId, 
    rawText, 
    eventType,
    hasMessage: !!update?.message,
    hasData: !!update?.data,
    keys: Object.keys(update)
  }));

  const cargoNumber = extractCargoNumberFromPayload(rawText);
  
  console.log("MAX webhook cargo number extracted:", cargoNumber);

  // Если есть номер перевозки — отправляем сообщение с кнопками документов
  if (cargoNumber) {
    console.log("Cargo number extracted:", cargoNumber);
    
    // Получаем домен из env или используем дефолтный
    const appDomain = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : process.env.NEXT_PUBLIC_APP_URL || "https://<твой-домен>";
    
    // Используем /api/doc-short для редиректа на мини-апп
    // Мини-апп сам создаст короткие ссылки через /api/shorten-doc при необходимости
    const docUrl = (metod: string) => 
      `${appDomain}/api/doc-short?metod=${encodeURIComponent(metod)}&number=${encodeURIComponent(cargoNumber)}`;
    
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

    try {
      await maxSendMessage({
        token: MAX_BOT_TOKEN,
        chatId,
        text: `Добрый день!\n\nВижу, что у вас вопрос по перевозке ${cargoNumber}.\n\nВы можете скачать документы:`,
        attachments,
      });
      console.log("Message sent successfully to chat:", chatId);
    } catch (error: any) {
      console.error("Failed to send message:", error);
      // Не возвращаем ошибку, чтобы webhook не считался провалившимся
    }
  } else {
    // Обычное приветствие без кнопок
    try {
      await maxSendMessage({
        token: MAX_BOT_TOKEN,
        chatId,
        text: `Добрый день!\n\nНапишите, пожалуйста, ваш вопрос — мы поможем.`,
      });
      console.log("Welcome message sent successfully to chat:", chatId);
    } catch (error: any) {
      console.error("Failed to send welcome message:", error);
    }
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


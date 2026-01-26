import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  extractCargoNumberFromPayload,
  getMaxWebhookSecret,
  maxSendMessage,
} from "../lib/maxBot.js";

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
    update?.message?.recipient?.chat_id ??
    update?.message?.recipient?.chatId ??
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
    update?.message?.body?.text ??
    update?.text ??
    update?.payload ??
    update?.start_param ??
    update?.startapp ??
    update?.start_app ??
    update?.message?.start_param ??
    update?.message?.startapp ??
    update?.message?.start_app ??
    update?.message?.body?.payload ??
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

  // Если это событие bot_started с payload — даем кнопки документов
  if (cargoNumber) {
    console.log("Cargo number extracted:", cargoNumber);
    
    // Получаем домен из env или используем дефолтный
    const appDomain = process.env.NEXT_PUBLIC_APP_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://mini-app-lake-phi.vercel.app");
    
    // Используем /api/doc-short для редиректа на мини-апп
    const docUrl = (metod: string) => 
      `${appDomain}/api/doc-short?metod=${encodeURIComponent(metod)}&number=${encodeURIComponent(cargoNumber)}`;
    
    const attachments = [{
      type: "inline_keyboard" as const,
      payload: {
        buttons: [
          [
            { type: "link" as const, text: "ЭР", payload: docUrl("ЭР") },
            { type: "link" as const, text: "СЧЕТ", payload: docUrl("СЧЕТ") },
          ],
          [
            { type: "link" as const, text: "УПД", payload: docUrl("УПД") },
            { type: "link" as const, text: "АПП", payload: docUrl("АПП") },
          ],
        ],
      },
    }];

    try {
      await maxSendMessage({
        token: MAX_BOT_TOKEN,
        chatId,
        text: `Добрый день!\n\nВижу, что у вас вопрос по перевозке ${cargoNumber}.\n\nВы можете скачать документы прямо здесь:`,
        attachments,
      });
      return res.status(200).json({ ok: true });
    } catch (error: any) {
      console.error("Failed to send message:", error);
    }
  }

  // Если это обычное текстовое сообщение — отвечаем через ИИ
  if (rawText) {
    const userText = rawText;
    console.log("Using AI to respond to:", userText);

    try {
      const appDomain = process.env.NEXT_PUBLIC_APP_URL
        || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://mini-app-lake-phi.vercel.app");

      const aiRes = await fetch(`${appDomain}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          sessionId: `max_${chatId}`,
          userId: String(chatId),
          message: userText,
          channel: "max"
        })
      });

      if (aiRes.ok) {
        const aiData = await aiRes.json();
        await maxSendMessage({
          token: MAX_BOT_TOKEN,
          chatId,
          text: aiData.reply,
        });
      } else {
        throw new Error("AI service error");
      }
    } catch (error) {
      console.error("AI processing failed:", error);
      await maxSendMessage({
        token: MAX_BOT_TOKEN,
        chatId,
        text: "Добрый день! Напишите, пожалуйста, ваш вопрос — мы поможем. 🚛",
      });
    }
  } else {
    // Входящее событие без текста (например, нажатие кнопки без данных)
    try {
      await maxSendMessage({
        token: MAX_BOT_TOKEN,
        chatId,
        text: "Добрый день! Я AI-помощник HAULZ. Чем могу помочь? 😊",
      });
    } catch (e) {}
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

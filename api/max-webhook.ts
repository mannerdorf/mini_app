import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  extractCargoNumberFromPayload,
  getMaxWebhookSecret,
  maxSendMessage,
} from "../lib/maxBot";

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

  try {
    // Проверяем разные источники payload
    const rawText =
      update?.message?.text ??
      update?.text ??
      update?.payload ??
      update?.start_param ??
      update?.startapp ??
      update?.start_app ??
      "";

    const cargoNumber = extractCargoNumberFromPayload(rawText);
    
    // Если это событие с номером перевозки — даем кнопки
    if (cargoNumber) {
      const appDomain = process.env.VERCEL_URL 
        ? `https://${process.env.VERCEL_URL}` 
        : "https://mini-app-lake-phi.vercel.app";
      
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

      await maxSendMessage({
        token: MAX_BOT_TOKEN,
        chatId,
        text: `Добрый день!\n\nВижу, что у вас вопрос по перевозке ${cargoNumber}.\n\nВы можете скачать документы прямо здесь:`,
        attachments,
      });
      return res.status(200).json({ ok: true });
    }

    // Обычное сообщение — через ИИ
    const userText = update?.message?.text || update?.text;
    if (userText) {
      const appDomain = process.env.VERCEL_URL 
        ? `https://${process.env.VERCEL_URL}` 
        : "https://mini-app-lake-phi.vercel.app";

      const aiRes = await fetch(`${appDomain}/api/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: userText }] })
      });

      if (aiRes.ok) {
        const aiData: any = await aiRes.json();
        await maxSendMessage({
          token: MAX_BOT_TOKEN,
          chatId,
          text: aiData.reply,
        });
      } else {
        throw new Error("AI service error");
      }
    } else {
      // Приветствие по умолчанию
      await maxSendMessage({
        token: MAX_BOT_TOKEN,
        chatId,
        text: "Добрый день! Я ИИ-помощник HAULZ. Чем я могу вам помочь? 😊",
      });
    }
  } catch (error) {
    console.error("MAX webhook error:", error);
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


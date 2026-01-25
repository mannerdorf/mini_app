import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAiReply } from "../lib/ai-service.js";
import {
  extractCargoNumberFromPayload,
  getMaxWebhookSecret,
  maxSendMessage,
} from "../lib/maxBot.js";

const MAX_BOT_TOKEN = process.env.MAX_BOT_TOKEN;
const MAX_WEBHOOK_SECRET = process.env.MAX_WEBHOOK_SECRET;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!MAX_BOT_TOKEN) {
    return res.status(200).json({ ok: true });
  }

  // Секретный ключ для безопасности
  if (MAX_WEBHOOK_SECRET) {
    const incoming = getMaxWebhookSecret(req);
    if (incoming !== MAX_WEBHOOK_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  const update: any = req.body;
  const chatId = update?.chat_id ?? update?.chatId ?? update?.message?.chat_id ?? update?.user?.id;

  if (!chatId) {
    return res.status(200).json({ ok: true });
  }

  try {
    const rawText = update?.message?.text ?? update?.text ?? update?.payload ?? update?.startapp ?? "";
    const cargoNumber = extractCargoNumberFromPayload(rawText);
    
    if (cargoNumber) {
      const appDomain = "https://mini-app-lake-phi.vercel.app";
      const docUrl = (m: string) => `${appDomain}/api/doc-short?metod=${encodeURIComponent(m)}&number=${encodeURIComponent(cargoNumber)}`;
      
      const attachments = [{
        type: "inline_keyboard" as const,
        payload: {
          buttons: [
            [{ type: "link" as const, text: "ЭР", payload: docUrl("ЭР") }, { type: "link" as const, text: "СЧЕТ", payload: docUrl("СЧЕТ") }],
            [{ type: "link" as const, text: "УПД", payload: docUrl("УПД") }, { type: "link" as const, text: "АПП", payload: docUrl("АПП") }],
          ],
        },
      }];

      await maxSendMessage({
        token: MAX_BOT_TOKEN,
        chatId,
        text: `Вижу ваш вопрос по перевозке ${cargoNumber}. Документы:`,
        attachments,
      });
    } else {
      const userText = update?.message?.text || update?.text;
      if (userText) {
        const reply = await getAiReply([{ role: 'user', content: userText }]);
        await maxSendMessage({
          token: MAX_BOT_TOKEN,
          chatId,
          text: reply || "Извините, сейчас я не могу ответить.",
        });
      } else {
        await maxSendMessage({
          token: MAX_BOT_TOKEN,
          chatId,
          text: "Добрый день! Я ИИ-помощник HAULZ. Напишите ваш вопрос, и я помогу! 😊",
        });
      }
    }
  } catch (error) {
    console.error("MAX webhook error:", error);
  }

  return res.status(200).json({ ok: true });
}

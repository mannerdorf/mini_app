import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAiReply } from "../lib/ai-service.js";

const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!TG_BOT_TOKEN) {
    console.error("TG_BOT_TOKEN not set");
    return res.status(200).json({ ok: true });
  }

  const update = req.body;
  const chatId = update?.message?.chat?.id;
  const userText = update?.message?.text;

  if (!chatId) {
    return res.status(200).json({ ok: true });
  }

  // Контрольная проверка
  console.log("TG Webhook hit for chatId:", chatId);

  try {
    if (userText) {
      // Обработка /start
      if (userText.startsWith("/start ")) {
        const payload = userText.split(" ")[1];
        if (payload && payload.startsWith("haulz_n_")) {
          const cargoNumber = payload.split("_")[2];
          const appDomain = "https://mini-app-lake-phi.vercel.app";
          const docUrl = (m: string) => `${appDomain}/api/doc-short?metod=${encodeURIComponent(m)}&number=${encodeURIComponent(cargoNumber)}`;

          const keyboard = {
            inline_keyboard: [
              [{ text: "ЭР", url: docUrl("ЭР") }, { text: "СЧЕТ", url: docUrl("СЧЕТ") }],
              [{ text: "УПД", url: docUrl("УПД") }, { text: "АПП", url: docUrl("АПП") }]
            ]
          };

          await sendTgMessage(chatId, `Вижу вопрос по перевозке ${cargoNumber}. Документы:`, keyboard);
          return res.status(200).json({ ok: true });
        }
      }

      // Ответ через ИИ
      const reply = await getAiReply([{ role: 'user', content: userText }]);
      await sendTgMessage(chatId, reply || "Извините, я сейчас не могу ответить.");
    } else {
        // Если пришло что-то кроме текста (например, голосовое), пока просто вежливо отвечаем
        await sendTgMessage(chatId, "Я пока умею понимать только текстовые сообщения. Напишите ваш вопрос, и я помогу! 😊");
    }
  } catch (e) {
    console.error("TG Webhook error:", e);
  }

  return res.status(200).json({ ok: true });
}

async function sendTgMessage(chatId: number, text: string, replyMarkup?: any) {
  try {
    await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        reply_markup: replyMarkup
      })
    });
  } catch (e) {
    console.error("Error sending TG message:", e);
  }
}

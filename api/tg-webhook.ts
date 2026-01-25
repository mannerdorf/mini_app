import type { VercelRequest, VercelResponse } from "@vercel/node";

import { getAiReply } from "../lib/ai-service";

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
  console.log("TG Webhook update:", JSON.stringify(update));

  const chatId = update?.message?.chat?.id;
  const userText = update?.message?.text;
  const voice = update?.message?.voice;

  if (!chatId) {
    return res.status(200).json({ ok: true });
  }

  try {
    // Если пришло голосовое сообщение
    if (voice) {
      await sendTgMessage(chatId, "Транскрибирую ваше сообщение... 🎤");
      
      const fileRes = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/getFile?file_id=${voice.file_id}`);
      const fileData: any = await fileRes.json();
      const filePath = fileData?.result?.file_path;
      
      if (filePath) {
        const audioRes = await fetch(`https://api.telegram.org/file/bot${TG_BOT_TOKEN}/${filePath}`);
        const audioBuffer = await audioRes.arrayBuffer();
        
        const apiKey = process.env.OPENAI_API_KEY;
        if (apiKey) {
          const formData = new FormData();
          const blob = new Blob([audioBuffer], { type: voice.mime_type || 'audio/ogg' });
          formData.append('file', blob, 'voice.oga');
          formData.append('model', 'whisper-1');

          const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}` },
            body: formData
          });

          if (whisperRes.ok) {
            const { text } = await whisperRes.json();
            if (text) {
              console.log("TG Transcribed text:", text);
              await processAiReply(chatId, text);
              return res.status(200).json({ ok: true });
            }
          }
        }
      }
      await sendTgMessage(chatId, "Извините, не удалось распознать голосовое сообщение.");
      return res.status(200).json({ ok: true });
    }

    if (userText) {
      // Обработка /start с параметрами
      if (userText.startsWith("/start ")) {
        const payload = userText.split(" ")[1];
        if (payload && payload.startsWith("haulz_n_")) {
          const parts = payload.split("_");
          const cargoNumber = parts[2];
          const appDomain = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://mini-app-lake-phi.vercel.app";
          const docUrl = (m: string) => `${appDomain}/api/doc-short?metod=${encodeURIComponent(m)}&number=${encodeURIComponent(cargoNumber)}`;

          const message = `Вижу ваш вопрос по перевозке ${cargoNumber}. Выберите документ для скачивания:`;
          const keyboard = {
            inline_keyboard: [
              [{ text: "ЭР", url: docUrl("ЭР") }, { text: "СЧЕТ", url: docUrl("СЧЕТ") }],
              [{ text: "УПД", url: docUrl("УПД") }, { text: "АПП", url: docUrl("АПП") }]
            ]
          };

          await sendTgMessage(chatId, message, keyboard);
          return res.status(200).json({ ok: true });
        }
      }

      // Обычное сообщение — через ИИ
      await processAiReply(chatId, userText);
    }
  } catch (e) {
    console.error("TG Webhook error:", e);
    try {
      await sendTgMessage(chatId, "Извините, произошла ошибка. Попробуйте позже.");
    } catch {}
  }

  return res.status(200).json({ ok: true });
}

async function processAiReply(chatId: number, text: string) {
  try {
    const reply = await getAiReply([{ role: 'user', content: text }]);
    await sendTgMessage(chatId, reply || "Извините, сейчас я не могу ответить.");
  } catch (e) {
    console.error("TG AI error:", e);
    await sendTgMessage(chatId, "Ошибка при связи с ИИ. 🚛");
  }
}

async function sendTgMessage(chatId: number, text: string, replyMarkup?: any) {
  await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      reply_markup: replyMarkup
    })
  });
}

import type { VercelRequest, VercelResponse } from "@vercel/node";

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

  // Если пришло голосовое сообщение
  if (voice) {
    try {
      await sendTgMessage(chatId, "Транскрибирую ваше сообщение... 🎤");
      
      // 1. Получаем путь к файлу
      const fileRes = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/getFile?file_id=${voice.file_id}`);
      const fileData = await fileRes.json();
      const filePath = fileData.result.file_path;
      
      // 2. Скачиваем файл
      const audioRes = await fetch(`https://api.telegram.org/file/bot${TG_BOT_TOKEN}/${filePath}`);
      const audioBuffer = await audioRes.arrayBuffer();
      
      // 3. Отправляем в OpenAI Whisper (через наш же эндпоинт или напрямую)
      // Для простоты здесь вызовем напрямую OpenAI, если есть ключ
      const apiKey = process.env.OPENAI_API_KEY;
      if (apiKey) {
        const formData = new FormData();
        const blob = new Blob([audioBuffer], { type: voice.mime_type });
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
            // Обрабатываем текст через ИИ
            await processAiReply(chatId, text);
            return res.status(200).json({ ok: true });
          }
        }
      }
      await sendTgMessage(chatId, "Извините, не удалось распознать голосовое сообщение.");
    } catch (e) {
      console.error("TG Voice error:", e);
      await sendTgMessage(chatId, "Произошла ошибка при обработке голоса.");
    }
    return res.status(200).json({ ok: true });
  }

  if (!userText) {
    return res.status(200).json({ ok: true });
  }

  // Обработка /start с параметрами
  if (userText.startsWith("/start ")) {
    const payload = userText.split(" ")[1];
    if (payload.startsWith("haulz_n_")) {
      const cargoNumber = payload.split("_")[2];
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
  return res.status(200).json({ ok: true });
}

async function processAiReply(chatId: number, text: string) {
  try {
    const appDomain = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://mini-app-lake-phi.vercel.app";
    const aiRes = await fetch(`${appDomain}/api/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        messages: [{ role: 'user', content: text }]
      })
    });

    if (aiRes.ok) {
      const aiData = await aiRes.json();
      await sendTgMessage(chatId, aiData.reply);
    } else {
      await sendTgMessage(chatId, "Извините, я сейчас немного занят. Напишите позже! 🚛");
    }
  } catch (e) {
    console.error("TG AI error:", e);
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

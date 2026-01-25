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

  if (!chatId || !userText) {
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
  try {
    const appDomain = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://mini-app-lake-phi.vercel.app";
    const aiRes = await fetch(`${appDomain}/api/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        messages: [{ role: 'user', content: userText }]
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

  return res.status(200).json({ ok: true });
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

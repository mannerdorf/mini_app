import type { VercelRequest, VercelResponse } from "@vercel/node";

const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
const TG_MAX_MESSAGE_LENGTH = 4096;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const debug = req.query?.debug === "1";

  if (!TG_BOT_TOKEN) {
    console.error("TG_BOT_TOKEN not set");
    if (debug) {
      return res.status(200).json({ ok: true, debug: { tgTokenConfigured: false } });
    }
    return res.status(200).json({ ok: true });
  }

  const update = req.body;
  console.log("TG Webhook update:", JSON.stringify(update));

  const chatId = update?.message?.chat?.id || update?.callback_query?.message?.chat?.id;
  const userText = update?.message?.text || update?.callback_query?.data;

  if (!chatId || !userText) {
    if (debug) {
      return res.status(200).json({
        ok: true,
        debug: {
          tgTokenConfigured: true,
          chatId,
          userText,
          reason: "missing chatId or userText",
        }
      });
    }
    return res.status(200).json({ ok: true });
  }

  // Обработка /start с параметрами
  if (userText.startsWith("/start ")) {
    const payload = userText.split(" ")[1];
    if (payload.startsWith("haulz_n_")) {
      const cargoNumber = payload.split("_")[2];
      const appDomain = process.env.NEXT_PUBLIC_APP_URL
        || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://mini-app-lake-phi.vercel.app");
      const docUrl = (m: string) => `${appDomain}/api/doc-short?metod=${encodeURIComponent(m)}&number=${encodeURIComponent(cargoNumber)}`;

      const message = `Вижу ваш вопрос по перевозке ${cargoNumber}. Выберите документ для скачивания:`;
      const keyboard = {
        inline_keyboard: [
          [{ text: "ЭР", url: docUrl("ЭР") }, { text: "СЧЕТ", url: docUrl("СЧЕТ") }],
          [{ text: "УПД", url: docUrl("УПД") }, { text: "АПП", url: docUrl("АПП") }]
        ]
      };

      await sendTgMessageChunked(chatId, message, keyboard);
      return res.status(200).json({ ok: true });
    }
  }

  // Обычное сообщение — через ИИ
  const debugInfo: any = debug
    ? { tgTokenConfigured: true, chatId, userText }
    : null;

  try {
    const appDomain = process.env.NEXT_PUBLIC_APP_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://mini-app-lake-phi.vercel.app");
    if (debugInfo) debugInfo.appDomain = appDomain;
    const aiRes = await fetch(`${appDomain}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        sessionId: `tg_${chatId}`,
        userId: String(chatId),
        message: userText
      })
    });
    if (debugInfo) debugInfo.aiStatus = aiRes.status;

    const raw = await aiRes.text();
    if (debugInfo) debugInfo.aiRaw = raw?.slice?.(0, 500);
    let aiData: any = {};
    try {
      aiData = raw ? JSON.parse(raw) : {};
    } catch {
      aiData = { message: raw };
    }
    if (debugInfo) debugInfo.aiData = aiData;

    if (aiRes.ok) {
      await sendTgMessageChunked(chatId, aiData.reply || "Не удалось получить ответ.");
    } else {
      const errorText = aiData?.error || aiData?.message || raw || "Ошибка сервера";
      await sendTgMessageChunked(chatId, `Ошибка: ${errorText}`);
    }
  } catch (e) {
    if (debugInfo) debugInfo.error = String((e as any)?.message || e);
    console.error("TG AI error:", e);
  }

  if (debug) {
    return res.status(200).json({ ok: true, debug: debugInfo });
  }
  return res.status(200).json({ ok: true });
}

function normalizeText(text: unknown): string {
  if (typeof text === "string") return text;
  if (text === null || text === undefined) return "";
  try {
    return JSON.stringify(text);
  } catch {
    return String(text);
  }
}

function splitTelegramMessage(text: string, maxLen = 3500): string[] {
  if (text.length <= maxLen) return [text];
  const lines = text.split("\n");
  const chunks: string[] = [];
  let current = "";

  const pushCurrent = () => {
    if (current) chunks.push(current);
    current = "";
  };

  for (const line of lines) {
    if (line.length > maxLen) {
      pushCurrent();
      for (let i = 0; i < line.length; i += maxLen) {
        chunks.push(line.slice(i, i + maxLen));
      }
      continue;
    }
    const next = current ? `${current}\n${line}` : line;
    if (next.length > maxLen) {
      pushCurrent();
      current = line;
    } else {
      current = next;
    }
  }
  pushCurrent();
  return chunks.length ? chunks : [text];
}

async function sendTgMessage(chatId: number, text: string, replyMarkup?: any) {
  const res = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      reply_markup: replyMarkup
    })
  });
  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    console.error("TG sendMessage failed:", res.status, raw);
  }
}

async function sendTgMessageChunked(chatId: number, text: unknown, replyMarkup?: any) {
  let safeText = normalizeText(text).trim();
  if (!safeText) safeText = "Ответ пустой.";
  const chunks = splitTelegramMessage(safeText, TG_MAX_MESSAGE_LENGTH - 200);
  for (let i = 0; i < chunks.length; i += 1) {
    await sendTgMessage(chatId, chunks[i], i === 0 ? replyMarkup : undefined);
  }
}

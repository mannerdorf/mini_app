import type { VercelRequest, VercelResponse } from "@vercel/node";
import https from "https";

// Встраиваем логику прямо в файл, чтобы исключить проблемы с импортом в Vercel
const MAX_API_BASE = "platform-api.max.ru";

async function maxSendMessage(
  token: string,
  chatId: number,
  text: string,
  recipientUserId?: number,
  recipient?: { chat_id?: number; chat_type?: string; user_id?: number }
) {
  // Очищаем токен от возможных пробелов или кавычек, которые могли попасть при вставке в Vercel
  const cleanToken = token.trim().replace(/^["']|["']$/g, "");
  
  // Выводим в консоль Vercel замаскированный токен для проверки
  console.log(`[max-send-message] Using token: ${cleanToken.substring(0, 4)}...${cleanToken.substring(cleanToken.length - 4)}`);

  const authHeader = cleanToken;
  
  const body = JSON.stringify({
    ...(recipient ? { recipient } : {}),
    ...(recipient ? {} : { chat_id: chatId }),
    ...(typeof recipientUserId === "number" && !recipient ? { recipient: { user_id: recipientUserId } } : {}),
    text: text,
  });

  const send = (headerValue: string) => {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: MAX_API_BASE,
        path: "/messages",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": headerValue,
          "Content-Length": Buffer.byteLength(body),
        },
      };

      const req = https.request(options, (res) => {
        let responseBody = "";
        res.on("data", (chunk) => { responseBody += chunk; });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve({ ok: true, data: JSON.parse(responseBody) });
            } catch {
              resolve({ ok: true, data: responseBody });
            }
          } else {
            resolve({ ok: false, status: res.statusCode, data: responseBody });
          }
        });
      });
      req.on("error", (e) => reject(e));
      req.write(body);
      req.end();
    });
  };

  // Попытка 1: С Bearer
  console.log("[max-send-message] Attempt 1: with Bearer");
  let result: any = await send(authHeader);
  
  // Попытка 2: Если 401, пробуем БЕЗ Bearer (просто токен)
  if (!result.ok && result.status === 401) {
    console.log("[max-send-message] Attempt 1 failed (401), trying Attempt 2: with Bearer");
    result = await send(`Bearer ${cleanToken}`);
  }

  if (!result.ok) {
    throw new Error(`MAX API Error: ${result.status} - ${result.data}`);
  }
  
  return result.data;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Добавляем CORS заголовки на всякий случай
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const MAX_BOT_TOKEN = process.env.MAX_BOT_TOKEN;

  if (!MAX_BOT_TOKEN || MAX_BOT_TOKEN.trim() === "") {
    console.error("[max-send-message] MAX_BOT_TOKEN is missing or empty");
    return res.status(200).json({ 
      ok: false, 
      error: "TOKEN_MISSING",
      message: "Ошибка: MAX_BOT_TOKEN не найден в переменных окружения Vercel. Пожалуйста, добавьте его и сделайте Redeploy." 
    });
  }

  try {
    let body: any = req.body;
    // Парсим body вручную, если Vercel этого не сделал
    if (typeof body === "string" && body.trim().startsWith("{")) {
      try { body = JSON.parse(body); } catch (e) {}
    }

    const chatId = body?.chatId || body?.chat_id;
    const userId = body?.userId || body?.user_id || body?.recipientUserId;
    const recipient = body?.recipient;
    const text = body?.text;

    if (!chatId || !text) {
      return res.status(400).json({ 
        error: "Missing fields", 
        message: "chatId and text are required",
        received: { chatId: !!chatId, text: !!text },
        bodyType: typeof body
      });
    }

    const numericChatId = Number(chatId);
    if (isNaN(numericChatId)) {
      return res.status(400).json({ error: "chatId must be a number" });
    }

    const numericUserId = userId !== undefined ? Number(userId) : undefined;
    const validRecipientUserId = Number.isFinite(numericUserId) ? numericUserId : undefined;

    console.log(`[max-send-message] Sending to ${numericChatId}${validRecipientUserId ? ` (user ${validRecipientUserId})` : ""}...`);
    
    const result = await maxSendMessage(
      MAX_BOT_TOKEN,
      numericChatId,
      text,
      validRecipientUserId,
      recipient
    );
    console.log("[max-send-message] Success!");

    return res.status(200).json({ ok: true, result });
  } catch (error: any) {
    console.error("[max-send-message] Handler error:", error);
    return res.status(500).json({ 
      error: "Failed to send message", 
      message: error?.message || String(error),
      type: "server_crash_caught"
    });
  }
}

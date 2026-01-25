import type { VercelRequest, VercelResponse } from "@vercel/node";
import https from "https";

// Встраиваем логику прямо в файл, чтобы исключить проблемы с импортом в Vercel
const MAX_API_BASE = "platform-api.max.ru";

async function maxSendMessage(token: string, chatId: number, text: string) {
  const authHeader = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
  
  const body = JSON.stringify({
    chat_id: chatId,
    text: text,
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: MAX_API_BASE,
      path: "/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader,
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let responseBody = "";
      res.on("data", (chunk) => { responseBody += chunk; });
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(responseBody));
          } catch {
            resolve({ ok: true, raw: responseBody });
          }
        } else {
          reject(new Error(`MAX API Error: ${res.statusCode} - ${responseBody}`));
        }
      });
    });

    req.on("error", (e) => reject(e));
    req.write(body);
    req.end();
  });
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

    if (!chatId || !text) {
      return res.status(400).json({ error: "chatId and text are required" });
    }

    const numericChatId = Number(chatId);
    if (isNaN(numericChatId)) {
      return res.status(400).json({ error: "chatId must be a number" });
    }

    console.log(`[max-send-message] Sending to ${numericChatId}...`);
    
    const result = await maxSendMessage(MAX_BOT_TOKEN, numericChatId, text);
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

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { maxSendMessage } from "./maxBot";

const MAX_BOT_TOKEN = process.env.MAX_BOT_TOKEN;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!MAX_BOT_TOKEN) {
    return res.status(500).json({ error: "MAX_BOT_TOKEN is not configured" });
  }

  try {
    let body: any = req.body;
    if (typeof body === "string") {
      body = JSON.parse(body);
    }

    const { chatId, text } = body || {};

    if (!chatId || !text) {
      return res.status(400).json({ error: "chatId and text are required" });
    }

    const result = await maxSendMessage({
      token: MAX_BOT_TOKEN,
      chatId,
      text,
    });

    return res.status(200).json({ ok: true, result });
  } catch (error: any) {
    console.error("api/max-send-message error:", error);
    // Более детальный вывод ошибки для фронтенда
    return res.status(500).json({ 
      error: "Failed to send message", 
      message: error?.message || String(error),
      details: error.stack
    });
  }
}

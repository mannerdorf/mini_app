/**
 * Второй канал чат-бота в MAX.
 * Использует переменные окружения: MAX_BOT_TOKEN_2, MAX_WEBHOOK_SECRET_2 (опционально).
 * Webhook URL: /api/max-webhook-2
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  extractCargoNumberFromPayload,
  getMaxWebhookSecret,
  maxSendMessage,
} from "../lib/maxBot.js";

const MAX_BOT_TOKEN = process.env.MAX_BOT_TOKEN_2;
const MAX_WEBHOOK_SECRET = process.env.MAX_WEBHOOK_SECRET_2;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const debug = String((req.query as any)?.debug ?? "") === "1";
  if (!MAX_BOT_TOKEN) {
    return res.status(500).json({ error: "MAX_BOT_TOKEN_2 is not configured" });
  }

  if (MAX_WEBHOOK_SECRET) {
    const incoming = getMaxWebhookSecret(req);
    if (incoming !== MAX_WEBHOOK_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  const update: any = typeof req.body === "string" ? safeJson(req.body) : req.body;
  if (!update) return res.status(400).json({ error: "Invalid JSON" });

  console.log("MAX webhook-2 received update:", JSON.stringify(update, null, 2));

  const chatId =
    update?.chat_id ??
    update?.chatId ??
    update?.message?.chat_id ??
    update?.message?.chatId ??
    update?.message?.recipient?.chat_id ??
    update?.message?.recipient?.chatId ??
    update?.chat?.id ??
    update?.chat?.chat_id ??
    update?.user?.id ??
    update?.user_id;

  const senderId =
    update?.message?.sender?.user_id ??
    update?.message?.sender?.userId ??
    update?.sender?.user_id ??
    update?.sender?.userId;

  if (!chatId) {
    console.warn("MAX webhook-2: No chatId in update");
    return res.status(200).json({ ok: true });
  }

  const rawText =
    update?.message?.text ??
    update?.message?.body?.text ??
    update?.text ??
    update?.payload ??
    update?.start_param ??
    update?.startapp ??
    update?.start_app ??
    update?.message?.start_param ??
    update?.message?.startapp ??
    update?.message?.start_app ??
    update?.message?.body?.payload ??
    update?.data?.start_param ??
    update?.data?.startapp ??
    "";

  const chatType =
    update?.message?.recipient?.chat_type ??
    update?.message?.chat_type ??
    update?.chat_type ??
    update?.chat?.type ??
    "dialog";
  const replyRecipient = senderId
    ? { user_id: senderId, chat_id: chatId, chat_type: chatType }
    : undefined;

  if (debug) {
    const cleanToken = (MAX_BOT_TOKEN || "").trim().replace(/^["']|["']$/g, "");
    return res.status(200).json({
      ok: true,
      debug: {
        channel: "max2",
        tokenConfigured: !!MAX_BOT_TOKEN,
        tokenMasked: cleanToken.length >= 8 ? `${cleanToken.slice(0, 4)}...${cleanToken.slice(-4)}` : "(short)",
        chatId,
        senderId,
        rawText,
      },
    });
  }

  const cargoNumber = extractCargoNumberFromPayload(rawText);

  if (cargoNumber) {
    const appDomain = process.env.NEXT_PUBLIC_APP_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://mini-app-lake-phi.vercel.app");
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

    try {
      await maxSendMessage({
        token: MAX_BOT_TOKEN,
        chatId,
        recipient: replyRecipient,
        recipientUserId: replyRecipient ? undefined : senderId ?? undefined,
        text: `Добрый день!\n\nВижу, что у вас вопрос по перевозке ${cargoNumber}.\n\nВы можете скачать документы прямо здесь:`,
        attachments,
      });
      return res.status(200).json({ ok: true });
    } catch (error: any) {
      console.error("MAX webhook-2 send failed:", error);
    }
  }

  if (rawText) {
    const userText = rawText;
    try {
      const replyTarget = senderId ?? chatId;
      const appDomain = process.env.NEXT_PUBLIC_APP_URL
        || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://mini-app-lake-phi.vercel.app");

      const aiRes = await fetch(`${appDomain}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: `max2_${replyTarget ?? chatId}`,
          userId: String(replyTarget ?? chatId),
          message: userText,
          channel: "max",
        }),
      });

      if (aiRes.ok) {
        const aiData = await aiRes.json();
        await maxSendMessage({
          token: MAX_BOT_TOKEN,
          chatId,
          recipient: replyRecipient,
          recipientUserId: replyRecipient ? undefined : senderId ?? undefined,
          text: aiData.reply,
        });
      } else {
        throw new Error("AI service error");
      }
    } catch (error) {
      console.error("MAX webhook-2 AI failed:", error);
      await maxSendMessage({
        token: MAX_BOT_TOKEN,
        chatId,
        recipient: replyRecipient,
        recipientUserId: replyRecipient ? undefined : senderId ?? undefined,
        text: "Добрый день! Напишите, пожалуйста, ваш вопрос — мы поможем.",
      });
    }
  } else {
    try {
      await maxSendMessage({
        token: MAX_BOT_TOKEN,
        chatId,
        recipient: replyRecipient,
        recipientUserId: replyRecipient ? undefined : senderId ?? undefined,
        text: "Добрый день! Меня зовут Грузик, я AI-помощник HAULZ. Чем могу помочь? 😊",
      });
    } catch (e) {}
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

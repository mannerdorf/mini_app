import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  extractCargoNumberFromPayload,
  getMaxWebhookSecret,
  maxSendMessage,
} from "../lib/maxBot.js";
import { initRequestContext, logError } from "./_lib/observability.js";

// MAX bot token must be stored in Vercel Environment Variables (server-side only)
const MAX_BOT_TOKEN = process.env.MAX_BOT_TOKEN;
const MAX_WEBHOOK_SECRET = process.env.MAX_WEBHOOK_SECRET;
const MAX_LINK_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days (привязка чата к аккаунту)

async function getRedisValue(key: string): Promise<string | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const response = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify([["GET", key]]),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const firstResult = Array.isArray(data) ? data[0] : data;
    if (firstResult?.error) return null;
    const value = firstResult?.result;
    if (value === null || value === undefined) return null;
    return String(value);
  } catch {
    return null;
  }
}

async function setRedisValue(key: string, value: string, ttl?: number): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return false;
  try {
    const pipeline = ttl ? [["SET", key, value], ["EXPIRE", key, ttl]] : [["SET", key, value]];
    const response = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(pipeline),
    });
    if (!response.ok) return false;
    const data = await response.json();
    const firstResult = Array.isArray(data) ? data[0] : data;
    return firstResult?.result === "OK" || firstResult?.result === true;
  } catch {
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "max-webhook");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const debug = String((req.query as any)?.debug ?? "") === "1";
  if (!MAX_BOT_TOKEN) {
    return res.status(500).json({ error: "MAX_BOT_TOKEN is not configured", request_id: ctx.requestId });
  }

  // Optional shared-secret guard (recommended)
  if (MAX_WEBHOOK_SECRET) {
    const incoming = getMaxWebhookSecret(req);
    if (incoming !== MAX_WEBHOOK_SECRET) {
      return res.status(401).json({ error: "Unauthorized", request_id: ctx.requestId });
    }
  }

  const update: any = typeof req.body === "string" ? safeJson(req.body) : req.body;
  if (!update) return res.status(400).json({ error: "Invalid JSON", request_id: ctx.requestId });

  // Логируем весь update для диагностики
  console.log("MAX webhook received full update:", JSON.stringify(update, null, 2));

  // Игнорируем сообщения от бота (не отвечаем сами себе)
  if (update?.message?.sender?.is_bot === true) {
    return res.status(200).json({ ok: true, request_id: ctx.requestId });
  }

  // MAX Update (message_created): update_type, timestamp, message (Message), user_locale.
  // Message: sender (User), recipient (Recipient), body (MessageBody). В диалоге chat_id нет — отвечаем по user_id отправителя.
  const chatId =
    update?.chat_id ??
    update?.chatId ??
    update?.message?.recipient?.chat_id ??
    update?.message?.recipient?.chatId ??
    update?.message?.chat_id ??
    update?.message?.chatId ??
    update?.chat?.id ??
    update?.chat?.chat_id ??
    update?.message?.sender?.user_id ??
    update?.message?.sender?.userId ??
    update?.user?.id ??
    update?.user_id;

  const senderId =
    update?.message?.sender?.user_id ??
    update?.message?.sender?.userId ??
    update?.message?.sender?.id ??
    update?.user?.user_id ??
    update?.user?.userId ??
    update?.user?.id ??
    update?.sender?.user_id ??
    update?.sender?.userId ??
    update?.sender?.id;

  if (!chatId) {
    console.warn("MAX webhook: No chatId found in update:", JSON.stringify(update));
    return res.status(200).json({ ok: true, request_id: ctx.requestId });
  }

  // Текст: message_created — из message.body; bot_started — из update.payload (диплинк ?start=...)
  let rawText: string =
    update?.payload ??
    update?.message?.body?.text ??
    update?.message?.body?.content ??
    update?.message?.text ??
    update?.message?.content ??
    update?.text ??
    update?.start_param ??
    update?.startapp ??
    update?.start_app ??
    update?.message?.start_param ??
    update?.message?.startapp ??
    update?.message?.start_app ??
    update?.message?.body?.payload ??
    update?.data?.start_param ??
    update?.data?.startapp ??
    update?.data?.text ??
    "";
  if (!rawText && Array.isArray(update?.message?.body?.parts)) {
    const part = update.message.body.parts.find((p: any) => p?.text ?? p?.content);
    rawText = (part?.text ?? part?.content ?? "") as string;
  }
  if (typeof rawText !== "string" && rawText != null) {
    if (typeof (rawText as any)?.text === "string") rawText = (rawText as any).text;
    else if (typeof (rawText as any)?.content === "string") rawText = (rawText as any).content;
    else rawText = String(rawText);
  }
  rawText = String(rawText ?? "").trim();

  // Также проверяем тип события (может быть "start" или "message")
  const eventType = update?.type ?? update?.event ?? update?.message?.type ?? "";

  console.log("MAX webhook parsed:", JSON.stringify({ 
    chatId, 
    senderId,
    replyUserId: senderId ?? null,
    rawText, 
    eventType,
    hasMessage: !!update?.message,
    hasData: !!update?.data,
    keys: Object.keys(update)
  }));

  const recipientFromUpdate = update?.message?.recipient ?? null;
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
        tokenConfigured: !!MAX_BOT_TOKEN,
        tokenLength: cleanToken.length,
        tokenMasked:
          cleanToken.length >= 8
            ? `${cleanToken.slice(0, 4)}...${cleanToken.slice(-4)}`
            : "(short)",
        chatId,
        senderId,
        rawText,
        recipient: recipientFromUpdate,
        replyRecipient,
      },
      request_id: ctx.requestId,
    });
  }

  // Привязка аккаунта (по аналогии с Telegram): startapp=haulz_auth_{token}
  if (rawText.startsWith("haulz_auth_")) {
    const token = rawText.replace("haulz_auth_", "").trim();
    const raw = await getRedisValue(`max:link:${token}`);
    if (!raw) {
      await maxSendMessage({
        token: MAX_BOT_TOKEN,
        chatId,
        recipient: replyRecipient,
        recipientUserId: replyRecipient ? undefined : senderId ?? undefined,
        text: "Ссылка устарела. Откройте бота из мини‑приложения ещё раз.",
      });
      return res.status(200).json({ ok: true, request_id: ctx.requestId });
    }
    let parsed: any = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    const chatIdStr = String(chatId);
    const senderIdStr = senderId != null ? String(senderId) : null;
    const saved = await setRedisValue(`max:bind:${chatIdStr}`, raw, MAX_LINK_TTL_SECONDS);
    if (senderIdStr && senderIdStr !== chatIdStr) {
      await setRedisValue(`max:bind:${senderIdStr}`, raw, MAX_LINK_TTL_SECONDS);
    }
    if (!saved) {
      await maxSendMessage({
        token: MAX_BOT_TOKEN,
        chatId,
        recipient: replyRecipient,
        recipientUserId: replyRecipient ? undefined : senderId ?? undefined,
        text: "Не удалось сохранить привязку. Попробуйте позже.",
      });
      return res.status(200).json({ ok: true, request_id: ctx.requestId });
    }
    if (parsed?.login) {
      const loginKey = String(parsed.login).trim().toLowerCase();
      await setRedisValue(`max:by_login:${loginKey}`, chatIdStr);
      if (loginKey !== String(parsed.login).trim()) {
        await setRedisValue(`max:by_login:${String(parsed.login).trim()}`, chatIdStr);
      }
    }
    if (parsed?.customer) {
      await setRedisValue(`max:by_customer:${parsed.customer}`, chatIdStr);
    }
    const customerLabel = parsed?.customer || parsed?.login || "не указан";
    await maxSendMessage({
      token: MAX_BOT_TOKEN,
      chatId,
      recipient: replyRecipient,
      recipientUserId: replyRecipient ? undefined : senderId ?? undefined,
      text: `Готово! Аккаунт привязан.\nЗаказчик: ${customerLabel}\nТеперь можно писать в чат.`,
    });
    return res.status(200).json({ ok: true, request_id: ctx.requestId });
  }

  const cargoNumber = extractCargoNumberFromPayload(rawText);
  
  console.log("MAX webhook cargo number extracted:", cargoNumber);

  // Если это событие bot_started с payload — даем кнопки документов
  if (cargoNumber) {
    console.log("Cargo number extracted:", cargoNumber);
    
    // Получаем домен из env или используем дефолтный
    const appDomain = process.env.NEXT_PUBLIC_APP_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://mini-app-lake-phi.vercel.app");
    
    // Используем /api/doc-short для редиректа на мини-апп
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
      return res.status(200).json({ ok: true, request_id: ctx.requestId });
    } catch (error: any) {
      logError(ctx, "max_webhook_doc_reply_failed", error);
      console.error("Failed to send message:", error);
    }
  }

  // Если это обычное текстовое сообщение — отвечаем через ИИ, с авторизацией из привязки
  if (rawText) {
    const userText = rawText;
    console.log("MAX webhook: AI request for text:", userText.slice(0, 100));

    try {
      const replyTarget = senderId ?? chatId;
      const chatIdStr = String(chatId);
      const senderIdStr = senderId != null ? String(senderId) : null;
      // Берём привязанный аккаунт из Redis. В MAX при bot_started приходит chat_id, при message_created — часто только sender.user_id; ищем по обоим
      let maxAuth: { login?: string; password?: string; customer?: string; inn?: string } = {};
      let bindRaw = await getRedisValue(`max:bind:${chatIdStr}`);
      if (!bindRaw && senderIdStr && senderIdStr !== chatIdStr) {
        bindRaw = await getRedisValue(`max:bind:${senderIdStr}`);
      }
      if (bindRaw) {
        try {
          const parsed = JSON.parse(bindRaw);
          if (parsed?.login && parsed?.password) {
            maxAuth = {
              login: String(parsed.login).trim(),
              password: String(parsed.password).trim(),
              customer: typeof parsed.customer === "string" ? String(parsed.customer).trim() || undefined : undefined,
              inn: typeof parsed.inn === "string" ? String(parsed.inn).trim() || undefined : undefined,
            };
            console.log("MAX webhook: using linked account, customer:", maxAuth.customer ?? "(none)", "inn:", maxAuth.inn ?? "(none)");
          }
        } catch (_) {}
      }
      if (!maxAuth.login && !maxAuth.password) {
        console.log("MAX webhook: no linked account for chatId", chatIdStr, "senderId", senderIdStr);
      }

      const appDomain = process.env.NEXT_PUBLIC_APP_URL
        || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://mini-app-lake-phi.vercel.app");
      const chatUrl = `${appDomain}/api/chat`;

      // Сессия привязана к заказчику: при смене заказчика и повторной привязке — новая сессия, данные только по текущему заказчику
      const sessionFingerprint = (maxAuth.customer || maxAuth.login || "anon").replace(/[^a-zA-Z0-9А-Яа-я._-]/g, "_").slice(0, 60);
      const sessionId = `max_${replyTarget ?? chatId}_${sessionFingerprint}`;

      const aiRes = await fetch(chatUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          userId: String(replyTarget ?? chatId),
          message: userText,
          channel: "max",
          auth: maxAuth.login && maxAuth.password ? { login: maxAuth.login, password: maxAuth.password, ...(maxAuth.inn ? { inn: maxAuth.inn } : {}) } : undefined,
          customer: maxAuth.customer != null && String(maxAuth.customer).trim() !== "" ? String(maxAuth.customer).trim() : undefined,
        }),
      });

      const aiRaw = await aiRes.text();
      let aiData: { reply?: string; error?: string } = {};
      try {
        aiData = aiRaw ? JSON.parse(aiRaw) : {};
      } catch {
        aiData = { reply: aiRaw || "" };
      }

      if (aiRes.ok) {
        const replyText = (aiData.reply && String(aiData.reply).trim()) || "Чем могу помочь?";
        await maxSendMessage({
          token: MAX_BOT_TOKEN,
          chatId,
          recipient: replyRecipient,
          recipientUserId: replyRecipient ? undefined : senderId ?? undefined,
          text: replyText,
        });
      } else {
        console.error("MAX webhook: /api/chat error", aiRes.status, aiRaw?.slice(0, 300));
        await maxSendMessage({
          token: MAX_BOT_TOKEN,
          chatId,
          recipient: replyRecipient,
          recipientUserId: replyRecipient ? undefined : senderId ?? undefined,
          text: "Временная ошибка чата. Попробуйте через минуту.",
        });
      }
    } catch (error: any) {
      logError(ctx, "max_webhook_ai_or_send_failed", error);
      console.error("MAX webhook: AI or send failed:", error?.message || error);
      try {
        await maxSendMessage({
          token: MAX_BOT_TOKEN,
          chatId,
          recipient: replyRecipient,
          recipientUserId: replyRecipient ? undefined : senderId ?? undefined,
          text: "Добрый день! Напишите, пожалуйста, ваш вопрос — мы поможем.",
        });
      } catch (e2: any) {
        logError(ctx, "max_webhook_fallback_send_failed", e2);
        console.error("MAX webhook: fallback send failed:", e2?.message || e2);
      }
    }
  } else {
    // Входящее событие без текста (например, нажатие кнопки без данных)
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

  return res.status(200).json({ ok: true, request_id: ctx.requestId });
}

function safeJson(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";
import fs from "node:fs";

const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TG_MAX_MESSAGE_LENGTH = 4096;
const TG_BOT_LINK_BASE = "https://t.me/Haulzapp_bot?startapp=haulz_n_";
const TG_LINK_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

async function getRedisValue(key: string): Promise<string | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    const response = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
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
    const pipeline = ttl
      ? [["SET", key, value], ["EXPIRE", key, ttl]]
      : [["SET", key, value]];
    const response = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
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
  let userText = update?.message?.text || update?.callback_query?.data;
  const voice = update?.message?.voice || update?.message?.audio;

  if (!chatId || (!userText && !voice?.file_id)) {
    if (debug) {
      return res.status(200).json({
        ok: true,
        debug: {
          tgTokenConfigured: true,
          chatId,
          userText,
          hasVoice: Boolean(voice?.file_id),
          reason: "missing chatId or userText",
        }
      });
    }
    return res.status(200).json({ ok: true });
  }

  // Обработка /start с параметрами
  if (userText && userText.startsWith("/start ")) {
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

    if (payload.startsWith("haulz_auth_")) {
      const token = payload.replace("haulz_auth_", "");
      const raw = await getRedisValue(`tg:link:${token}`);
      if (!raw) {
        await sendTgMessageChunked(chatId, "Ссылка устарела. Откройте бота из мини‑приложения ещё раз.");
        return res.status(200).json({ ok: true });
      }
      let parsed: any = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null;
      }
      const saved = await setRedisValue(`tg:bind:${chatId}`, raw, TG_LINK_TTL_SECONDS);
      if (!saved) {
        await sendTgMessageChunked(chatId, "Не удалось сохранить привязку. Попробуйте позже.");
        return res.status(200).json({ ok: true });
      }
      if (parsed?.login) {
        const loginKey = String(parsed.login).trim().toLowerCase();
        await setRedisValue(`tg:by_login:${loginKey}`, String(chatId));
        if (loginKey !== String(parsed.login).trim()) {
          await setRedisValue(`tg:by_login:${String(parsed.login).trim()}`, String(chatId));
        }
      }
      if (parsed?.customer) {
        await setRedisValue(`tg:by_customer:${parsed.customer}`, String(chatId));
      }
      const customerLabel = parsed?.customer || parsed?.login || "не указан";
      await sendTgMessageChunked(
        chatId,
        `Готово! Аккаунт привязан.\nЗаказчик: ${customerLabel}\nТеперь можно писать в чат.`,
      );
      return res.status(200).json({ ok: true });
    }
  }

  // Обычное сообщение — через ИИ
  const debugInfo: any = debug
    ? { tgTokenConfigured: true, chatId, userText, hasVoice: Boolean(voice?.file_id) }
    : null;

  try {
    if (!userText && voice?.file_id) {
      if (!OPENAI_API_KEY) {
        await sendTgMessageChunked(chatId, "Ошибка: OPENAI_API_KEY не настроен.");
        if (debugInfo) debugInfo.transcribe = { error: "OPENAI_API_KEY missing" };
        return res.status(200).json({ ok: true, debug: debugInfo });
      }
      const filePath = await downloadTelegramFile(voice.file_id);
      try {
        const transcript = await transcribeTelegramAudio(filePath);
        userText = transcript?.trim() || "";
        if (debugInfo) debugInfo.transcribe = { text: userText };
        if (!userText) {
          await sendTgMessageChunked(chatId, "Не удалось распознать речь.");
          return res.status(200).json({ ok: true, debug: debugInfo });
        }
      } finally {
        fs.promises.unlink(filePath).catch(() => {});
      }
    }

    const boundRaw = await getRedisValue(`tg:bind:${chatId}`);
    if (!boundRaw) {
      await sendTgMessageChunked(chatId, "Сначала откройте бота из мини‑приложения, чтобы привязать аккаунт.");
      return res.status(200).json({ ok: true, debug: debugInfo });
    }
    let bound: any = null;
    try {
      bound = JSON.parse(boundRaw);
    } catch {
      bound = null;
    }
    if (!bound) {
      await sendTgMessageChunked(chatId, "Сначала откройте бота из мини‑приложения, чтобы привязать аккаунт.");
      return res.status(200).json({ ok: true, debug: debugInfo });
    }
    const boundCustomer = bound?.customer || null;
    const boundAuth = bound?.login && bound?.password
      ? { login: bound.login, password: bound.password }
      : undefined;
    if (debugInfo) {
      debugInfo.bound = { hasAuth: !!boundAuth, customer: boundCustomer };
    }

    const appDomain = process.env.NEXT_PUBLIC_APP_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://mini-app-lake-phi.vercel.app");
    if (debugInfo) debugInfo.appDomain = appDomain;
    const aiRes = await fetch(`${appDomain}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        sessionId: `tg_${chatId}_${boundCustomer || bound?.accountId || "anon"}`,
        userId: String(chatId),
        message: userText,
        customer: boundCustomer || undefined,
        auth: boundAuth,
        channel: "telegram"
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
      const replyText = aiData.reply || "Не удалось получить ответ.";
      await sendTgMessageChunked(chatId, replyText, { formatLinks: true });
    } else {
      const errorText = aiData?.error || aiData?.message || raw || "Ошибка сервера";
      await sendTgMessageChunked(chatId, `Ошибка: ${errorText}`, { formatLinks: false });
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

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

function formatTelegramHtmlWithLinks(text: string) {
  const cargoRegex = /(?:№\s*)?(\d{4,})/g;
  const raw = String(text);
  let lastIndex = 0;
  let result = "";
  let match: RegExpExecArray | null;

  while ((match = cargoRegex.exec(raw))) {
    const [fullMatch, num] = match;
    const start = match.index;
    const end = start + fullMatch.length;
    const safeNum = String(num || "").trim();

    result += escapeHtml(raw.slice(lastIndex, start));
    if (safeNum) {
      const url = `${TG_BOT_LINK_BASE}${safeNum}`;
      result += `<a href="${escapeHtml(url)}">№ ${escapeHtml(safeNum)}</a>`;
    } else {
      result += escapeHtml(fullMatch);
    }
    lastIndex = end;
  }

  result += escapeHtml(raw.slice(lastIndex));
  return result || escapeHtml(raw);
}

async function sendTgMessage(chatId: number, text: string, replyMarkup?: any) {
  const res = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      reply_markup: replyMarkup,
      parse_mode: "HTML",
      disable_web_page_preview: true
    })
  });
  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    console.error("TG sendMessage failed:", res.status, raw);
  }
}

async function sendTgMessageChunked(
  chatId: number,
  text: unknown,
  options?: { replyMarkup?: any; formatLinks?: boolean },
) {
  let safeText = normalizeText(text).trim();
  if (!safeText) safeText = "Ответ пустой.";
  const chunks = splitTelegramMessage(safeText, TG_MAX_MESSAGE_LENGTH - 200);
  for (let i = 0; i < chunks.length; i += 1) {
    const formatted = options?.formatLinks ? formatTelegramHtmlWithLinks(chunks[i]) : escapeHtml(chunks[i]);
    await sendTgMessage(chatId, formatted, i === 0 ? options?.replyMarkup : undefined);
  }
}

async function downloadTelegramFile(fileId: string): Promise<string> {
  const metaRes = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`);
  const meta = await metaRes.json().catch(() => ({}));
  if (!metaRes.ok || !meta?.ok || !meta?.result?.file_path) {
    throw new Error(meta?.description || "getFile failed");
  }
  const filePath = String(meta.result.file_path);
  const fileUrl = `https://api.telegram.org/file/bot${TG_BOT_TOKEN}/${filePath}`;
  const fileRes = await fetch(fileUrl);
  if (!fileRes.ok) {
    throw new Error(`download failed: ${fileRes.status}`);
  }
  const buffer = Buffer.from(await fileRes.arrayBuffer());
  const ext = filePath.split(".").pop() || "ogg";
  const localPath = `/tmp/tg_voice_${Date.now()}_${Math.random().toString(16).slice(2)}.${ext}`;
  await fs.promises.writeFile(localPath, buffer);
  return localPath;
}

async function transcribeTelegramAudio(filePath: string): Promise<string> {
  const client = new OpenAI({ apiKey: OPENAI_API_KEY });
  const response = await client.audio.transcriptions.create({
    model: "whisper-1",
    file: fs.createReadStream(filePath),
  });
  return String(response.text || "");
}

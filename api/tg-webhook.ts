import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";
import fs from "node:fs";
import { getPool } from "./_db.js";
import { sendTelegramActivationEmail } from "../lib/sendTelegramActivationEmail.js";
import { writeAuditLog } from "../lib/adminAuditLog.js";

const TG_BOT_TOKEN = process.env.HAULZ_TELEGRAM_BOT_TOKEN || process.env.TG_BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TG_MAX_MESSAGE_LENGTH = 4096;
const TG_BOT_LINK_BASE = "https://t.me/HAULZinfobot?startapp=haulz_n_";
const TG_LINK_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const TG_ACTIVATION_CODE_TTL_SECONDS = 60 * 10; // 10 minutes

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

async function deleteRedisValue(key: string): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return false;
  try {
    const response = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([["DEL", key]]),
    });
    if (!response.ok) return false;
    const data = await response.json();
    const firstResult = Array.isArray(data) ? data[0] : data;
    return typeof firstResult?.result === "number" ? firstResult.result > 0 : false;
  } catch {
    return false;
  }
}

type TgActivationCandidate = {
  login: string;
  inn: string | null;
  customerName: string | null;
  email: string | null;
  active: boolean;
};

function random6(): string {
  let s = "";
  for (let i = 0; i < 6; i += 1) s += Math.floor(Math.random() * 10);
  return s;
}

function normalizeInn(s: string): string {
  return s.replace(/\D/g, "").trim();
}

function looksLikeInn(s: string): boolean {
  const v = normalizeInn(s);
  return v.length === 10 || v.length === 12;
}

function normalizeLoginInput(s: string): string {
  return String(s || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
}

async function findActivationCandidateByLogin(loginRaw: string): Promise<TgActivationCandidate | null> {
  const login = normalizeLoginInput(loginRaw);
  if (!login) return null;
  const pool = getPool();
  const { rows } = await pool.query<{
    login: string;
    inn: string | null;
    customer_name: string | null;
    email: string | null;
    active: boolean | null;
  }>(
    `select
       ru.login,
       ac.inn,
       coalesce(cc.customer_name, ru.company_name, '') as customer_name,
       coalesce(cc.email, ru.login) as email,
       ru.active
     from registered_users ru
     left join lateral (
       select inn
       from account_companies
       where lower(trim(login)) = lower(trim(ru.login))
       order by created_at asc
       limit 1
     ) ac on true
     left join cache_customers cc on cc.inn = ac.inn
     where lower(trim(ru.login)) = $1
     order by ru.active desc nulls last
     limit 1`,
    [login]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    login: row.login,
    inn: row.inn ?? null,
    customerName: row.customer_name ?? null,
    email: row.email ?? null,
    active: row.active !== false,
  };
}

async function findActivationCandidateByInn(innRaw: string): Promise<TgActivationCandidate | null> {
  const inn = normalizeInn(innRaw);
  if (!inn) return null;
  const pool = getPool();
  const { rows } = await pool.query<{
    login: string;
    inn: string;
    customer_name: string | null;
    email: string | null;
  }>(
    `select
       ru.login,
       ac.inn,
       coalesce(cc.customer_name, ru.company_name, '') as customer_name,
       cc.email
     from account_companies ac
     join registered_users ru on lower(trim(ru.login)) = lower(trim(ac.login))
     left join cache_customers cc on cc.inn = ac.inn
     where ac.inn = $1 and ru.active = true
     order by ru.id asc
     limit 1`,
    [inn]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    login: row.login,
    inn: row.inn,
    customerName: row.customer_name ?? null,
    email: row.email ?? null,
    active: true,
  };
}

async function upsertTelegramChatLink(args: {
  login: string;
  inn?: string | null;
  customerName?: string | null;
  chatId: string;
  telegramUserId?: string | null;
  status: "pending" | "active" | "disabled";
  activationCodeSentAt?: boolean;
}) {
  const pool = getPool();
  await pool.query(
    `insert into telegram_chat_links
       (login, inn, customer_name, telegram_chat_id, telegram_user_id, chat_status, activation_code_sent_at, activated_at, last_seen_at, updated_at)
     values
       ($1, $2, $3, $4, $5, $6, case when $7 then now() else null end, case when $6 = 'active' then now() else null end, now(), now())
     on conflict ((lower(trim(login))))
     do update set
       inn = excluded.inn,
       customer_name = excluded.customer_name,
       telegram_chat_id = excluded.telegram_chat_id,
       telegram_user_id = excluded.telegram_user_id,
       chat_status = excluded.chat_status,
       activation_code_sent_at = case when $7 then now() else telegram_chat_links.activation_code_sent_at end,
       activated_at = case when excluded.chat_status = 'active' then now() else telegram_chat_links.activated_at end,
       last_seen_at = now(),
       updated_at = now()`,
    [
      args.login,
      args.inn ?? null,
      args.customerName ?? null,
      args.chatId,
      args.telegramUserId ?? null,
      args.status,
      !!args.activationCodeSentAt,
    ]
  );
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

  try {
  const update = req.body || {};
  console.log("TG Webhook update:", JSON.stringify(update));

  const chatId = update?.message?.chat?.id || update?.callback_query?.message?.chat?.id;
  const fromUserId = update?.message?.from?.id ? String(update?.message?.from?.id) : null;
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

  const chatIdStr = String(chatId);
  const startText = typeof userText === "string" ? userText.trim() : "";

  // Обработка /start с параметрами и запуск активации.
  if (startText.startsWith("/start")) {
    const payload = startText.includes(" ") ? startText.split(" ")[1] : "";
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

    await setRedisValue(
      `tg:onboarding:${chatIdStr}`,
      JSON.stringify({ step: "await_login_or_inn", startedAt: new Date().toISOString() }),
      60 * 60 * 24
    );
    await sendTgMessageChunked(
      chatId,
      "Добрый день! Для активации бота HAULZ введите логин или ИНН."
    );
    return res.status(200).json({ ok: true });
  }

  // Telegram onboarding без диплинка: логин/ИНН -> пин на email -> активация.
  if (typeof userText === "string" && !voice?.file_id) {
    const onboardingKey = `tg:onboarding:${chatIdStr}`;
    const activationCodeKey = `tg:activation:code:${chatIdStr}`;
    const onboardingRaw = await getRedisValue(onboardingKey);
    const boundRaw = await getRedisValue(`tg:bind:${chatIdStr}`);
    let onboarding: { step?: string; login?: string; inn?: string | null; customerName?: string | null } | null = null;
    try {
      onboarding = onboardingRaw ? JSON.parse(onboardingRaw) : null;
    } catch {
      onboarding = null;
    }

    if (!boundRaw || onboarding?.step) {
      const input = String(userText || "").trim();

      if (onboarding?.step === "await_pin") {
        const pin = input.replace(/\D/g, "").slice(0, 6);
        if (pin.length !== 6) {
          await sendTgMessageChunked(chatId, "Введите пин-код из 6 цифр, который пришел на почту.");
          return res.status(200).json({ ok: true });
        }
        const rawCodePayload = await getRedisValue(activationCodeKey);
        let codePayload: {
          code: string;
          login: string;
          inn?: string | null;
          customerName?: string | null;
          email?: string | null;
        } | null = null;
        try {
          codePayload = rawCodePayload ? JSON.parse(rawCodePayload) : null;
        } catch {
          codePayload = null;
        }
        if (!codePayload || codePayload.code !== pin) {
          await sendTgMessageChunked(chatId, "Неверный пин-код или срок действия истек. Введите логин или ИНН заново.");
          await deleteRedisValue(activationCodeKey);
          await deleteRedisValue(onboardingKey);
          return res.status(200).json({ ok: true });
        }

        const bindPayload = JSON.stringify({
          login: codePayload.login,
          inn: codePayload.inn ?? null,
          customer: codePayload.customerName ?? null,
          source: "telegram_onboarding",
          linkedAt: new Date().toISOString(),
        });
        await setRedisValue(`tg:bind:${chatIdStr}`, bindPayload, TG_LINK_TTL_SECONDS);
        const loginKey = String(codePayload.login).trim().toLowerCase();
        await setRedisValue(`tg:by_login:${loginKey}`, chatIdStr);
        if (loginKey !== String(codePayload.login).trim()) {
          await setRedisValue(`tg:by_login:${String(codePayload.login).trim()}`, chatIdStr);
        }
        if (codePayload.customerName) {
          await setRedisValue(`tg:by_customer:${codePayload.customerName}`, chatIdStr);
        }
        try {
          await upsertTelegramChatLink({
            login: codePayload.login,
            inn: codePayload.inn ?? null,
            customerName: codePayload.customerName ?? null,
            chatId: chatIdStr,
            telegramUserId: fromUserId,
            status: "active",
          });
        } catch (e) {
          console.error("telegram_chat_links upsert(active) failed:", e);
        }
        await deleteRedisValue(activationCodeKey);
        await deleteRedisValue(onboardingKey);
        await sendTgMessageChunked(chatId, "Готово! Чат активирован. Теперь уведомления будут приходить в Telegram.");
        return res.status(200).json({ ok: true });
      }

      if (!input) {
        await sendTgMessageChunked(chatId, "Для активации бота HAULZ введите логин или ИНН.");
        return res.status(200).json({ ok: true });
      }

      let candidate: TgActivationCandidate | null = null;
      try {
        candidate = looksLikeInn(input)
          ? await findActivationCandidateByInn(input)
          : await findActivationCandidateByLogin(input);
      } catch (e) {
        console.error("telegram activation lookup failed:", e);
        await sendTgMessageChunked(chatId, "Не удалось проверить логин/ИНН. Попробуйте позже.");
        return res.status(200).json({ ok: true });
      }
      if (!candidate) {
        await sendTgMessageChunked(
          chatId,
          "Пользователь не найден в списке зарегистрированных пользователей. Проверьте логин или ИНН и попробуйте снова."
        );
        return res.status(200).json({ ok: true });
      }
      if (!candidate.active) {
        await sendTgMessageChunked(chatId, "Пользователь найден, но деактивирован. Обратитесь к администратору.");
        return res.status(200).json({ ok: true });
      }

      const email = String(candidate.email || "").trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        await sendTgMessageChunked(chatId, "Для этого пользователя не найден email для отправки PIN. Обратитесь в поддержку.");
        return res.status(200).json({ ok: true });
      }

      const code = random6();
      const codePayload = {
        code,
        login: candidate.login,
        inn: candidate.inn,
        customerName: candidate.customerName,
        email,
      };
      const savedCode = await setRedisValue(
        activationCodeKey,
        JSON.stringify(codePayload),
        TG_ACTIVATION_CODE_TTL_SECONDS
      );
      if (!savedCode) {
        await sendTgMessageChunked(chatId, "Не удалось создать пин-код. Попробуйте позже.");
        return res.status(200).json({ ok: true });
      }
      await setRedisValue(
        onboardingKey,
        JSON.stringify({
          step: "await_pin",
          login: candidate.login,
          inn: candidate.inn ?? null,
          customerName: candidate.customerName ?? null,
        }),
        TG_ACTIVATION_CODE_TTL_SECONDS
      );

      try {
        const pool = getPool();
        const sent = await sendTelegramActivationEmail(
          pool,
          email,
          code,
          candidate.customerName || candidate.login
        );
        if (!sent.ok) {
          await writeAuditLog(pool, {
            action: "email_delivery_telegram_pin_failed",
            target_type: "telegram",
            details: {
              login: candidate.login,
              inn: candidate.inn ?? null,
              chat_id: chatIdStr,
              error: sent.error || "unknown_error",
            },
          });
          await sendTgMessageChunked(chatId, `Пин-код не отправлен: ${sent.error || "ошибка почты"}`);
          return res.status(200).json({ ok: true });
        }
        await writeAuditLog(pool, {
          action: "email_delivery_telegram_pin_sent",
          target_type: "telegram",
          details: {
            login: candidate.login,
            inn: candidate.inn ?? null,
            chat_id: chatIdStr,
          },
        });
      } catch (e) {
        console.error("telegram activation email failed:", e);
        try {
          const pool = getPool();
          await writeAuditLog(pool, {
            action: "email_delivery_telegram_pin_failed",
            target_type: "telegram",
            details: {
              login: candidate.login,
              inn: candidate.inn ?? null,
              chat_id: chatIdStr,
              error: (e as Error)?.message || "exception",
            },
          });
        } catch {}
        await sendTgMessageChunked(chatId, "Не удалось отправить пин-код на почту. Попробуйте позже.");
        return res.status(200).json({ ok: true });
      }

      try {
        await upsertTelegramChatLink({
          login: candidate.login,
          inn: candidate.inn ?? null,
          customerName: candidate.customerName ?? null,
          chatId: chatIdStr,
          telegramUserId: fromUserId,
          status: "pending",
          activationCodeSentAt: true,
        });
      } catch (e) {
        console.error("telegram_chat_links upsert(pending) failed:", e);
      }

      await sendTgMessageChunked(
        chatId,
        "Пин-код для активации направлен на почту. Введите его в чат для завершения активации."
      );
      return res.status(200).json({ ok: true });
    }
  }

  // Обычное сообщение — через ИИ
  const debugInfo: any = debug
    ? { tgTokenConfigured: true, chatId, userText, hasVoice: Boolean(voice?.file_id) }
    : null;

  let typingInterval: ReturnType<typeof setInterval> | undefined;
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
      await sendTgMessageChunked(chatId, "Для активации бота HAULZ введите логин или ИНН.");
      return res.status(200).json({ ok: true, debug: debugInfo });
    }
    let bound: any = null;
    try {
      bound = JSON.parse(boundRaw);
    } catch {
      bound = null;
    }
    if (!bound) {
      await sendTgMessageChunked(chatId, "Для активации бота HAULZ введите логин или ИНН.");
      return res.status(200).json({ ok: true, debug: debugInfo });
    }
    const boundCustomer = bound?.customer || null;
    const boundAuth = bound?.login && bound?.password
      ? { login: bound.login, password: bound.password, ...(bound?.inn ? { inn: String(bound.inn).trim() } : {}) }
      : undefined;
    if (debugInfo) {
      debugInfo.bound = { hasAuth: !!boundAuth, customer: boundCustomer };
    }

    const appDomain = process.env.NEXT_PUBLIC_APP_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://mini-app-lake-phi.vercel.app");
    if (debugInfo) debugInfo.appDomain = appDomain;
    await sendTgChatAction(chatId, "typing");
    typingInterval = setInterval(() => { sendTgChatAction(chatId, "typing"); }, 4000);
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

    clearInterval(typingInterval);
    if (aiRes.ok) {
      const replyText = aiData.reply || "Не удалось получить ответ.";
      await sendTgMessageChunked(chatId, replyText, { formatLinks: true });
    } else {
      console.error("TG chat API error:", aiRes.status, raw?.slice?.(0, 500));
      await sendTgMessageChunked(chatId, "Временная ошибка чата. Попробуйте через минуту.", { formatLinks: false });
    }
  } catch (e) {
    if (typingInterval !== undefined) clearInterval(typingInterval);
    if (debugInfo) debugInfo.error = String((e as any)?.message || e);
    console.error("TG AI error:", e);
    try {
      await sendTgMessageChunked(chatId, "Произошла ошибка. Попробуйте позже.", { formatLinks: false });
    } catch (_) {}
  }

  if (debug) {
    return res.status(200).json({ ok: true, debug: debugInfo });
  }
  return res.status(200).json({ ok: true });
  } catch (outerErr: any) {
    console.error("TG webhook error:", outerErr?.message || outerErr, outerErr?.stack);
    try {
      const body = req?.body || {};
      const cid = body?.message?.chat?.id ?? body?.callback_query?.message?.chat?.id;
      if (typeof cid === "number" && TG_BOT_TOKEN) {
        await sendTgMessageChunked(cid, "Произошла ошибка. Попробуйте позже.");
      }
    } catch (_) {}
    return res.status(200).json({ ok: true });
  }
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

/** Номера перевозок — 6+ цифр. Года (4 цифры) не матчим, чтобы не получать «№ 2026 года». */
function formatTelegramHtmlWithLinks(text: string) {
  const cargoRegex = /(?:№\s*)?(\d{6,})/g;
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

async function sendTgChatAction(chatId: number, action: string) {
  if (!TG_BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action }),
    });
  } catch (_) {}
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

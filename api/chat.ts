import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";
import { getPool } from "./_db.js";
import { searchSimilar, upsertDocument } from "../lib/rag.js";

type ChatRole = "system" | "user" | "assistant";

function coerceBody(req: VercelRequest): any {
  let body: any = req.body;
  if (typeof body === "string") {
    body = JSON.parse(body);
  }
  return body ?? {};
}

function getAppDomain() {
  return process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_APP_URL || "https://mini-app-lake-phi.vercel.app";
}

function extractCargoNumber(text: string) {
  const match = text.match(/(?:№\s*)?(\d{4,})/);
  return match?.[1] || null;
}

function extractLastCargoNumberFromHistory(rows: { role: ChatRole; content: string }[]) {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (!row?.content) continue;
    const number = extractCargoNumber(row.content);
    if (number) return number;
  }
  return null;
}

function extractDocMethods(text: string) {
  const lower = text.toLowerCase();
  const methods: string[] = [];
  if (/\bэр\b/.test(lower)) methods.push("ЭР");
  if (/сч[её]т/.test(lower)) methods.push("СЧЕТ");
  if (/\bупд\b/.test(lower)) methods.push("УПД");
  if (/\bапп\b/.test(lower)) methods.push("АПП");
  return Array.from(new Set(methods));
}

async function makeTinyUrl(url: string) {
  const apiToken = process.env.TINYURL_API_TOKEN;
  if (!apiToken) return url;
  try {
    const response = await fetch("https://api.tinyurl.com/create", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ url, domain: "tinyurl.com" }),
    });
    const raw = await response.text();
    let data: any = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { raw };
    }
    if (!response.ok) {
      console.warn("TinyURL error:", response.status, data?.errors || data?.message || data);
      return url;
    }
    return data?.data?.tiny_url || data?.tiny_url || url;
  } catch (err: any) {
    console.warn("TinyURL failed:", err?.message || err);
    return url;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = coerceBody(req);
    const { sessionId, userId, message, messages, context, customer, action } = body;

    const sid =
      typeof sessionId === "string" && sessionId.trim()
        ? sessionId.trim()
        : crypto.randomUUID();

    const pool = getPool();

    if (action === "history") {
      if (!sessionId || typeof sessionId !== "string") {
        return res.status(400).json({ error: "sessionId is required" });
      }
      const history = await pool.query<{
        role: ChatRole;
        content: string;
      }>(
        `select role, content
         from chat_messages
         where session_id = $1
         order by created_at asc
         limit 50`,
        [sid],
      );
      return res.status(200).json({ sessionId: sid, history: history.rows });
    }

    // Поддержка двух форматов:
    // 1. Простой формат: { message, sessionId?, userId? }
    // 2. Формат с массивом сообщений: { messages, context?, sessionId?, userId? }
    const userMessage = message || (Array.isArray(messages) && messages.length > 0 ? messages[messages.length - 1]?.content : null);
    
    if (!userMessage || typeof userMessage !== "string") {
      return res.status(400).json({ error: "message or messages array is required" });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "OPENAI_API_KEY is not configured" });
    }
    await pool.query(
      `insert into chat_sessions (id, user_id)
       values ($1, $2)
       on conflict (id) do update
         set user_id = coalesce(chat_sessions.user_id, excluded.user_id),
             updated_at = now()`,
      [sid, typeof userId === "string" ? userId : null],
    );

    // Сохраняем пользовательское сообщение в БД
    await pool.query(
      `insert into chat_messages (session_id, role, content)
       values ($1, 'user', $2)`,
      [sid, userMessage],
    );

    // Получаем историю из БД
    const history = await pool.query<{
      role: ChatRole;
      content: string;
    }>(
      `select role, content
       from chat_messages
       where session_id = $1
       order by created_at desc
       limit 20`,
      [sid],
    );

    const docMethods = extractDocMethods(userMessage);
    if (docMethods.length > 0) {
      const cargoNumber =
        extractCargoNumber(userMessage) ||
        extractLastCargoNumberFromHistory(history.rows);
      let reply = "";
      if (!cargoNumber) {
        reply = "Пожалуйста, укажите номер перевозки, чтобы я дал ссылку на документ.";
      } else {
        const appDomain = getAppDomain();
        const links = await Promise.all(
          docMethods.map(async (method) => {
            const url = `${appDomain}/api/doc-short?metod=${encodeURIComponent(method)}&number=${encodeURIComponent(cargoNumber)}`;
            const shortUrl = await makeTinyUrl(url);
            return { method, url: shortUrl };
          }),
        );
        const lines = links.map((item) => `• ${item.method}: ${item.url}`);
        reply = `Вот то, что вы просили по перевозке № ${cargoNumber}:\n${lines.join("\n")}`;
      }

      await pool.query(
        `insert into chat_messages (session_id, role, content)
         values ($1, 'assistant', $2)`,
        [sid, reply],
      );
      await pool.query(`update chat_sessions set updated_at = now() where id = $1`, [
        sid,
      ]);

      const dialogLines = [
        ...history.rows.reverse(),
        { role: "assistant" as const, content: reply },
      ]
        .map((item) => {
          const role = item.role === "user" ? "Пользователь" : "Ассистент";
          return `${role}: ${item.content}`;
        })
        .join("\n");

      upsertDocument({
        sourceType: "chat",
        sourceId: sid,
        title: `Диалог ${sid}`,
        content: dialogLines,
        metadata: {
          sessionId: sid,
          userId: typeof userId === "string" ? userId : null,
        },
      }).catch((error) => {
        console.warn("RAG chat ingest failed:", error?.message || error);
      });

      return res.status(200).json({ sessionId: sid, reply });
    }

    let ragContext = "";
    try {
      const topK = Number(process.env.RAG_TOP_K || 5);
      const minScore = Number(process.env.RAG_MIN_SCORE || 0);
      const ragResults = await searchSimilar(userMessage, { topK, minScore, customer });
      if (ragResults.length > 0) {
        ragContext = ragResults
          .map((item, idx) => {
            const label = item.title || `${item.sourceType}:${item.sourceId}`;
            return `[${idx + 1}] ${label}\n${item.content}`;
          })
          .join("\n\n");
      }
    } catch (error: any) {
      console.warn("RAG search failed:", error?.message || error);
    }

    // Формируем системный промпт с контекстом
    const systemPrompt = `Ты — умный AI-помощник логистической компании HAULZ.
Твоя задача — помогать клиентам отслеживать их грузы и отвечать на вопросы по логистике.
Отвечай вежливо, профессионально и кратко.

ИНФОРМАЦИЯ О КОМПАНИИ:
- Название: HAULZ (ООО «Холз»)
- Маршруты: Москва – Калининград, Калининград – Москва.
- Услуги: Перевозка грузов, экспедирование, оформление документов (ЭР, Счет, УПД, АПП).
- Особенности: Быстрая доставка, работа с B2B.

КОНТЕКСТ ТЕКУЩЕГО ПОЛЬЗОВАТЕЛЯ:
${context ? JSON.stringify(context, null, 2) : "Пользователь пока не авторизован или данных о перевозках нет."}

АКТИВНЫЙ ЗАКАЗЧИК:
${customer || "Не указан."}

ДОПОЛНИТЕЛЬНЫЙ КОНТЕКСТ (из базы знаний):
${ragContext || "Нет дополнительных данных."}

ПРАВИЛА ОТВЕТОВ:
1. Если пользователь спрашивает про конкретную перевозку, ищи её в предоставленном контексте.
2. Если данных в контексте нет, вежливо попроси уточнить номер перевозки.
3. Используй смайлики (грузовик, пакет, документы) для дружелюбности, но оставайся профессиональным.
4. Если не знаешь ответа, предложи связаться с оператором.
5. Не проси пароли и не повторяй их.`;

    // Используем историю из БД или переданные сообщения
    const chatMessages: { role: ChatRole; content: string }[] = [
      { role: "system", content: systemPrompt },
      ...history.rows.reverse(),
    ];

    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: chatMessages,
      temperature: 0.7,
      max_tokens: 500,
    });

    const reply = completion.choices[0]?.message?.content?.trim() || "";

    await pool.query(
      `insert into chat_messages (session_id, role, content)
       values ($1, 'assistant', $2)`,
      [sid, reply],
    );
    await pool.query(`update chat_sessions set updated_at = now() where id = $1`, [
      sid,
    ]);

    const dialogLines = [
      ...history.rows.reverse(),
      { role: "assistant" as const, content: reply },
    ]
      .map((item) => {
        const role = item.role === "user" ? "Пользователь" : "Ассистент";
        return `${role}: ${item.content}`;
      })
      .join("\n");

    upsertDocument({
      sourceType: "chat",
      sourceId: sid,
      title: `Диалог ${sid}`,
      content: dialogLines,
      metadata: {
        sessionId: sid,
        userId: typeof userId === "string" ? userId : null,
      },
    }).catch((error) => {
      console.warn("RAG chat ingest failed:", error?.message || error);
    });

    return res.status(200).json({ sessionId: sid, reply });
  } catch (err: any) {
    console.error("chat error:", err?.message || err);
    return res.status(500).json({ 
      error: "chat failed",
      reply: "Извините, у меня возникли технические сложности. Попробуйте написать позже."
    });
  }
}


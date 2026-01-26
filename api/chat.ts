import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";
import { getPool } from "./_db.js";
import { searchSimilar, upsertDocument } from "../lib/rag.js";

type ChatRole = "system" | "user" | "assistant";

const HAULZ_CONTACTS = {
  website: "https://haulz.pro",
  email: "Info@haulz.pro",
  offices: [
    { city: "Калининград", address: "Железнодорожная ул., 12к4", phone: "+7 (401) 227-95-55" },
    { city: "Москва / МО", address: "Индустриальный парк «Андреевское», вл. 14А", phone: "+7 (958) 538-42-22" },
  ],
};

function isContactsRequest(text: string) {
  const lower = text.toLowerCase();
  return (
    lower.includes("контакт") ||
    lower.includes("адрес") ||
    lower.includes("почт") ||
    lower.includes("email") ||
    lower.includes("e-mail") ||
    lower.includes("сайт") ||
    lower.includes("телефон") ||
    lower.includes("номер") ||
    lower.includes("офис")
  );
}

function buildContactsReply() {
  const lines = [
    "Контакты HAULZ:",
    `Сайт: ${HAULZ_CONTACTS.website}`,
    `Email: ${HAULZ_CONTACTS.email}`,
    "",
    "Офисы:",
    ...HAULZ_CONTACTS.offices.map(
      (office) => `• ${office.city}: ${office.address}, тел. ${office.phone}`,
    ),
  ];
  return lines.join("\n");
}

function coerceBody(req: VercelRequest): any {
  let body: any = req.body;
  if (typeof body === "string") {
    body = JSON.parse(body);
  }
  return body ?? {};
}

function getAppDomain() {
  return process.env.NEXT_PUBLIC_APP_URL
    ? process.env.NEXT_PUBLIC_APP_URL
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "https://mini-app-lake-phi.vercel.app";
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

function wantsDocuments(text: string) {
  const lower = text.toLowerCase();
  return (
    lower.includes("скач") ||
    lower.includes("выгруз") ||
    lower.includes("получ") ||
    lower.includes("отправ") ||
    lower.includes("ссылк") ||
    lower.includes("документ")
  );
}

function wantsFullInfo(text: string) {
  const lower = text.toLowerCase();
  return (
    lower.includes("полную информацию") ||
    lower.includes("всю информацию") ||
    lower.includes("все данные") ||
    lower.includes("полные данные") ||
    lower.includes("полный отчет") ||
    lower.includes("полный отчёт")
  );
}

function wantsNoLinks(text: string) {
  const lower = text.toLowerCase();
  return lower.includes("без ссылок");
}

async function makeDocShortUrl(
  appDomain: string,
  method: string,
  number: string,
  auth?: { login?: string; password?: string },
) {
  const fallback = `${appDomain}/api/doc-short?metod=${encodeURIComponent(method)}&number=${encodeURIComponent(number)}`;
  if (!auth?.login || !auth?.password) return fallback;

  const shortenWithTinyUrl = async (url: string) => {
    const apiToken = process.env.TINYURL_API_TOKEN;
    if (!apiToken) return null;
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
        return null;
      }
      return data?.data?.tiny_url || data?.tiny_url || null;
    } catch (err: any) {
      console.warn("TinyURL failed:", err?.message || err);
      return null;
    }
  };

  try {
    const res = await fetch(`${appDomain}/api/shorten-doc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        login: auth.login,
        password: auth.password,
        metod: method,
        number,
      }),
    });
    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      console.warn("shorten-doc failed:", res.status, raw);
      return fallback;
    }
    const data = await res.json().catch(() => ({}));
    const shortUrl = data?.shortUrl || data?.short_url;
    if (typeof shortUrl === "string" && shortUrl.includes("tinyurl.com")) {
      return shortUrl;
    }
    const originalUrl = data?.originalUrl;
    if (typeof originalUrl === "string") {
      const tinyUrl = await shortenWithTinyUrl(originalUrl);
      if (tinyUrl) return tinyUrl;
      return originalUrl;
    }
    return fallback;
  } catch (err: any) {
    console.warn("shorten-doc exception:", err?.message || err);
    return fallback;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = coerceBody(req);
    const { sessionId, userId, message, messages, context, customer, action, auth, channel } = body;

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

    if (isContactsRequest(userMessage)) {
      const reply = buildContactsReply();
      await pool.query(
        `insert into chat_messages (session_id, role, content)
         values ($1, 'assistant', $2)`,
        [sid, reply],
      );
      await pool.query(`update chat_sessions set updated_at = now() where id = $1`, [
        sid,
      ]);
      return res.status(200).json({ sessionId: sid, reply });
    }

    if (wantsFullInfo(userMessage)) {
      const cargoNumber =
        extractCargoNumber(userMessage) ||
        extractLastCargoNumberFromHistory(history.rows);
      if (!cargoNumber) {
        return res.status(200).json({
          sessionId: sid,
          reply: "Пожалуйста, укажите номер перевозки, чтобы я выдал полную информацию.",
        });
      }

      const params: string[] = [cargoNumber];
      let whereClause = "where source_type = 'cargo' and metadata->>'number' = $1";
      if (customer) {
        params.push(String(customer));
        whereClause += " and metadata->>'customer' = $2";
      }

      const cargoDoc = await pool.query<{ content: string | null }>(
        `select content
         from rag_documents
         ${whereClause}
         order by updated_at desc
         limit 1`,
        params,
      );

      const content = cargoDoc.rows[0]?.content?.trim();
      const blocks: string[] = [];
      if (content) blocks.push(content);

      if (channel === "telegram" && !wantsNoLinks(userMessage)) {
        const appDomain = getAppDomain();
        const methods = ["ЭР", "СЧЕТ", "УПД", "АПП"];
        const links = await Promise.all(
          methods.map(async (method) => {
            const url = await makeDocShortUrl(appDomain, method, cargoNumber, auth);
            return `• ${method}: ${url}`;
          }),
        );
        blocks.push("");
        blocks.push("Документы:");
        blocks.push(...links);
      }

      const reply = `Вот то, что вы просили по перевозке № ${cargoNumber}:\n${blocks.join("\n")}`;

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

    const docMethods = extractDocMethods(userMessage);
    if (docMethods.length > 0 && (channel === "telegram" || wantsDocuments(userMessage))) {
      const cargoNumber =
        extractCargoNumber(userMessage) ||
        extractLastCargoNumberFromHistory(history.rows);
      let reply = "";
      if (!cargoNumber) {
        reply = "Пожалуйста, укажите номер перевозки, чтобы я смог помочь со скачиванием.";
      } else {
        if (channel === "telegram") {
          const appDomain = getAppDomain();
          const links = await Promise.all(
            docMethods.map(async (method) => {
              const url = await makeDocShortUrl(appDomain, method, cargoNumber, auth);
              return `• ${method}: ${url}`;
            }),
          );
          reply = `Вот ссылки на документы по перевозке № ${cargoNumber}:\n${links.join("\n")}`;
        } else {
          reply = `Скачать файл вы можете, нажав на кнопку шеринга в перевозке № ${cargoNumber}.`;
        }
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
Отвечай вежливо, профессионально, кратко и только на русском языке.

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
5. Не проси пароли и не повторяй их.
6. Если вопрос на другом языке, всё равно отвечай по‑русски.`;

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


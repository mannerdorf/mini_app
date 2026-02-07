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

const DOC_METHODS_MAP: Record<string, string> = {
  "ЭР": "ЭР",
  "АПП": "АПП",
  "СЧЕТ": "Счет",
  "УПД": "Акт",
};

function isContactsRequest(text: string) {
  const lower = text.toLowerCase();
  // Вопрос по перевозке с номером (например «по перевозке номер 123») — не запрос контактов
  if ((lower.includes("перевозк") || lower.includes("груз")) && /\d{4,}/.test(text)) return false;
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
  try {
    let body: any = req.body;
    if (typeof body === "string") {
      body = JSON.parse(body);
    }
    return body ?? {};
  } catch {
    return {};
  }
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

function isPaymentStatusQuery(text: string) {
  const lower = text.toLowerCase();
  return (
    lower.includes("не оплач") ||
    lower.includes("неоплач") ||
    lower.includes("оплач") ||
    lower.includes("оплата") ||
    lower.includes("задолж") ||
    lower.includes("долг")
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

/** Запрос на отвязку компании/заказчика в чате */
function isUnlinkRequest(text: string) {
  const lower = text.toLowerCase().trim();
  return (
    lower.includes("отвяжи компанию") ||
    lower.includes("отвяжи заказчик") ||
    lower.includes("отвяжи заказчика") ||
    (lower.includes("отвяжи") && (lower.includes("компани") || lower.includes("заказчик"))) ||
    lower === "отвяжи"
  );
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
    const { sessionId, userId, message, messages, context, customer, action, auth, channel, model } = body;

    const sid =
      typeof sessionId === "string" && sessionId.trim()
        ? sessionId.trim()
        : crypto.randomUUID();

    let pool;
    try {
      pool = getPool();
    } catch (dbErr: any) {
      console.error("chat getPool failed:", dbErr?.message ?? dbErr);
      return res.status(200).json({
        sessionId: sid,
        reply: "Сервис временно недоступен. Попробуйте позже.",
      });
    }

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
      return res.status(200).json({
        sessionId: sid,
        reply: "Сервис чата временно недоступен (не настроен API). Попробуйте позже.",
      });
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

    // Запрос «отвяжи компанию» / «отвяжи заказчика» — очищаем привязку сессии в БД
    if (isUnlinkRequest(userMessage)) {
      await pool.query(
        `insert into chat_session_bindings (session_id, login, inn, customer_name, updated_at)
         values ($1, null, null, null, now())
         on conflict (session_id) do update
           set login = null, inn = null, customer_name = null, updated_at = now()`,
        [sid],
      );
      const unlinkReply =
        "Компания отвязана. Активный заказчик в этом чате сброшен. Выберите компанию в приложении, если нужно снова работать от её имени.";
      await pool.query(
        `insert into chat_messages (session_id, role, content)
         values ($1, 'assistant', $2)`,
        [sid, unlinkReply],
      );
      await pool.query(`update chat_sessions set updated_at = now() where id = $1`, [sid]);
      return res.status(200).json({ sessionId: sid, reply: unlinkReply, unlinked: true });
    }

    // Регистрируем/обновляем привязку сессии к логину и заказчику (чего нет в БД — не авторизован)
    const login = typeof auth?.login === "string" ? auth.login.trim() : null;
    const inn = typeof auth?.inn === "string" ? auth.inn.trim() : null;
    const customerName = typeof customer === "string" ? customer.trim() || null : null;
    if (login && (customerName || inn)) {
      await pool.query(
        `insert into chat_session_bindings (session_id, login, inn, customer_name, updated_at)
         values ($1, $2, $3, $4, now())
         on conflict (session_id) do update
           set login = excluded.login, inn = excluded.inn, customer_name = excluded.customer_name, updated_at = now()`,
        [sid, login, inn || null, customerName],
      );
    }

    // Эффективный заказчик для сессии — из БД (если нет записи или customer_name null — не авторизован)
    const bindingResult = await pool.query<{ customer_name: string | null }>(
      `select customer_name from chat_session_bindings where session_id = $1`,
      [sid],
    );
    const effectiveCustomer = bindingResult.rows[0]?.customer_name ?? null;

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
      if (effectiveCustomer) {
        params.push(String(effectiveCustomer));
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
            const mapped = DOC_METHODS_MAP[method] || method;
            const url = await makeDocShortUrl(appDomain, mapped, cargoNumber, auth);
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
    const paymentQuery = isPaymentStatusQuery(userMessage);
    const wantsDocLinks = wantsDocuments(userMessage);
    if (docMethods.length > 0 && (wantsDocLinks || (channel === "telegram" && !paymentQuery))) {
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
              const mapped = DOC_METHODS_MAP[method] || method;
              const url = await makeDocShortUrl(appDomain, mapped, cargoNumber, auth);
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
      const ragResults = await searchSimilar(userMessage, { topK, minScore, customer: effectiveCustomer });
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

    let capabilitiesText = "";
    try {
      const capRes = await pool.query<{ title: string; content: string }>(
        `select title, content from chat_capabilities order by slug`,
      );
      if (capRes.rows?.length) {
        capabilitiesText = capRes.rows
          .map((r) => `### ${r.title}\n${r.content}`)
          .join("\n\n");
      }
    } catch (error: any) {
      console.warn("chat_capabilities load failed:", error?.message || error);
    }

    const aliceRules = channel === "alice"
      ? `
ДОПОЛНИТЕЛЬНЫЕ ПРАВИЛА ДЛЯ АЛИСЫ:
1. Если вопрос про список (перевозки, счета и т.п.), сначала дай количество и спроси «Хотите подробней?».
2. Если пользователь отвечает «да/подробнее», дай до 3 пунктов списка.
3. Отвечай коротко и по делу, без ссылок.`
      : "";

    // Формируем системный промпт с контекстом
    const basePrompt = `Ты — умный AI-помощник логистической компании HAULZ.
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
${effectiveCustomer || "Не указан. В этой сессии компания не привязана — выберите компанию в приложении или попросите отвязать текущую."}

ДОПОЛНИТЕЛЬНЫЙ КОНТЕКСТ (из базы знаний):
${ragContext || "Нет дополнительных данных."}

НАВЫКИ ГРУЗИКА (что умеет бот, примеры запросов — ориентируйся на это):
${capabilitiesText || "Не загружено."}

ПРАВИЛА ОТВЕТОВ:
1. Если пользователь спрашивает перевозки за период (за неделю, за месяц, за сегодня и т.п.) — смотри в КОНТЕКСТЕ ТЕКУЩЕГО ПОЛЬЗОВАТЕЛЯ поле cargoList (и даты weekStartDate, monthStartDate и т.д.). Если там есть перевозки — ответь конкретно: «За [период] у вас N перевозок: №X, №Y…» или «За неделю приняты перевозки: №…» с номерами и при необходимости кратким статусом. Если cargoList пустой или данных нет — ответь: за этот период перевозок не найдено (или что запрос к API не вернул данные).
2. Если пользователь спрашивает про конкретную перевозку по номеру, ищи её в контексте.
3. Если данных в контексте нет по номеру, вежливо попроси уточнить номер перевозки.
4. Можно использовать смайлики для дружелюбности, но не используй эмодзи грузовиков, машин и автомобилей (🚚 и т.п.).
5. Если не знаешь ответа, предложи связаться с оператором.
6. Не проси пароли и не повторяй их.
7. Если вопрос на другом языке, всё равно отвечай по‑русски.`;
    const systemPrompt = aliceRules ? `${basePrompt}\n${aliceRules}` : basePrompt;

    // Используем историю из БД или переданные сообщения
    const chatMessages: { role: ChatRole; content: string }[] = [
      { role: "system", content: systemPrompt },
      ...history.rows.reverse(),
    ];

    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: "gpt-4o",
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
    const catchBody = coerceBody(req);
    const sid = typeof catchBody?.sessionId === "string" ? catchBody.sessionId : null;
    return res.status(200).json({
      sessionId: sid,
      reply: "Извините, у меня возникли технические сложности. Попробуйте написать позже.",
    });
  }
}


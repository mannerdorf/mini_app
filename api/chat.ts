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

/** Ключ статуса перевозки для фильтра (как на вкладке Грузы) */
function getStatusKey(state: string | undefined): string {
  if (!state) return "all";
  const l = String(state).toLowerCase();
  if (l.includes("доставлен") || l.includes("заверш")) return "delivered";
  if (l.includes("пути") || l.includes("отправлен")) return "in_transit";
  if (l.includes("готов")) return "ready";
  if (l.includes("доставке")) return "delivering";
  return "all";
}

/** Ключ оплаты счёта */
function getPaymentKey(stateBill: string | undefined): string {
  if (!stateBill) return "unknown";
  const l = String(stateBill).toLowerCase();
  if (l.includes("не оплачен") || l.includes("неоплачен") || l.includes("ожидает")) return "unpaid";
  if (l.includes("отменен") || l.includes("аннулирован")) return "cancelled";
  if (l.includes("оплачен")) return "paid";
  if (l.includes("частично")) return "partial";
  return "unknown";
}

function isFerryItem(item: any): boolean {
  const ak = item?.AK;
  return ak === true || ak === "true" || ak === "1" || ak === 1;
}

function cityToCode(city: string | undefined | null): string {
  if (city == null) return "";
  const s = String(city).trim().toLowerCase();
  if (/калининград|кгд/.test(s)) return "KGD";
  if (/москва|мск|msk/.test(s)) return "MSK";
  return String(city).trim();
}

/** Для Telegram/Alice: загрузить перевозки по API и собрать контекст как в мини-приложении */
async function fetchCargoContextForChannel(
  auth: { login: string; password: string; inn?: string },
  customerName: string | null,
  appDomain: string
): Promise<Record<string, unknown>> {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const todayLabel = today.toLocaleDateString("ru-RU");
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekStartStr = weekAgo.toISOString().split("T")[0];
  const monthAgo = new Date(today);
  monthAgo.setDate(monthAgo.getDate() - 30);
  const monthStartStr = monthAgo.toISOString().split("T")[0];

  const res = await fetch(`${appDomain}/api/perevozki`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      login: auth.login,
      password: auth.password,
      dateFrom: "2024-01-01",
      dateTo: todayStr,
      ...(auth.inn ? { inn: auth.inn } : {}),
    }),
  });
  if (!res.ok) return { todayDate: todayStr, todayLabel, weekStartDate: weekStartStr, weekEndDate: todayStr, monthStartDate: monthStartStr, monthEndDate: todayStr, cargoList: [], activeCargoCount: 0, customer: customerName };

  const data = await res.json().catch(() => ({}));
  const list = Array.isArray(data) ? data : data?.items ?? [];
  const items = (list as any[]).slice(0, 35).map((i: any) => {
    const from = cityToCode(i.CitySender);
    const to = cityToCode(i.CityReceiver);
    const route = from === "MSK" && to === "KGD" ? "MSK-KGD" : from === "KGD" && to === "MSK" ? "KGD-MSK" : "other";
    return {
      number: i.Number,
      status: i.State ?? "",
      statusKey: getStatusKey(i.State),
      datePrih: i.DatePrih,
      dateVr: i.DateVr,
      stateBill: i.StateBill,
      paymentKey: getPaymentKey(i.StateBill),
      sum: i.Sum,
      sender: i.Sender,
      receiver: i.Receiver ?? i.receiver,
      customer: i.Customer ?? i.customer,
      type: isFerryItem(i) ? "ferry" : "auto",
      route,
    };
  });

  return {
    todayDate: todayStr,
    todayLabel,
    weekStartDate: weekStartStr,
    weekEndDate: todayStr,
    monthStartDate: monthStartStr,
    monthEndDate: todayStr,
    activeCargoCount: items.length,
    cargoList: items,
    customer: customerName,
  };
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

    // Для Telegram и Alice подставляем контекст перевозок (cargoList), если его не передали с клиента
    let contextForPrompt = context ?? undefined;
    if (
      (channel === "telegram" || channel === "alice") &&
      auth?.login &&
      auth?.password &&
      !contextForPrompt?.cargoList
    ) {
      try {
        contextForPrompt = await fetchCargoContextForChannel(
          {
            login: String(auth.login),
            password: String(auth.password),
            inn: typeof auth?.inn === "string" ? auth.inn : undefined,
          },
          effectiveCustomer,
          getAppDomain()
        );
      } catch (e) {
        console.warn("fetchCargoContextForChannel failed", e);
      }
    }

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
    let capabilityContext = "";
    try {
      const capRows = await pool.query<{ title: string; content: string }>(
        `select title, content from chat_capabilities order by slug`,
      );
      if (capRows.rows.length > 0) {
        capabilityContext = "ЧТО УМЕЕТ ГРУЗИК (из таблицы навыков):\n" + capRows.rows
          .map((row, idx) => `[${idx + 1}] ${row.title}\n${row.content}`)
          .join("\n\n");
      }
    } catch (capErr: any) {
      console.warn("chat_capabilities load failed:", capErr?.message ?? capErr);
    }
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

    const aliceRules = channel === "alice"
      ? `
ДОПОЛНИТЕЛЬНЫЕ ПРАВИЛА ДЛЯ АЛИСЫ:
1. Если вопрос про список (перевозки, счета и т.п.), сначала дай количество и спроси «Хотите подробней?».
2. Если пользователь отвечает «да/подробнее», дай до 3 пунктов списка.
3. Отвечай коротко и по делу, без ссылок.`
      : "";

    // Формируем системный промпт с контекстом
    const basePrompt = `Ты — Грузик, дружелюбный AI-помощник логистической компании HAULZ.
Твоя задача — помогать клиентам отслеживать их грузы и отвечать на вопросы по логистике.
Отвечай вежливо, профессионально, кратко и только на русском языке. Используй дружелюбные смайлики (🚛 📦 📄 ✨ 😊 и т.п.) и лёгкое чувство юмора, оставаясь полезным и по делу.

ИНФОРМАЦИЯ О КОМПАНИИ:
- Название: HAULZ (ООО «Холз»)
- Маршруты: Москва – Калининград, Калининград – Москва.
- Услуги: Перевозка грузов, экспедирование, оформление документов (ЭР, Счет, УПД, АПП).
- Особенности: Быстрая доставка, работа с B2B.

КОНТЕКСТ ТЕКУЩЕГО ПОЛЬЗОВАТЕЛЯ (могут быть перевозки из API):
${contextForPrompt ? JSON.stringify(contextForPrompt, null, 2) : "Пользователь пока не авторизован или данных о перевозках нет."}
РАБОТА С ПЕРЕВОЗКАМИ (cargoList). В контексте может быть cargoList — массив перевозок. У каждой записи: number, status, statusKey, datePrih, dateVr, stateBill, paymentKey, sum, sender, receiver, customer, type, route.
Даты в контексте: todayDate, todayLabel — «сегодня»; weekStartDate, weekEndDate — «неделя» (7 дней); monthStartDate, monthEndDate — «месяц» (30 дней). Сравнивать даты по началу строки в формате YYYY-MM-DD.
ФИЛЬТРЫ (как на вкладке «Грузы») — применяй к cargoList по запросу пользователя, можно комбинировать:
• Период: «за сегодня» → datePrih или dateVr === todayDate; «за неделю» → в [weekStartDate, weekEndDate]; «за месяц» → в [monthStartDate, monthEndDate]; «за вчера» → дата = yesterday (today минус 1 день).
• Статус (statusKey): «в пути» / «отправленные» → in_transit; «готов к выдаче» / «готовые» → ready; «на доставке» → delivering; «доставлено» / «доставленные» → delivered.
• Тип (type): «паром» / «парому» / «паромами» → ferry; «авто» / «автом» / «автомобилем» → auto.
• Маршрут (route): «Москва Калининград» / «МСК КГД» / «туда» → MSK-KGD; «Калининград Москва» / «КГД МСК» / «обратно» → KGD-MSK.
• Оплата (paymentKey): «не оплачен» / «неоплаченные» / «долги» → unpaid; «оплачен» → paid; «частично» → partial; «отменён» → cancelled.
• По контрагенту: «отправитель …», «от …» → совпадение по sender; «получатель …», «для …» → по receiver; «заказчик …» → по customer (сравнивать без учёта ООО/ИП, по вхождению или точному совпадению).
Отвечай на любые комбинации: «перевозки в пути за неделю», «что доставлено за месяц», «неоплаченные паромом», «авто Москва Калининград за сегодня», «по отправителю X за месяц» и т.п. Фильтруй cargoList по указанным признакам, выдавай список (номер, статус, дата, при необходимости сумма); если ничего не найдено — так и скажи. Если cargoList пуст или отсутствует — предложи открыть раздел «Грузы».

АКТИВНЫЙ ЗАКАЗЧИК:
${effectiveCustomer || "Не указан. В этой сессии компания не привязана — выберите компанию в приложении или попросите отвязать текущую."}

${capabilityContext ? capabilityContext + "\n\n" : ""}ДОПОЛНИТЕЛЬНЫЙ КОНТЕКСТ (из базы знаний):
${ragContext || "Нет дополнительных данных."}

ПРАВИЛА ОТВЕТОВ:
1. Представляйся как Грузик. Используй дружелюбные смайлики и лёгкое чувство юмора в ответах.
2. Если нужны актуальные данные перевозок по API — вызови инструмент get_perevozki с датами (dateFrom, dateTo). Если пользователь просит контакты — вызови get_contacts.
3. Если пользователь спрашивает про конкретную перевозку, ищи её в предоставленном контексте или в результате get_perevozki.
4. Если данных в контексте нет, вежливо попроси уточнить номер перевозки или вызови get_perevozki при наличии учётных данных.
5. Если не знаешь ответа, предложи связаться с оператором.
6. Не проси пароли и не повторяй их.
7. Если вопрос на другом языке, всё равно отвечай по‑русски.`;
    const systemPrompt = aliceRules ? `${basePrompt}\n${aliceRules}` : basePrompt;

    const client = new OpenAI({ apiKey });
    const allowedModels = new Set(["gpt-4o-mini", "gpt-4o"]);
    const requestedModel = typeof model === "string" ? model : null;
    const chosenModel =
      channel === "alice"
        ? "gpt-4o"
        : requestedModel && allowedModels.has(requestedModel)
          ? requestedModel
          : "gpt-4o-mini";

    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
      {
        type: "function",
        function: {
          name: "get_perevozki",
          description: "Получить список перевозок из API. Вызывай при запросах типа «перевозки за сегодня/неделю/месяц», «что в пути», «неоплаченные» и т.п. Требуются учётные данные (логин/пароль) в сессии.",
          parameters: {
            type: "object",
            properties: {
              dateFrom: { type: "string", description: "Начало периода YYYY-MM-DD" },
              dateTo: { type: "string", description: "Конец периода YYYY-MM-DD" },
              status: { type: "string", enum: ["in_transit", "ready", "delivering", "delivered"], description: "Опционально: фильтр по статусу" },
              type: { type: "string", enum: ["ferry", "auto"], description: "Опционально: паром или авто" },
            },
            required: ["dateFrom", "dateTo"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "get_contacts",
          description: "Вернуть контакты HAULZ: адреса офисов, телефон, email, сайт. Вызывай при запросах «контакты», «адрес», «телефон», «как связаться».",
          parameters: { type: "object" },
        },
      },
    ];

    type MessageParam =
      | { role: "system"; content: string }
      | { role: "user"; content: string }
      | { role: "assistant"; content: string | null; tool_calls?: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] }
      | { role: "tool"; tool_call_id: string; content: string };

    const baseMessages: MessageParam[] = [
      { role: "system", content: systemPrompt },
      ...history.rows.reverse().map((r) => ({ role: r.role as "user" | "assistant", content: r.content })),
    ];

    let messages: MessageParam[] = [...baseMessages];
    let reply = "";
    const appDomain = getAppDomain();
    const maxToolRounds = 5;
    let toolRounds = 0;

    try {
    while (true) {
      if (toolRounds >= maxToolRounds) break;
      toolRounds++;
      const completion = await client.chat.completions.create({
        model: chosenModel,
        messages,
        temperature: 0.7,
        max_tokens: 800,
        tools: tools.length ? tools : undefined,
      });

      const msg = completion.choices[0]?.message;
      if (!msg) break;

      const content = msg.content?.trim() ?? "";
      const toolCalls = msg.tool_calls;

      if (toolCalls && toolCalls.length > 0) {
        messages.push({ role: "assistant", content: content || null, tool_calls: toolCalls });
        for (const tc of toolCalls) {
          const name = tc.function?.name;
          const argsStr = tc.function?.arguments ?? "{}";
          let resultJson: unknown = {};
          try {
            if (name === "get_perevozki") {
              const args = JSON.parse(argsStr) as { dateFrom?: string; dateTo?: string };
              const dateFrom = args.dateFrom ?? "2024-01-01";
              const dateTo = args.dateTo ?? new Date().toISOString().split("T")[0];
              if (!auth?.login || !auth?.password) {
                resultJson = { error: "Нет учётных данных. Попросите пользователя авторизоваться." };
              } else {
                const perevozkiRes = await fetch(`${appDomain}/api/perevozki`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    login: auth.login,
                    password: auth.password,
                    dateFrom,
                    dateTo,
                    ...(auth.inn ? { inn: auth.inn } : {}),
                  }),
                });
                const data = perevozkiRes.ok ? await perevozkiRes.json().catch(() => ({})) : { error: "Ошибка API" };
                resultJson = Array.isArray(data) ? { items: data } : data;
                try {
                  await pool.query(
                    `insert into chat_api_results (session_id, api_name, request_payload, response_payload)
                     values ($1, 'get_perevozki', $2, $3)`,
                    [sid, JSON.stringify({ dateFrom, dateTo }), JSON.stringify(resultJson)],
                  );
                } catch (dbErr: any) {
                  console.warn("chat_api_results insert failed:", dbErr?.message ?? dbErr);
                }
              }
            } else if (name === "get_contacts") {
              resultJson = {
                website: HAULZ_CONTACTS.website,
                email: HAULZ_CONTACTS.email,
                offices: HAULZ_CONTACTS.offices,
              };
              try {
                await pool.query(
                  `insert into chat_api_results (session_id, api_name, request_payload, response_payload)
                   values ($1, 'get_contacts', '{}', $2)`,
                  [sid, JSON.stringify(resultJson)],
                );
              } catch (dbErr: any) {
                console.warn("chat_api_results insert failed:", dbErr?.message ?? dbErr);
              }
            } else {
              resultJson = { error: "Unknown tool" };
            }
          } catch (err: any) {
            resultJson = { error: err?.message ?? "Tool failed" };
          }
          messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(resultJson) });
        }
        continue;
      }

      reply = content;
      break;
    }

    if (!reply) {
      reply = "Не удалось сформировать ответ. Попробуйте переформулировать или написать позже.";
    }

    await pool.query(
      `insert into chat_messages (session_id, role, content)
       values ($1, 'assistant', $2)`,
      [sid, reply],
    );
    await pool.query(`update chat_sessions set updated_at = now() where id = $1`, [
      sid,
    ]);
    } catch (loopErr: any) {
      console.error("Chat completion/tools error:", loopErr?.message ?? loopErr);
      reply = "Извините, произошла временная ошибка. Попробуйте написать ещё раз или позже.";
      try {
        await pool.query(
          `insert into chat_messages (session_id, role, content) values ($1, 'assistant', $2)`,
          [sid, reply],
        );
        await pool.query(`update chat_sessions set updated_at = now() where id = $1`, [sid]);
      } catch (e2: any) {
        console.warn("Fallback message save failed:", e2?.message ?? e2);
      }
    }

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


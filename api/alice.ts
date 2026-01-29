import type { VercelRequest, VercelResponse } from "@vercel/node";

const APP_DOMAIN =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://mini-app-lake-phi.vercel.app");
const ALICE_VERIFICATION_CODE = process.env.ALICE_VERIFICATION_CODE || "589570";

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

async function setRedisValue(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return false;

  try {
    const pipeline = ttlSeconds
      ? [["SET", key, value], ["EXPIRE", key, ttlSeconds]]
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

/** Номер перевозки для голоса: без ведущих нулей (135702, не 0135702) */
function speechNumber(n: any): string {
  if (n == null || n === "") return "-";
  const s = String(n).trim();
  const num = parseInt(s, 10);
  if (Number.isNaN(num)) return s;
  return String(num);
}

/** Одна группа 0–999 словами (для произношения по три цифры) */
function group999ToWords(g: number): string {
  if (g < 0 || g > 999) return "ноль";
  if (g === 0) return "ноль";
  const ones = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
  const teens = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"];
  const tens = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
  const hundreds = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"];
  const h = Math.floor(g / 100);
  const t = Math.floor((g % 100) / 10);
  const o = g % 10;
  const parts: string[] = [];
  if (h > 0) parts.push(hundreds[h]);
  if (t === 1) {
    parts.push(teens[o]);
  } else {
    if (t > 0) parts.push(tens[t]);
    if (o > 0) parts.push(ones[o]);
  }
  return parts.length ? parts.join(" ") : "ноль";
}

/** Номер для произношения Алисой: по три цифры, например 135200 → «сто тридцать пять двести» */
function speechNumberPhrase(n: any): string {
  if (n == null || n === "") return "";
  const s = String(n).trim().replace(/^0+/, "") || "0";
  const num = parseInt(s, 10);
  if (Number.isNaN(num)) return s;
  if (num === 0) return "ноль";
  const str = String(num);
  const groups: number[] = [];
  for (let i = str.length; i > 0; i -= 3) {
    const start = Math.max(0, i - 3);
    groups.unshift(parseInt(str.slice(start, i), 10));
  }
  return groups.map(group999ToWords).join(" ");
}

function getCommandText(reqBody: any): string {
  const raw = reqBody?.request?.command || reqBody?.request?.original_utterance || "";
  return String(raw || "").toLowerCase().trim();
}

function isYes(text: string) {
  return ["да", "конечно", "ага", "хочу", "подробнее", "давай", "покажи"].some((w) => text.includes(w));
}

function normalizeStatus(status: string | undefined): string {
  if (!status) return "-";
  const lower = status.toLowerCase();
  if (lower.includes("поставлена на доставку")) return "На доставке";
  return status;
}

function getFilterKeyByStatus(status: string | undefined) {
  const normalized = normalizeStatus(status);
  const lower = (normalized || "").toLowerCase();
  if (lower.includes("доставлен") || lower.includes("заверш")) return "delivered";
  if (lower.includes("пути") || lower.includes("отправлен")) return "in_transit";
  if (lower.includes("готов") || lower.includes("принят") || lower.includes("ответ")) return "accepted"; // ответ принято / готов к отправке
  if (lower.includes("доставке")) return "delivering";
  return "all";
}

/** Склонение: 1 перевозка, 2–4 перевозки, 5+ перевозок */
function wordПеревозки(n: number): string {
  if (n === 1) return "перевозка";
  if (n >= 2 && n <= 4) return "перевозки";
  return "перевозок";
}

/** Склонение: 1 счет, 2–4 счета, 5+ счетов */
function wordСчета(n: number): string {
  if (n === 1) return "счет";
  if (n >= 2 && n <= 4) return "счета";
  return "счетов";
}

function getPaymentFilterKey(stateBill: string | undefined) {
  if (!stateBill) return "unknown";
  const lower = stateBill.toLowerCase().trim();
  if (
    lower.includes("не оплачен") ||
    lower.includes("неоплачен") ||
    lower.includes("не оплачён") ||
    lower.includes("неоплачён") ||
    lower.includes("unpaid") ||
    lower.includes("ожидает") ||
    lower.includes("pending")
  ) {
    return "unpaid";
  }
  if (lower.includes("оплачен") || lower.includes("paid") || lower.includes("оплачён")) return "paid";
  if (lower.includes("частично") || lower.includes("partial") || lower.includes("частичн")) return "partial";
  return "unknown";
}

/** Краткий список: номера для произношения Алисой (по три цифры: «номер сто тридцать пять двести») */
function formatBriefNumbers(items: any[], limit = 7) {
  return items.slice(0, limit).map((item) => {
    const phrase = speechNumberPhrase(item?.Number ?? item?.number);
    return phrase ? `номер ${phrase}` : "номер —";
  });
}

/** Список номеров для фразы «у вас N перевозок номера X и Y» — произношение по три цифры */
function joinSpeechNumbers(items: any[], limit = 7): string {
  const phrases = items.slice(0, limit).map((item) => speechNumberPhrase(item?.Number ?? item?.number)).filter(Boolean);
  if (phrases.length === 0) return "";
  if (phrases.length === 1) return phrases[0];
  if (phrases.length === 2) return `${phrases[0]} и ${phrases[1]}`;
  return `${phrases.slice(0, -1).join(", ")} и ${phrases[phrases.length - 1]}`;
}

/** Подробный список: номер словами (по три цифры), статус, сумма, маршрут, оплата */
function formatDetailedList(items: any[], limit = 10) {
  return items.slice(0, limit).map((item) => {
    const numberPhrase = speechNumberPhrase(item?.Number ?? item?.number) || "—";
    const status = item?.State ? normalizeStatus(item.State) : "";
    const sum = item?.Sum != null ? `, сумма ${item.Sum} ₽` : "";
    const route =
      item?.CitySender || item?.CityReceiver
        ? `, маршрут ${item.CitySender || "?"} — ${item.CityReceiver || "?"}`
        : "";
    const bill = item?.StateBill ? `, оплата: ${item.StateBill}` : "";
    return `№ ${numberPhrase}${status ? `, статус ${status}` : ""}${sum}${route}${bill}`;
  });
}

function formatList(items: any[], limit = 3) {
  return items.slice(0, limit).map((item) => {
    const numberPhrase = speechNumberPhrase(item?.Number ?? item?.number) || "—";
    const status = item?.State ? normalizeStatus(item.State) : "";
    const sum = item?.Sum ? `, сумма ${item.Sum} ₽` : "";
    const statusPart = status ? `, статус ${status}` : "";
    return `№ ${numberPhrase}${statusPart}${sum}`;
  });
}

/** Формат для «подробнее» / «написал в чат»: номер / дата / кол-во / плат вес / сумма */
function formatLineForChat(item: any): string {
  const num = speechNumber(item?.Number ?? item?.number) || "—";
  const dateRaw = item?.DatePrih ?? item?.DateVr ?? item?.date ?? "";
  const dateStr =
    typeof dateRaw === "string" && dateRaw
      ? dateRaw.split("T")[0].split("-").reverse().join(".")
      : "—";
  const mest = item?.Mest != null && item?.Mest !== "" ? String(item.Mest) : "—";
  const pw = item?.PW != null && item?.PW !== "" ? String(item.PW) : "—";
  const sum = item?.Sum != null && item?.Sum !== "" ? `${item.Sum} ₽` : "—";
  return `${num} / ${dateStr} / ${mest} / ${pw} / ${sum}`;
}

function extractCode(text: string) {
  const match = text.match(/\b\d{4,6}\b/);
  return match ? match[0] : null;
}

function aliceResponse(text: string, session_state?: any) {
  return {
    version: "1.0",
    response: {
      text,
      end_session: false,
    },
    session_state,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body;
  const userId = String(body?.session?.user?.user_id || body?.session?.user_id || "anon");
  const text = getCommandText(body);
  const sessionState = body?.state?.session || {};

  if (text.includes("код проверки") || text.includes("проверка навыка") || text.includes("verification")) {
    return res.status(200).json(aliceResponse(`Код проверки: ${ALICE_VERIFICATION_CODE}`));
  }
  // Привязка по коду
  const code = extractCode(text);
  if (code) {
    const raw = await getRedisValue(`alice:link:${code}`);
    if (!raw) {
      return res.status(200).json(aliceResponse("Код не найден или истек. Получите новый код в мини‑приложении."));
    }
    let parsed: any = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    if (!parsed?.login || !parsed?.password) {
      return res.status(200).json(aliceResponse("Не удалось прочитать данные привязки. Получите новый код."));
    }
    await setRedisValue(`alice:bind:${userId}`, JSON.stringify(parsed));
    const loginKey = String(parsed.login || "").trim().toLowerCase();
    if (loginKey) {
      await setRedisValue(`alice:login:${loginKey}`, userId, 60 * 60 * 24 * 365);
    }
    // Список компаний для переключения голосом
    const listRaw = await getRedisValue(`alice:list:${userId}`);
    let list: any[] = [];
    try {
      list = listRaw ? JSON.parse(listRaw) : [];
    } catch {
      list = [];
    }
    const key = `${loginKey}:${parsed?.inn ?? ""}`;
    const existingIdx = list.findIndex(
      (b: any) => `${String(b?.login ?? "").trim().toLowerCase()}:${b?.inn ?? ""}` === key
    );
    if (existingIdx >= 0) list[existingIdx] = parsed;
    else list.push(parsed);
    await setRedisValue(`alice:list:${userId}`, JSON.stringify(list));
    const companyName = parsed?.customer || "Заказчик";
    return res
      .status(200)
      .json(aliceResponse(`Вы авторизованы под компанией ${companyName}. Чем я могу вам помочь?`));
  }

  const bindRaw = await getRedisValue(`alice:bind:${userId}`);
  if (!bindRaw) {
    return res
      .status(200)
      .json(aliceResponse("Авторизуйтесь, пожалуйста. Введите код авторизации из мини‑приложения Холз."));
  }

  let bind: any = null;
  try {
    bind = JSON.parse(bindRaw);
  } catch {
    bind = null;
  }
  if (!bind?.login || !bind?.password) {
    return res
      .status(200)
      .json(aliceResponse("Привязка повреждена. Получите новый код в мини‑приложении."));
  }

  const withTimeout = async <T>(promise: Promise<T>, ms: number) => {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), ms);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      clearTimeout(timer!);
    }
  };

  // Таймауты: Алиса ждёт ответ ~7–10 с. perevozki (1С) и chat (OpenAI) часто 3–6 с.
  const PEREVOZKI_MS = 6000;
  const CHAT_MS = 8000;

  try {
    if (sessionState?.awaiting_details && isYes(text)) {
      const intent = sessionState?.last_intent || "";
      const data = Array.isArray(sessionState?.last_data) ? sessionState.last_data : [];
      const chatLines = data.slice(0, 10).map((i: any) => formatLineForChat(i));
      const header = "Написал в чат.\nНомер / дата / кол-во / плат вес / сумма\n";
      const body = chatLines.length ? chatLines.join("\n") : "Нет данных.";
      const fullText = header + body;
      if (intent === "in_transit") {
        return res.status(200).json(aliceResponse(chatLines.length ? fullText : "Написал в чат. Перевозок в пути нет.", { awaiting_details: false }));
      }
      if (intent === "unpaid_bills") {
        return res.status(200).json(aliceResponse(chatLines.length ? fullText : "Написал в чат. Перевозок, требующих оплаты, нет.", { awaiting_details: false }));
      }
    }

    if (text.includes("перевозк") && (text.includes("пути") || text.includes("в дороге") || text.includes("в пути"))) {
      const today = new Date();
      const dateTo = today.toISOString().split("T")[0];
      const from = new Date();
      from.setMonth(from.getMonth() - 6);
      const dateFrom = from.toISOString().split("T")[0];
      const resData = await withTimeout(fetch(`${APP_DOMAIN}/api/perevozki`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: bind.login, password: bind.password, dateFrom, dateTo, ...(bind.inn ? { inn: bind.inn } : {}) }),
      }), PEREVOZKI_MS);
      const payload = await resData.json();
      const items = Array.isArray(payload) ? payload : payload?.items || [];
      const inTransit = items.filter((i: any) => getFilterKeyByStatus(i.State) === "in_transit");
      const count = inTransit.length;
      const briefNums = formatBriefNumbers(inTransit, 7);
      const summary = inTransit.slice(0, 10).map((i: any) => ({
        Number: i?.Number,
        State: i?.State,
        Sum: i?.Sum,
        CitySender: i?.CitySender,
        CityReceiver: i?.CityReceiver,
        StateBill: i?.StateBill,
        DatePrih: i?.DatePrih,
        DateVr: i?.DateVr,
        Mest: i?.Mest,
        PW: i?.PW,
      }));
      const briefText =
        count === 0
          ? "Сейчас нет перевозок в пути."
          : (() => {
              const nums = joinSpeechNumbers(inTransit, 7);
              const word = count === 1 ? "перевозка" : count < 5 ? "перевозки" : "перевозок";
              return `У вас ${count} ${word} номера ${nums}. Хотите подробнее?`;
            })();
      return res
        .status(200)
        .json(aliceResponse(briefText, { awaiting_details: count > 0, last_intent: "in_transit", last_data: summary }));
    }

    if (text.includes("счет") || text.includes("счёт") || text.includes("оплат")) {
      const today = new Date();
      const dateTo = today.toISOString().split("T")[0];
      const from = new Date();
      from.setMonth(from.getMonth() - 6);
      const dateFrom = from.toISOString().split("T")[0];
      const resData = await withTimeout(fetch(`${APP_DOMAIN}/api/perevozki`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: bind.login, password: bind.password, dateFrom, dateTo, ...(bind.inn ? { inn: bind.inn } : {}) }),
      }), PEREVOZKI_MS);
      const payload = await resData.json();
      const items = Array.isArray(payload) ? payload : payload?.items || [];
      const unpaid = items.filter((i: any) => getPaymentFilterKey(i.StateBill) === "unpaid");
      const count = unpaid.length;
      const briefNums = formatBriefNumbers(unpaid, 7);
      const summary = unpaid.slice(0, 10).map((i: any) => ({
        Number: i?.Number,
        State: i?.State,
        Sum: i?.Sum,
        CitySender: i?.CitySender,
        CityReceiver: i?.CityReceiver,
        StateBill: i?.StateBill,
        DatePrih: i?.DatePrih,
        DateVr: i?.DateVr,
        Mest: i?.Mest,
        PW: i?.PW,
      }));
      const briefText =
        count === 0
          ? "Перевозок, требующих оплаты, нет."
          : (() => {
              const nums = joinSpeechNumbers(unpaid, 7);
              const word = count === 1 ? "перевозка" : count < 5 ? "перевозки" : "перевозок";
              return `Требуют оплаты ${count} ${word} номера ${nums}. Хотите подробнее?`;
            })();
      return res
        .status(200)
        .json(aliceResponse(briefText, { awaiting_details: count > 0, last_intent: "unpaid_bills", last_data: summary }));
    }

    // Отвязка компании голосом
    if (
      (text.includes("отвяжи") && (text.includes("компанию") || text.includes("заказчика") || text.includes("компани"))) ||
      (text === "отвяжи")
    ) {
      const loginKey = String(bind.login || "").trim().toLowerCase();
      await deleteRedisValue(`alice:bind:${userId}`);
      if (loginKey) await deleteRedisValue(`alice:login:${loginKey}`);
      const listRaw = await getRedisValue(`alice:list:${userId}`);
      if (listRaw) {
        try {
          const list = JSON.parse(listRaw) as any[];
          const next = (Array.isArray(list) ? list : []).filter(
            (b: any) => String(b?.login ?? "").trim().toLowerCase() !== loginKey
          );
          if (next.length > 0) {
            await setRedisValue(`alice:list:${userId}`, JSON.stringify(next));
          } else {
            await deleteRedisValue(`alice:list:${userId}`);
          }
        } catch {
          await deleteRedisValue(`alice:list:${userId}`);
        }
      }
      return res.status(200).json(aliceResponse("Компания отвязана. Чтобы снова пользоваться навыком, получите новый код в мини‑приложении Холз."));
    }

    // Краткий статус «что в работе»
    if (
      text.includes("что в работе") ||
      text.includes("что у меня в работе") ||
      text.includes("кратко что в работе") ||
      text.includes("одна фраза")
    ) {
      const today = new Date();
      const dateTo = today.toISOString().split("T")[0];
      const from = new Date();
      from.setMonth(from.getMonth() - 6);
      const dateFrom = from.toISOString().split("T")[0];
      const resData = await withTimeout(fetch(`${APP_DOMAIN}/api/perevozki`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: bind.login, password: bind.password, dateFrom, dateTo, ...(bind.inn ? { inn: bind.inn } : {}) }),
      }), PEREVOZKI_MS);
      const payload = await resData.json();
      const items = Array.isArray(payload) ? payload : payload?.items || [];
      const inTransit = items.filter((i: any) => getFilterKeyByStatus(i.State) === "in_transit");
      const unpaid = items.filter((i: any) => getPaymentFilterKey(i.StateBill) === "unpaid");
      const n = inTransit.length;
      const m = unpaid.length;
      const inWord = n === 1 ? "перевозка" : n < 5 ? "перевозки" : "перевозок";
      const unWord = m === 1 ? "перевозка" : m < 5 ? "перевозки" : "перевозок";
      const msg =
        n === 0 && m === 0
          ? "Сейчас нет перевозок в пути и нет счетов к оплате."
          : n === 0
            ? `В пути перевозок нет. К оплате ${m} ${unWord}.`
            : m === 0
              ? `В пути ${n} ${inWord}. К оплате перевозок нет.`
              : `В пути ${n} ${inWord}, к оплате ${m} ${unWord}.`;
      return res.status(200).json(aliceResponse(msg));
    }

    // Сводка за день: ответ принято, в пути, на доставке, доставлено, счета на оплату
    if (
      text.includes("сводка за день") ||
      text.includes("сводка за сегодня") ||
      text.includes("сводка на сегодня") ||
      text.includes("что за день") ||
      text.includes("сводка дня")
    ) {
      const today = new Date();
      const dateFrom = today.toISOString().split("T")[0];
      const dateTo = dateFrom;
      const resData = await withTimeout(fetch(`${APP_DOMAIN}/api/perevozki`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: bind.login, password: bind.password, dateFrom, dateTo, ...(bind.inn ? { inn: bind.inn } : {}) }),
      }), PEREVOZKI_MS);
      const payload = await resData.json();
      const items = Array.isArray(payload) ? payload : payload?.items || [];
      const accepted = items.filter((i: any) => getFilterKeyByStatus(i.State) === "accepted");
      const inTransit = items.filter((i: any) => getFilterKeyByStatus(i.State) === "in_transit");
      const delivering = items.filter((i: any) => getFilterKeyByStatus(i.State) === "delivering");
      const delivered = items.filter((i: any) => getFilterKeyByStatus(i.State) === "delivered");
      const unpaid = items.filter((i: any) => getPaymentFilterKey(i.StateBill) === "unpaid");
      const unpaidSum = unpaid.reduce((s: number, i: any) => s + (Number(i?.Sum) || 0), 0);
      const parts: string[] = [];
      parts.push(`Ответ принято ${accepted.length} ${wordПеревозки(accepted.length)}`);
      parts.push(`В пути ${inTransit.length} ${wordПеревозки(inTransit.length)}`);
      parts.push(`На доставке ${delivering.length} ${wordПеревозки(delivering.length)}`);
      parts.push(`Доставлено ${delivered.length} ${wordПеревозки(delivered.length)}`);
      if (unpaid.length > 0) {
        const sumStr = Math.round(unpaidSum).toLocaleString("ru-RU");
        parts.push(`${unpaid.length} ${wordСчета(unpaid.length)} на оплату на сумму ${sumStr} рублей`);
      }
      const msg = parts.join(". ");
      return res.status(200).json(aliceResponse(msg));
    }

    // Сводка за период: сегодня / неделя
    if (
      text.includes("сколько перевозок") ||
      text.includes("перевозок за сегодня") ||
      text.includes("перевозок на этой неделе") ||
      text.includes("что пришло на этой неделе") ||
      (text.includes("за сегодня") && text.includes("перевозк")) ||
      (text.includes("за неделю") && text.includes("перевозк"))
    ) {
      const now = new Date();
      let dateFrom: string;
      let dateTo: string;
      let periodLabel: string;
      if (text.includes("недел") || text.includes("неделю")) {
        const start = new Date(now);
        start.setDate(start.getDate() - start.getDay());
        start.setHours(0, 0, 0, 0);
        dateFrom = start.toISOString().split("T")[0];
        dateTo = now.toISOString().split("T")[0];
        periodLabel = "на этой неделе";
      } else {
        dateFrom = now.toISOString().split("T")[0];
        dateTo = dateFrom;
        periodLabel = "за сегодня";
      }
      const resData = await withTimeout(fetch(`${APP_DOMAIN}/api/perevozki`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: bind.login, password: bind.password, dateFrom, dateTo, ...(bind.inn ? { inn: bind.inn } : {}) }),
      }), PEREVOZKI_MS);
      const payload = await resData.json();
      const items = Array.isArray(payload) ? payload : payload?.items || [];
      const count = items.length;
      const word = count === 1 ? "перевозка" : count < 5 ? "перевозки" : "перевозок";
      const nums = joinSpeechNumbers(items, 7);
      const msg =
        count === 0
          ? `Перевозок ${periodLabel} нет.`
          : nums ? `У вас ${periodLabel} ${count} ${word} номера ${nums}.` : `У вас ${periodLabel} ${count} ${word}.`;
      return res.status(200).json(aliceResponse(msg));
    }

    // Статус по номеру перевозки: «статус перевозки 135702», «перевозка 135702», «груз 135702»
    let requestedNum: string | null = null;
    if (/\b(статус|перевозк|груз)\b/i.test(text)) {
      const m = text.match(/(?:статус\s+перевозки?\s*|перевозки?\s+номер\s*|перевозка\s*|груз[а]?\s*)[:\s]*(\d{4,7})|(\d{5,7})\b/);
      if (m) requestedNum = (m[1] || m[2] || "").trim();
    }
    if (requestedNum) {
      const from = new Date();
      from.setMonth(from.getMonth() - 6);
      const dateFrom = from.toISOString().split("T")[0];
      const dateTo = new Date().toISOString().split("T")[0];
      const resData = await withTimeout(fetch(`${APP_DOMAIN}/api/perevozki`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: bind.login, password: bind.password, dateFrom, dateTo, ...(bind.inn ? { inn: bind.inn } : {}) }),
      }), PEREVOZKI_MS);
      const payload = await resData.json();
      const items = Array.isArray(payload) ? payload : payload?.items || [];
      const found = items.find((i: any) => speechNumber(i?.Number ?? i?.number) === speechNumber(requestedNum));
      if (found) {
        const lines = formatDetailedList([found], 1);
        return res.status(200).json(aliceResponse(lines[0] || "Данные по перевозке не найдены."));
      }
      return res.status(200).json(aliceResponse(`Перевозку номер ${speechNumberPhrase(requestedNum)} не нашла. Проверьте номер или период.`));
    }

    // Выбор компании: «работай от имени компании X», «переключись на компанию X»
    const companySwitchMatch = text.match(/(?:работай\s+от\s+имени|переключись\s+на|выбери\s+компанию|компания)\s+(.+)/i);
    const companyNameQuery = companySwitchMatch ? companySwitchMatch[1].trim() : "";
    if (companyNameQuery && (text.includes("работай") || text.includes("переключись") || text.includes("выбери") || text.includes("компани"))) {
      const listRaw = await getRedisValue(`alice:list:${userId}`);
      let list: any[] = [];
      try {
        list = listRaw ? JSON.parse(listRaw) : [];
      } catch {
        list = [];
      }
      if (!Array.isArray(list) || list.length === 0) {
        return res.status(200).json(aliceResponse("У вас привязана только одна компания. Добавьте ещё в мини‑приложении и введите новый код в Алисе."));
      }
      const q = companyNameQuery.toLowerCase();
      const match = list.find((b: any) => {
        const customer = String(b?.customer ?? "").toLowerCase();
        return customer.includes(q) || q.includes(customer);
      });
      if (!match) {
        const names = list.map((b: any) => b?.customer || "Без названия").slice(0, 5);
        return res.status(200).json(aliceResponse(`Компанию «${companyNameQuery}» не нашла. Доступны: ${names.join(", ")}.`));
      }
      await setRedisValue(`alice:bind:${userId}`, JSON.stringify(match));
      const loginKey = String(match.login || "").trim().toLowerCase();
      if (loginKey) await setRedisValue(`alice:login:${loginKey}`, userId, 60 * 60 * 24 * 365);
      const companyName = match?.customer || "Заказчик";
      return res.status(200).json(aliceResponse(`Теперь работаю от имени компании ${companyName}. Чем могу помочь?`));
    }

    // Обновляем данные в RAG в фоне (не ждём), чтобы не съедать таймаут ответа Алисе
    const today = new Date();
    const dateTo = today.toISOString().split("T")[0];
    const from = new Date();
    from.setMonth(from.getMonth() - 6);
    const dateFrom = from.toISOString().split("T")[0];
    fetch(`${APP_DOMAIN}/api/perevozki`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login: bind.login, password: bind.password, dateFrom, dateTo, ...(bind.inn ? { inn: bind.inn } : {}) }),
    }).catch(() => {});

    const chatRes = await withTimeout(fetch(`${APP_DOMAIN}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: `alice_${userId}`,
        userId: String(userId),
        message: text,
        customer: bind?.customer || undefined,
        auth: { login: bind.login, password: bind.password },
        channel: "alice",
        model: "gpt-4o",
      }),
    }), CHAT_MS);
    if (chatRes.ok) {
      const data = await chatRes.json();
      if (data?.reply) {
        return res.status(200).json(aliceResponse(String(data.reply)));
      }
    }
  } catch {
    // ignore and fall through to default
  }

  return res
    .status(200)
    .json(
      aliceResponse(
        "Запрос обрабатывается дольше обычного. Повторите запрос через несколько секунд."
      )
    );
}

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initRequestContext, logError } from "./_lib/observability.js";
import { getPublicApiOrigin } from "../lib/publicApiOrigin.js";

const APP_DOMAIN = getPublicApiOrigin();
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

type AliceIntentName =
  | "summary"
  | "attention"
  | "shipment_status"
  | "in_transit"
  | "payments"
  | "deliveries"
  | "documents"
  | "company"
  | "unlink"
  | "help"
  | "fallback_chat";

type AliceIntent = {
  name: AliceIntentName;
  number?: string;
  period?: "today" | "yesterday" | "week" | "month" | "six_months";
  documentType?: "ЭР" | "АПП" | "СЧЕТ" | "УПД";
  companyQuery?: string;
};

const DOCUMENT_METHODS: Record<NonNullable<AliceIntent["documentType"]>, string> = {
  "ЭР": "ЭР",
  "АПП": "АПП",
  "СЧЕТ": "Счет",
  "УПД": "Акт",
};

function normalizeText(text: string): string {
  return String(text || "").toLowerCase().replace(/ё/g, "е").trim();
}

function hasAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word));
}

/** Нормализованный ключ номера: 0135702 и 135702 считаются одной перевозкой. */
function normalizeCargoNumber(value: any): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.replace(/^0+/, "") || digits;
}

function getOriginalCargoNumber(item: any): string {
  return String(item?.Number ?? item?.number ?? "").trim();
}

function extractCargoNumber(text: string): string | undefined {
  const direct = text.match(/\b0?\d{4,7}\b/);
  return direct ? direct[0] : undefined;
}

function extractDocumentType(text: string): AliceIntent["documentType"] {
  if (text.includes("упд") || text.includes("акт")) return "УПД";
  if (text.includes("апп")) return "АПП";
  if (text.includes("счет") || text.includes("счёт")) return "СЧЕТ";
  if (text.includes("эр") || text.includes("расписк")) return "ЭР";
  return undefined;
}

function detectPeriod(text: string): NonNullable<AliceIntent["period"]> {
  if (text.includes("вчера")) return "yesterday";
  if (text.includes("недел")) return "week";
  if (text.includes("месяц") || text.includes("месяц") || text.includes("мае") || text.includes("май")) return "month";
  if (text.includes("сегодня") || text.includes("день") || text.includes("сейчас")) return "today";
  return "six_months";
}

function classifyIntent(rawText: string, sessionState: any): AliceIntent {
  const text = normalizeText(rawText);
  const number = extractCargoNumber(text);
  const documentType = extractDocumentType(text);

  if (hasAny(text, ["что умеешь", "помощь", "помоги", "команды", "как пользоваться"])) return { name: "help" };
  if ((text.includes("отвяжи") && hasAny(text, ["компани", "заказчик"])) || text === "отвяжи") return { name: "unlink" };

  const companySwitchMatch = text.match(/(?:работай\s+от\s+имени|переключись\s+на|выбери\s+компанию|компания)\s+(.+)/i);
  if (companySwitchMatch && hasAny(text, ["работай", "переключись", "выбери", "компани"])) {
    return { name: "company", companyQuery: companySwitchMatch[1].trim() };
  }
  if (hasAny(text, ["какая компания", "какой заказчик", "кто выбран"])) return { name: "company" };

  if (documentType || hasAny(text, ["документ", "документы", "пришли", "отправь"])) {
    return { name: "documents", number, documentType };
  }

  if (number && hasAny(text, ["где", "статус", "перевозк", "груз", "найди", "когда", "что с"])) {
    return { name: "shipment_status", number };
  }

  if (hasAny(text, ["задерж", "опазд", "проблем", "риск", "срывает", "требует внимания"])) return { name: "attention" };
  if (hasAny(text, ["актуаль", "сводк", "что нового", "что сейчас", "кратко", "что в работе", "что у меня в работе"])) {
    return { name: "summary", period: detectPeriod(text) };
  }
  if (hasAny(text, ["оплат", "долг", "задолж", "счет", "счёт", "просроч"])) return { name: "payments" };
  if (hasAny(text, ["достав", "приехал", "пришло", "прибыл", "на доставке"])) {
    return { name: "deliveries", period: detectPeriod(text) };
  }
  if (hasAny(text, ["в пути", "в дороге", "едут", "перевозятся"])) return { name: "in_transit" };
  if (hasAny(text, ["сколько перевозок", "перевозок за", "перевозок на"])) return { name: "summary", period: detectPeriod(text) };
  if (sessionState?.pending_question === "shipment_number" && number) return { name: "shipment_status", number };
  if (sessionState?.pending_question === "document_number" && number) {
    return { name: "documents", number, documentType: sessionState?.document_type };
  }

  return { name: "fallback_chat" };
}

function dateKey(date: Date): string {
  return date.toISOString().split("T")[0];
}

function getRange(period: AliceIntent["period"] = "six_months") {
  const now = new Date();
  const to = new Date(now);
  const from = new Date(now);
  let label = "за последние шесть месяцев";

  if (period === "today") {
    label = "за сегодня";
  } else if (period === "yesterday") {
    from.setDate(from.getDate() - 1);
    to.setDate(to.getDate() - 1);
    label = "за вчера";
  } else if (period === "week") {
    from.setDate(from.getDate() - 7);
    label = "за неделю";
  } else if (period === "month") {
    from.setMonth(from.getMonth() - 1);
    label = "за месяц";
  } else {
    from.setMonth(from.getMonth() - 6);
  }

  return { dateFrom: dateKey(from), dateTo: dateKey(to), label };
}

function parseDateMs(value: any): number {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? time : 0;
}

function isDateInRange(value: any, dateFrom: string, dateTo: string): boolean {
  const raw = String(value ?? "").trim();
  if (!raw) return false;
  const key = raw.split("T")[0];
  return key >= dateFrom && key <= dateTo;
}

function isFerry(item: any): boolean {
  return item?.AK === true || item?.AK === "true" || item?.AK === "1" || item?.AK === 1;
}

function cityCode(value: any): string {
  const text = String(value ?? "").toLowerCase();
  if (text.includes("калининг") || text.includes("kgd")) return "KGD";
  if (text.includes("моск") || text.includes("msk")) return "MSK";
  return text.trim().toUpperCase();
}

function getApproxPlanDays(item: any): number {
  if (cityCode(item?.CitySender) === "KGD" && cityCode(item?.CityReceiver) === "MSK") return 60;
  return isFerry(item) ? 20 : 7;
}

function getDelayDays(item: any): number {
  const start = parseDateMs(item?.DatePrih);
  if (!start) return 0;
  const statusKey = getFilterKeyByStatus(item?.State);
  const end = statusKey === "delivered" ? parseDateMs(item?.DateVr) : Date.now();
  if (!end) return 0;
  const actualDays = Math.max(0, Math.round((end - start) / (24 * 60 * 60 * 1000)));
  return Math.max(0, actualDays - getApproxPlanDays(item));
}

function compactCargo(item: any) {
  return {
    Number: item?.Number,
    number: item?.number,
    State: item?.State,
    Sum: item?.Sum,
    CitySender: item?.CitySender,
    CityReceiver: item?.CityReceiver,
    StateBill: item?.StateBill,
    DatePrih: item?.DatePrih,
    DateVr: item?.DateVr,
    Mest: item?.Mest,
    PW: item?.PW,
    UPD: item?.UPD,
    BillNum: item?.BillNum,
    Bill_Number: item?.Bill_Number,
  };
}

function moneyRub(value: number): string {
  return `${Math.round(value).toLocaleString("ru-RU")} рублей`;
}

function getSum(item: any): number {
  const raw = item?.Sum;
  const n = typeof raw === "string" ? Number(raw.replace(",", ".")) : Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function formatDateForSpeech(value: any): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const [y, m, d] = raw.split("T")[0].split("-");
  if (y && m && d) return `${d}.${m}.${y}`;
  return raw;
}

function formatShipmentDetails(item: any): string {
  const numberPhrase = speechNumberPhrase(item?.Number ?? item?.number) || "—";
  const originalNumber = getOriginalCargoNumber(item);
  const status = item?.State ? normalizeStatus(item.State) : "статус не указан";
  const route = item?.CitySender || item?.CityReceiver ? ` Маршрут: ${item?.CitySender || "?"} — ${item?.CityReceiver || "?"}.` : "";
  const received = item?.DatePrih ? ` Принято ${formatDateForSpeech(item.DatePrih)}.` : "";
  const delivered = item?.DateVr ? ` Дата доставки ${formatDateForSpeech(item.DateVr)}.` : "";
  const bill = item?.StateBill ? ` Оплата: ${item.StateBill}.` : "";
  const docs: string[] = [];
  if (item?.BillNum || item?.Bill_Number) docs.push("счет");
  if (item?.UPD) docs.push("УПД");
  const docsText = docs.length ? ` Документы: ${docs.join(", ")}.` : "";
  return `Перевозка ${numberPhrase}${originalNumber ? ` (${originalNumber})` : ""}: ${status}.${route}${received}${delivered}${bill}${docsText} Могу отправить подробности в чат.`;
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
  const ctx = initRequestContext(req, res, "alice");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const body = req.body;
  const userId = String(body?.session?.user?.user_id || body?.session?.user_id || "anon");
  const text = getCommandText(body);
  const sessionState = body?.state?.session || {};

  if (text.includes("код проверки") || text.includes("проверка навыка") || text.includes("verification")) {
    return res.status(200).json(aliceResponse(`Код проверки: ${ALICE_VERIFICATION_CODE}`));
  }

  const bindRaw = await getRedisValue(`alice:bind:${userId}`);

  // Привязка по коду
  const code = extractCode(text);
  const normalizedForCode = normalizeText(text);
  const bindingByCode = !!code && (
    hasAny(normalizedForCode, ["код", "авторизац", "введи"]) ||
    (!bindRaw && normalizedForCode === code)
  );
  if (bindingByCode) {
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
      .json(aliceResponse(`Вы авторизованы под компанией ${companyName}. Я Грузик, AI-помощник HAULZ. Чем я могу вам помочь?`));
  }

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

  const fetchCargoItems = async (period: AliceIntent["period"] = "six_months") => {
    const range = getRange(period);
    const resData = await withTimeout(fetch(`${APP_DOMAIN}/api/perevozki`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        login: bind.login,
        password: bind.password,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        ...(bind.inn ? { inn: bind.inn } : {}),
      }),
    }), PEREVOZKI_MS);
    const payload: any = await resData.json();
    const items = Array.isArray(payload) ? payload : payload?.items || [];
    return { items, ...range };
  };

  const detailState = (items: any[], lastIntent: string, extra: Record<string, any> = {}) => ({
    awaiting_details: items.length > 0,
    last_intent: lastIntent,
    last_data: items.slice(0, 10).map(compactCargo),
    ...extra,
  });

  try {
    const intent = classifyIntent(text, sessionState);
    console.info("[alice] intent", {
      intent: intent.name,
      period: intent.period,
      hasNumber: !!intent.number,
      hasDocumentType: !!intent.documentType,
      userId,
    });

    if (sessionState?.awaiting_details && isYes(text)) {
      const data = Array.isArray(sessionState?.last_data) ? sessionState.last_data : [];
      const chatLines = data.slice(0, 10).map((i: any) => formatLineForChat(i));
      const header = "Написал в чат.\nНомер / дата / кол-во / плат вес / сумма\n";
      const body = chatLines.length ? chatLines.join("\n") : "Нет данных.";
      return res.status(200).json(aliceResponse(header + body, {
        ...sessionState,
        awaiting_details: false,
        pending_question: undefined,
      }));
    }

    if (intent.name === "help") {
      return res.status(200).json(aliceResponse(
        "Я могу сказать, что актуально по перевозкам, где конкретный груз, что надо оплатить, что доставлено сегодня, есть ли задержки, и подготовить ссылку на документ. Например: что требует внимания, где груз 135702, что надо оплатить."
      ));
    }

    if (intent.name === "unlink") {
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

    if (intent.name === "company") {
      if (!intent.companyQuery) {
        return res.status(200).json(aliceResponse(`Сейчас выбрана компания ${bind?.customer || "Заказчик"}.`));
      }
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
      const q = intent.companyQuery.toLowerCase();
      const match = list.find((b: any) => {
        const customer = String(b?.customer ?? "").toLowerCase();
        const inn = String(b?.inn ?? "").toLowerCase();
        return customer.includes(q) || q.includes(customer) || (inn && q.includes(inn));
      });
      if (!match) {
        const names = list.map((b: any) => b?.customer || "Без названия").slice(0, 5);
        return res.status(200).json(aliceResponse(`Компанию «${intent.companyQuery}» не нашла. Доступны: ${names.join(", ")}.`));
      }
      await setRedisValue(`alice:bind:${userId}`, JSON.stringify(match));
      const loginKey = String(match.login || "").trim().toLowerCase();
      if (loginKey) await setRedisValue(`alice:login:${loginKey}`, userId, 60 * 60 * 24 * 365);
      const companyName = match?.customer || "Заказчик";
      return res.status(200).json(aliceResponse(`Теперь работаю от имени компании ${companyName}. Чем могу помочь?`, {
        selected_company: companyName,
      }));
    }

    if (intent.name === "shipment_status") {
      if (!intent.number) {
        return res.status(200).json(aliceResponse("Назовите номер перевозки.", {
          pending_question: "shipment_number",
        }));
      }
      const { items } = await fetchCargoItems("six_months");
      const requested = normalizeCargoNumber(intent.number);
      const found = items.find((i: any) => normalizeCargoNumber(i?.Number ?? i?.number) === requested);
      if (found) {
        return res.status(200).json(aliceResponse(formatShipmentDetails(found), {
          last_intent: "shipment_status",
          last_number: getOriginalCargoNumber(found) || intent.number,
          last_data: [compactCargo(found)],
          awaiting_details: true,
        }));
      }
      return res.status(200).json(aliceResponse(`Перевозку номер ${speechNumberPhrase(intent.number)} не нашла. Проверьте номер или период.`));
    }

    if (intent.name === "documents") {
      const documentType = intent.documentType;
      if (!documentType) {
        return res.status(200).json(aliceResponse("Какой документ нужен: ЭР, АПП, счет или УПД?", {
          pending_question: "document_type",
          last_number: intent.number || sessionState?.last_number,
        }));
      }
      const number = intent.number || sessionState?.last_number;
      if (!number) {
        return res.status(200).json(aliceResponse("Назовите номер перевозки, по которой нужен документ.", {
          pending_question: "document_number",
          document_type: documentType,
        }));
      }
      const { items } = await fetchCargoItems("six_months");
      const found = items.find((i: any) => normalizeCargoNumber(i?.Number ?? i?.number) === normalizeCargoNumber(number));
      const originalNumber = getOriginalCargoNumber(found) || number;
      const shortRes = await withTimeout(fetch(`${APP_DOMAIN}/api/shorten-doc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          login: bind.login,
          password: bind.password,
          metod: DOCUMENT_METHODS[documentType],
          number: originalNumber,
          isRegisteredUser: true,
        }),
      }), PEREVOZKI_MS);
      const shortData: any = await shortRes.json().catch(() => ({}));
      if (shortRes.ok && shortData?.shortUrl) {
        return res.status(200).json(aliceResponse(`Подготовила ${documentType} по перевозке ${speechNumberPhrase(originalNumber)}. Ссылка в тексте ответа: ${shortData.shortUrl}`, {
          last_intent: "documents",
          last_number: originalNumber,
        }));
      }
      return res.status(200).json(aliceResponse(`Не удалось подготовить ${documentType} по перевозке ${speechNumberPhrase(originalNumber)}. Документ можно проверить в карточке перевозки.`));
    }

    if (intent.name === "payments") {
      const { items } = await fetchCargoItems("six_months");
      const unpaid = items.filter((i: any) => getPaymentFilterKey(i.StateBill) === "unpaid");
      const count = unpaid.length;
      const total = unpaid.reduce((sum: number, item: any) => sum + getSum(item), 0);
      const sorted = [...unpaid].sort((a, b) => parseDateMs(a?.DatePrih) - parseDateMs(b?.DatePrih));
      const nums = joinSpeechNumbers(sorted, 5);
      const msg =
        count === 0
          ? "К оплате ничего не вижу."
          : `К оплате ${count} ${wordПеревозки(count)} на сумму ${moneyRub(total)}${nums ? `. Номера ${nums}` : ""}. Хотите список?`;
      return res.status(200).json(aliceResponse(msg, detailState(sorted, "payments")));
    }

    if (intent.name === "in_transit") {
      const { items } = await fetchCargoItems("six_months");
      const inTransit = items.filter((i: any) => getFilterKeyByStatus(i.State) === "in_transit");
      const count = inTransit.length;
      const msg =
        count === 0
          ? "Сейчас нет перевозок в пути."
          : `В пути ${count} ${wordПеревозки(count)}${joinSpeechNumbers(inTransit, 7) ? `, номера ${joinSpeechNumbers(inTransit, 7)}` : ""}. Хотите подробнее?`;
      return res.status(200).json(aliceResponse(msg, detailState(inTransit, "in_transit")));
    }

    if (intent.name === "deliveries") {
      const { items, dateFrom, dateTo, label } = await fetchCargoItems(intent.period || "today");
      const delivering = items.filter((i: any) => getFilterKeyByStatus(i.State) === "delivering");
      const delivered = items.filter((i: any) => getFilterKeyByStatus(i.State) === "delivered" && (!i?.DateVr || isDateInRange(i.DateVr, dateFrom, dateTo)));
      const target = normalizeText(text).includes("на доставке") ? delivering : delivered;
      const prefix = normalizeText(text).includes("на доставке") ? "На доставке" : `Доставлено ${label}`;
      const count = target.length;
      const msg =
        count === 0
          ? `${prefix} перевозок нет.`
          : `${prefix} ${count} ${wordПеревозки(count)}${joinSpeechNumbers(target, 7) ? `, номера ${joinSpeechNumbers(target, 7)}` : ""}. Хотите список?`;
      return res.status(200).json(aliceResponse(msg, detailState(target, "deliveries", { period: intent.period || "today" })));
    }

    if (intent.name === "attention") {
      const { items } = await fetchCargoItems("six_months");
      const unpaid = items.filter((i: any) => getPaymentFilterKey(i.StateBill) === "unpaid");
      const delayed = items
        .map((item: any) => ({ item, delayDays: getDelayDays(item) }))
        .filter(({ item, delayDays }: any) => delayDays > 0 && getFilterKeyByStatus(item?.State) !== "delivered")
        .sort((a: any, b: any) => b.delayDays - a.delayDays);
      const delivering = items.filter((i: any) => getFilterKeyByStatus(i.State) === "delivering");
      if (delayed.length > 0) {
        const delayItems = delayed.map((x: any) => x.item);
        const maxDelay = delayed[0]?.delayDays || 0;
        return res.status(200).json(aliceResponse(`Есть ${delayed.length} ${wordПеревозки(delayed.length)} с риском задержки, максимальное отклонение около ${maxDelay} дней. Номера ${joinSpeechNumbers(delayItems, 5)}. Хотите список?`, detailState(delayItems, "attention")));
      }
      if (unpaid.length > 0) {
        const total = unpaid.reduce((sum: number, item: any) => sum + getSum(item), 0);
        return res.status(200).json(aliceResponse(`Сейчас требует внимания оплата: ${unpaid.length} ${wordПеревозки(unpaid.length)} на сумму ${moneyRub(total)}. Хотите список?`, detailState(unpaid, "payments")));
      }
      const msg =
        delivering.length > 0
          ? `Критичных вопросов не вижу. На доставке ${delivering.length} ${wordПеревозки(delivering.length)}.`
          : "Критичных вопросов не вижу: задержек и счетов к оплате нет.";
      return res.status(200).json(aliceResponse(msg));
    }

    if (intent.name === "summary") {
      const { items, dateFrom, dateTo } = await fetchCargoItems(intent.period || "six_months");
      const accepted = items.filter((i: any) => getFilterKeyByStatus(i.State) === "accepted");
      const inTransit = items.filter((i: any) => getFilterKeyByStatus(i.State) === "in_transit");
      const delivering = items.filter((i: any) => getFilterKeyByStatus(i.State) === "delivering");
      const deliveredToday = items.filter((i: any) => getFilterKeyByStatus(i.State) === "delivered" && (!i?.DateVr || isDateInRange(i.DateVr, dateFrom, dateTo)));
      const unpaid = items.filter((i: any) => getPaymentFilterKey(i.StateBill) === "unpaid");
      const delayed = items.filter((i: any) => getDelayDays(i) > 0 && getFilterKeyByStatus(i.State) !== "delivered");
      const unpaidSum = unpaid.reduce((sum: number, item: any) => sum + getSum(item), 0);
      const parts: string[] = [];
      if (delayed.length > 0) parts.push(`есть ${delayed.length} ${wordПеревозки(delayed.length)} с риском задержки`);
      if (unpaid.length > 0) parts.push(`к оплате ${unpaid.length} ${wordПеревозки(unpaid.length)} на ${moneyRub(unpaidSum)}`);
      parts.push(`в пути ${inTransit.length} ${wordПеревозки(inTransit.length)}`);
      if (delivering.length > 0) parts.push(`на доставке ${delivering.length}`);
      if (deliveredToday.length > 0) parts.push(`доставлено ${deliveredToday.length}`);
      if (accepted.length > 0) parts.push(`принято ${accepted.length}`);
      const important = delayed.length > 0 ? delayed : unpaid.length > 0 ? unpaid : inTransit;
      const msg = parts.length
        ? `Актуально: ${parts.join(", ")}.${important.length > 0 ? " Хотите список?" : ""}`
        : "Критичных вопросов не вижу. Активных перевозок и счетов к оплате нет.";
      return res.status(200).json(aliceResponse(msg, detailState(important, "summary")));
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
      const data: any = await chatRes.json();
      if (data?.reply) {
        return res.status(200).json(aliceResponse(String(data.reply)));
      }
    }
  } catch (error) {
    logError(ctx, "alice_handler_branch_failed", error);
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

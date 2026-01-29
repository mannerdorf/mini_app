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
  if (lower.includes("готов")) return "ready";
  if (lower.includes("доставке")) return "delivering";
  return "all";
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

/** Краткий список: только номера (для первого ответа) */
function formatBriefNumbers(items: any[], limit = 7) {
  return items.slice(0, limit).map((item) => {
    const number = item?.Number || item?.number || "-";
    return `номер ${number}`;
  });
}

/** Подробный список: номер, статус, сумма, маршрут, оплата */
function formatDetailedList(items: any[], limit = 10) {
  return items.slice(0, limit).map((item) => {
    const number = item?.Number || item?.number || "-";
    const status = item?.State ? normalizeStatus(item.State) : "";
    const sum = item?.Sum != null ? `, сумма ${item.Sum} ₽` : "";
    const route =
      item?.CitySender || item?.CityReceiver
        ? `, маршрут ${item.CitySender || "?"} — ${item.CityReceiver || "?"}`
        : "";
    const bill = item?.StateBill ? `, оплата: ${item.StateBill}` : "";
    return `№ ${number}${status ? `, статус ${status}` : ""}${sum}${route}${bill}`;
  });
}

function formatList(items: any[], limit = 3) {
  return items.slice(0, limit).map((item) => {
    const number = item?.Number || item?.number || "-";
    const status = item?.State ? normalizeStatus(item.State) : "";
    const sum = item?.Sum ? `, сумма ${item.Sum} ₽` : "";
    const statusPart = status ? `, статус ${status}` : "";
    return `№ ${number}${statusPart}${sum}`;
  });
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
      const lines = formatDetailedList(data, 10);
      if (intent === "in_transit") {
        return res.status(200).json(aliceResponse(lines.length ? `Подробности по перевозкам в пути: ${lines.join(". ")}` : "Подробностей нет.", { awaiting_details: false }));
      }
      if (intent === "unpaid_bills") {
        return res.status(200).json(aliceResponse(lines.length ? `Подробности по перевозкам, требующим оплаты: ${lines.join(". ")}` : "Подробностей нет.", { awaiting_details: false }));
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
      }));
      const briefText =
        count === 0
          ? "Сейчас нет перевозок в пути."
          : briefNums.length
            ? `В пути ${count} перевозок: ${briefNums.join(", ")}. Хотите подробнее?`
            : `В пути ${count} перевозок. Хотите подробнее?`;
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
      }));
      const briefText =
        count === 0
          ? "Перевозок, требующих оплаты, нет."
          : briefNums.length
            ? `Требуют оплаты ${count} перевозок: ${briefNums.join(", ")}. Хотите подробнее?`
            : `Требуют оплаты ${count} перевозок. Хотите подробнее?`;
      return res
        .status(200)
        .json(aliceResponse(briefText, { awaiting_details: count > 0, last_intent: "unpaid_bills", last_data: summary }));
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

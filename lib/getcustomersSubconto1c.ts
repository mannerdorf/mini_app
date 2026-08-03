import { parseCustomerSubcontoPayload, type ParsedCustomerSubconto } from "./customerSubcontoBalance.js";

export const GETAPI_BASE =
  "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GETAPI";
export const GETAPI_SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";

function innKey(inn: string): string {
  const digits = inn.replace(/\D/g, "");
  return digits || inn.trim();
}

function innMatches(a: string, b: string): boolean {
  const ka = innKey(a);
  const kb = innKey(b);
  return ka === kb || a.trim() === b.trim();
}

export function extractCustomerArray(raw: unknown): Record<string, unknown>[] {
  if (!raw || typeof raw !== "object") return [];
  if (Array.isArray(raw)) {
    return raw.filter((v) => v && typeof v === "object") as Record<string, unknown>[];
  }
  const o = raw as Record<string, unknown>;
  if (o.Success === false) return [];
  const from =
    o.Items ??
    o.items ??
    o.Customers ??
    o.customers ??
    o.Data ??
    o.data ??
    o.Result ??
    o.result ??
    o.Rows ??
    o.rows;
  if (Array.isArray(from)) {
    return from.filter((v) => v && typeof v === "object") as Record<string, unknown>[];
  }
  if (o.INN != null || o.Inn != null || o.inn != null) return [o];
  return Object.values(o).filter((v) => v && typeof v === "object") as Record<string, unknown>[];
}

/** Найти заказчика с debts в ответе Getcustomers (объект или массив). */
export function extractCustomerSubcontoFromPayload(
  raw: unknown,
  targetInn?: string,
): ParsedCustomerSubconto | null {
  if (!raw || typeof raw !== "object") return null;

  const o = raw as Record<string, unknown>;
  if (o.Success === false) return null;

  const direct = parseCustomerSubcontoPayload(raw);
  if (direct && (!targetInn || innMatches(direct.inn, targetInn))) {
    return direct;
  }

  for (const el of extractCustomerArray(raw)) {
    const parsed = parseCustomerSubcontoPayload(el);
    if (parsed && (!targetInn || innMatches(parsed.inn, targetInn))) {
      return parsed;
    }
  }

  return null;
}

export function shorten1cError(message: string): string {
  const raw = String(message ?? "").trim();
  if (!raw) return "Ошибка 1С";

  const notDefined = raw.match(/не определена\s*\(([^)]+)\)/i);
  if (notDefined?.[1]) {
    const fn = notDefined[1].trim();
    if (/^GetCustomer$/i.test(fn)) {
      return "В 1С нет метода GetCustomer — используется Getcustomers с параметром Inn";
    }
    return `Метод 1С «${fn}» недоступен`;
  }

  if (/GetCustomer/i.test(raw) && /не определена|not defined/i.test(raw)) {
    return "В 1С нет метода GetCustomer — используется Getcustomers с параметром Inn";
  }

  const jsonError =
    (raw.match(/"Error"\s*:\s*"([^"]+)"/i)?.[1] ??
      raw.match(/"error"\s*:\s*"([^"]+)"/i)?.[1])?.trim();
  if (jsonError) return shorten1cError(jsonError);

  if (raw.length > 140) {
    const tail = raw.match(/:\s*([^:{}]{10,140})$/);
    if (tail?.[1]) return tail[1].trim();
    return `${raw.slice(0, 137)}…`;
  }

  return raw;
}

function read1cError(data: unknown, text: string): string | undefined {
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    if (o.Success === false) {
      const message = (o.Error ?? o.error ?? o.message) as string | undefined;
      if (typeof message === "string" && message.trim()) return shorten1cError(message.trim());
    }
    const message = (o.Error ?? o.error ?? o.message) as string | undefined;
    if (typeof message === "string" && message.trim()) return shorten1cError(message.trim());
  }
  if (text.trim()) return shorten1cError(text.trim());
  return undefined;
}

function buildGetcustomersUrl(inn?: string, innParam: "Inn" | "INN" = "Inn"): string {
  const url = new URL(GETAPI_BASE);
  url.searchParams.set("metod", "Getcustomers");
  if (inn?.trim()) url.searchParams.set(innParam, inn.trim());
  return url.toString();
}

async function fetchGetcustomersJson(
  authLogin: string,
  authPassword: string,
  url: string,
): Promise<{ ok: boolean; status: number; data: unknown; text: string }> {
  const upstream = await fetch(url, {
    method: "GET",
    headers: {
      Auth: `Basic ${authLogin}:${authPassword}`,
      Authorization: GETAPI_SERVICE_AUTH,
    },
  });
  const text = await upstream.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: upstream.ok, status: upstream.status, data, text };
}

/** Субконто заказчика через GETAPI?metod=Getcustomers (&Inn=…). */
export async function fetchCustomerSubcontoFrom1C(
  authLogin: string,
  authPassword: string,
  inn: string,
): Promise<{ parsed: ParsedCustomerSubconto | null; error?: string }> {
  const innTrim = inn.trim();
  const attempts = [
    buildGetcustomersUrl(innTrim, "Inn"),
    buildGetcustomersUrl(innTrim, "INN"),
    buildGetcustomersUrl(undefined),
  ];

  let lastError: string | undefined;

  for (const url of attempts) {
    try {
      const upstream = await fetchGetcustomersJson(authLogin, authPassword, url);
      if (!upstream.ok) {
        lastError = read1cError(upstream.data, upstream.text) ?? `HTTP ${upstream.status}`;
        continue;
      }

      const parsed = extractCustomerSubcontoFromPayload(upstream.data, innTrim);
      if (parsed) return { parsed };

      lastError = "Заказчик не найден в ответе Getcustomers";
    } catch (e: unknown) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  return { parsed: null, error: lastError ?? "Не удалось загрузить субконто" };
}

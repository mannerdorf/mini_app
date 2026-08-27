/**
 * Загрузка заявки в 1С (DeliveryWebService) — формат PostB/HAULZ.
 * По умолчанию: POST JSON → …/PostZayavka2.
 * Переопределение: ONE_C_ZAYAVKA_UPLOAD_URL или legacy ONE_C_ZAYAVKA_UPLOAD_METOD (GETAPI?metod=…).
 */

export const GETAPI_BASE = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GETAPI";
export const POST_ZAYAVKA_URL = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/PostZayavka2";
export const GETAPI_SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";

export type ZayavkaGoodsRow = {
  ИДОтправления: string;
  ID: string;
  Name: string;
  ТМЦ: string;
  Количество: number;
  ОбъявленнаяСтоимостьТовара: number;
};

export type ZayavkaParcelRow = {
  ШтрихкодЗаказчика: string;
  ШтрихкодЗаказчика2?: string;
  Ид?: string;
  Товары: ZayavkaGoodsRow[];
};

export type ZayavkaUploadPayload = {
  ЗаказчикИНН: string;
  ОтправительИНН: string;
  ПолучательИНН: string;
  ПунктОтправки: string;
  ПунктНазначения: string;
  ДатаЗабораПлан: string;
  ОГ: boolean;
  НомерЗаявкиКлиента: string;
  Посылки: ZayavkaParcelRow[];
};

export type ZayavkaUpstreamRequestMeta = {
  method: "POST";
  url: string;
  headers: Record<string, string>;
  body: ZayavkaUploadPayload;
};

export type ZayavkaUploadResult =
  | {
      ok: true;
      status: number;
      nomerZayavki?: string;
      raw: unknown;
      responseText: string;
      upstreamRequest: ZayavkaUpstreamRequestMeta;
    }
  | {
      ok: false;
      status?: number;
      error: string;
      raw?: unknown;
      responseText?: string;
      upstreamRequest?: ZayavkaUpstreamRequestMeta;
    };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUIDish_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeInn(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "").trim();
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeDateOnly(value: unknown): string {
  const s = normalizeText(value);
  if (DATE_RE.test(s)) return s;
  const ru = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (ru) return `${ru[3]}-${ru[2]}-${ru[1]}`;
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return s.slice(0, 10);
}

function normalizeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export const GOODS_NAME_1C_MAX_LENGTH = 49;

/** Обрезает наименование товара под лимит поля Name в 1С. */
export function truncateGoodsNameFor1c(value: unknown, fallback = ""): string {
  const name = normalizeText(value) || fallback;
  if (!name) return "";
  return name.length > GOODS_NAME_1C_MAX_LENGTH ? name.slice(0, GOODS_NAME_1C_MAX_LENGTH) : name;
}

function normalizeGoods(raw: unknown): ZayavkaGoodsRow | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const idOtpravleniya = normalizeText(o.ИДОтправления ?? o.IdOtpravleniya ?? o.sendingId);
  const id = normalizeText(o.ID ?? o.Id ?? o.id ?? o.sku);
  const name = truncateGoodsNameFor1c(o.Name ?? o.name ?? o.Наименование);
  const tmc = truncateGoodsNameFor1c(o.ТМЦ ?? o.TMC ?? o.tmc ?? name, name);
  const qty = normalizeNumber(o.Количество ?? o.Quantity ?? o.quantity, 0);
  const cost = normalizeNumber(
    o.ОбъявленнаяСтоимостьТовара ?? o.DeclaredValue ?? o.declaredValue,
    0,
  );
  if (!idOtpravleniya && !id && !name) return null;
  return {
    ИДОтправления: idOtpravleniya,
    ID: id,
    Name: name,
    ТМЦ: tmc || name,
    Количество: qty > 0 ? qty : 1,
    ОбъявленнаяСтоимостьТовара: cost >= 0 ? cost : 0,
  };
}

function normalizeParcel(raw: unknown): ZayavkaParcelRow | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const barcode = normalizeText(o.ШтрихкодЗаказчика ?? o.Barcode ?? o.barcode);
  const barcode2 = normalizeText(o.ШтрихкодЗаказчика2 ?? o.Barcode2 ?? o.barcode2);
  const externalId = normalizeText(o.Ид ?? o.Id ?? o.id ?? o.externalId);
  const goodsRaw = o.Товары ?? o.Goods ?? o.goods ?? o.items;
  const goodsList = Array.isArray(goodsRaw) ? goodsRaw : [];
  const goods = goodsList.map(normalizeGoods).filter((g): g is ZayavkaGoodsRow => g != null);
  if (!barcode && goods.length === 0) return null;
  return {
    ШтрихкодЗаказчика: barcode,
    ...(barcode2 ? { ШтрихкодЗаказчика2: barcode2 } : {}),
    ...(externalId ? { Ид: externalId } : {}),
    Товары: goods,
  };
}

/** Извлекает тело заявки из корня JSON или обёртки order/zayavka. */
export function extractZayavkaBody(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.ЗаказчикИНН != null || o.Посылки != null || o.ПунктОтправки != null) return o;
  const nested = o.order ?? o.zayavka ?? o.Zayavka ?? o.payload;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }
  return o;
}

export function normalizeZayavkaUploadPayload(raw: unknown):
  | { ok: true; payload: ZayavkaUploadPayload }
  | { ok: false; error: string } {
  const body = extractZayavkaBody(raw);
  if (!body) return { ok: false, error: "Invalid JSON body" };

  const customerInn = normalizeInn(body.ЗаказчикИНН ?? body.CustomerINN ?? body.customerInn);
  if (!customerInn || customerInn.length < 10) {
    return { ok: false, error: "ЗаказчикИНН обязателен (10–12 цифр)" };
  }

  const punktOtpravki = normalizeText(body.ПунктОтправки ?? body.punktOtpravki ?? body.fromPvzRef);
  const punktNaznacheniya = normalizeText(body.ПунктНазначения ?? body.punktNaznacheniya ?? body.toPvzRef);
  if (!punktOtpravki) return { ok: false, error: "ПунктОтправки обязателен" };
  if (!punktNaznacheniya) return { ok: false, error: "ПунктНазначения обязателен" };

  const pickupDate = normalizeDateOnly(body.ДатаЗабораПлан ?? body.dataZabora ?? body.pickupDate);
  if (!DATE_RE.test(pickupDate)) {
    return { ok: false, error: "ДатаЗабораПлан: формат YYYY-MM-DD" };
  }

  const parcelsRaw = body.Посылки ?? body.Parcels ?? body.parcels ?? body.packages;
  if (!Array.isArray(parcelsRaw) || parcelsRaw.length === 0) {
    return { ok: false, error: "Посылки: нужен непустой массив" };
  }
  const parcels = parcelsRaw.map(normalizeParcel).filter((p): p is ZayavkaParcelRow => p != null);
  if (parcels.length === 0) {
    return { ok: false, error: "Посылки: укажите ШтрихкодЗаказчика или Товары" };
  }

  const ogRaw = body.ОГ ?? body.OG ?? body.dangerous ?? body.opasnyGruz;
  const og = ogRaw === true || ogRaw === "true" || ogRaw === 1 || ogRaw === "1";

  return {
    ok: true,
    payload: {
      ЗаказчикИНН: customerInn,
      ОтправительИНН: normalizeInn(body.ОтправительИНН ?? body.SenderINN ?? body.senderInn),
      ПолучательИНН: normalizeInn(body.ПолучательИНН ?? body.ReceiverINN ?? body.receiverInn),
      ПунктОтправки: punktOtpravki,
      ПунктНазначения: punktNaznacheniya,
      ДатаЗабораПлан: pickupDate,
      ОГ: og,
      НомерЗаявкиКлиента: normalizeText(
        body.НомерЗаявкиКлиента ?? body.ClientRequestNumber ?? body.clientRequestNumber,
      ),
      Посылки: parcels,
    },
  };
}

export function get1cOrderUploadCredentials(): { login: string; password: string } | null {
  const login = String(
    process.env.ONE_C_ZAYAVKA_UPLOAD_LOGIN ??
      process.env.HAULZ_1C_SERVICE_LOGIN ??
      process.env.PEREVOZKI_SERVICE_LOGIN ??
      "",
  ).trim();
  const password = String(
    process.env.ONE_C_ZAYAVKA_UPLOAD_PASSWORD ??
      process.env.HAULZ_1C_SERVICE_PASSWORD ??
      process.env.PEREVOZKI_SERVICE_PASSWORD ??
      "",
  ).trim();
  if (!login || !password) return null;
  return { login, password };
}

export function buildZayavkaUploadUrl(): string {
  const explicit = String(process.env.ONE_C_ZAYAVKA_UPLOAD_URL ?? "").trim();
  if (explicit) return explicit;
  // Legacy: явный metod → GETAPI?metod=… (раньше LoadZayavka).
  const metod = String(process.env.ONE_C_ZAYAVKA_UPLOAD_METOD ?? "").trim();
  if (metod) {
    const url = new URL(GETAPI_BASE);
    url.searchParams.set("metod", metod);
    return url.toString();
  }
  return POST_ZAYAVKA_URL;
}

/** Метаданные HTTP-запроса, который бэкенд отправляет в 1С (для песочницы). */
export function buildZayavkaUpstreamRequestMeta(payload: ZayavkaUploadPayload): ZayavkaUpstreamRequestMeta {
  const creds = get1cOrderUploadCredentials();
  return {
    method: "POST",
    url: buildZayavkaUploadUrl(),
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Accept: "application/json, text/plain, */*",
      Auth: creds ? `Basic ${creds.login}:${creds.password}` : "(PEREVOZKI_SERVICE_LOGIN/PASSWORD не заданы)",
      Authorization: GETAPI_SERVICE_AUTH,
    },
    body: payload,
  };
}

/** Убирает пароли из заголовков перед показом в UI-песочнице. */
export function sanitizeZayavkaUpstreamRequestForSandbox(
  meta: ZayavkaUpstreamRequestMeta | undefined | null,
): ZayavkaUpstreamRequestMeta | null {
  if (!meta) return null;
  const headers = { ...meta.headers };
  for (const key of ["Auth", "Authorization"] as const) {
    const raw = headers[key];
    if (!raw) continue;
    const basic = raw.match(/^Basic\s+(.+)$/i);
    if (!basic) {
      headers[key] = "***";
      continue;
    }
    const cred = basic[1];
    if (cred.includes(":")) {
      const login = cred.split(":")[0];
      headers[key] = `Basic ${login}:***`;
    } else {
      headers[key] = "Basic ***";
    }
  }
  return { ...meta, headers };
}

function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function extractNomerZayavki(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const direct = normalizeText(
    o.НомерЗаявки ?? o.Number ?? o.number ?? o.nomerZayavki ?? o.OrderNumber,
  );
  if (direct) return direct;
  const nested = o.result ?? o.Result ?? o.data ?? o.Data ?? o.zayavka ?? o.Zayavka;
  if (nested && typeof nested === "object") return extractNomerZayavki(nested);
  return undefined;
}

function extract1cError(raw: unknown, fallback: string): string {
  if (!raw || typeof raw !== "object") return fallback;
  const o = raw as Record<string, unknown>;
  if (o.Success === false) {
    return normalizeText(o.Error ?? o.error ?? o.message) || fallback;
  }
  const msg = normalizeText(o.Error ?? o.error ?? o.message);
  return msg || fallback;
}

/** POST JSON заявки в 1С. */
export async function uploadZayavkaTo1c(payload: ZayavkaUploadPayload): Promise<ZayavkaUploadResult> {
  const upstreamRequest = buildZayavkaUpstreamRequestMeta(payload);
  const creds = get1cOrderUploadCredentials();
  if (!creds) {
    return {
      ok: false,
      error:
        "Не настроены учётные данные 1С (PEREVOZKI_SERVICE_LOGIN/PASSWORD или HAULZ_1C_SERVICE_*)",
      upstreamRequest,
    };
  }

  const url = upstreamRequest.url;
  try {
    const upstream = await fetch(url, {
      method: upstreamRequest.method,
      headers: upstreamRequest.headers,
      body: JSON.stringify(payload),
    });
    const text = await upstream.text();
    const parsed = parseJsonLoose(text);

    if (!upstream.ok) {
      return {
        ok: false,
        status: upstream.status,
        error: extract1cError(parsed, text || upstream.statusText || `HTTP ${upstream.status}`),
        raw: parsed,
        responseText: text,
        upstreamRequest,
      };
    }

    if (parsed && typeof parsed === "object" && (parsed as Record<string, unknown>).Success === false) {
      return {
        ok: false,
        status: upstream.status,
        error: extract1cError(parsed, "1С отклонила заявку"),
        raw: parsed,
        responseText: text,
        upstreamRequest,
      };
    }

    return {
      ok: true,
      status: upstream.status,
      nomerZayavki: extractNomerZayavki(parsed),
      raw: parsed,
      responseText: text,
      upstreamRequest,
    };
  } catch (e: unknown) {
    return {
      ok: false,
      error: (e as Error)?.message || "Network error calling 1C",
      upstreamRequest,
    };
  }
}

export function isLikelyPvzRef(value: string): boolean {
  return UUIDish_RE.test(value.trim());
}

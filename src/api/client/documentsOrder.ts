import type { AuthData } from "../../types";
import type {
  AddressSelection,
  CalculatorOptions,
  DeliveryParty,
  Direction,
  MainlineMode,
  ParcelPlace,
  QuoteResult,
} from "../../../lib/haulzCalculator/types";
import type { FivepostParsedRow } from "../../../lib/fivepost/types";
import type { TableRow } from "../../features/documents/orders/NewOrderModal";

export type DocumentsSuggestItem = {
  id?: string;
  uri?: string;
  label: string;
  fullAddress: string;
  point?: { lat: number; lon: number };
};

export type DocumentsGeocodeResult = {
  label: string;
  fullAddress: string;
  point: { lat: number; lon: number };
};

export type DocumentsAuthScope = {
  login: string;
  password: string;
  inn: string;
  customerName?: string | null;
};

function authBody(auth: DocumentsAuthScope, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    login: auth.login,
    password: auth.password,
    inn: auth.inn,
    customerName: auth.customerName || undefined,
    ...extra,
  });
}

function authHeaders(auth: DocumentsAuthScope): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-login": auth.login,
    "x-password": auth.password,
  };
}

function parseError(resOrStatus: Response | number, data: unknown): string {
  if (typeof (data as { error?: string })?.error === "string") return (data as { error: string }).error;
  const status = typeof resOrStatus === "number" ? resOrStatus : resOrStatus.status;
  return `HTTP ${status}`;
}

export async function fetchDocumentsAddressSuggest(
  auth: DocumentsAuthScope,
  q: string,
  city?: "moscow" | "kaliningrad",
): Promise<DocumentsSuggestItem[]> {
  const res = await fetch("/api/documents/address-suggest", {
    method: "POST",
    headers: authHeaders(auth),
    body: authBody(auth, { q, city }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(parseError(res, data));
  return (data as { items?: DocumentsSuggestItem[] }).items || [];
}

export async function fetchDocumentsGeocode(
  auth: DocumentsAuthScope,
  params: {
    address?: string;
    uri?: string;
    city?: "moscow" | "kaliningrad";
    lat?: number;
    lon?: number;
  },
): Promise<DocumentsGeocodeResult> {
  const res = await fetch("/api/documents/geocode", {
    method: "POST",
    headers: authHeaders(auth),
    body: authBody(auth, params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(parseError(res, data));
  const r = data as DocumentsGeocodeResult;
  if (!r.point) throw new Error("Адрес не найден");
  return r;
}

export async function fetchDocumentsOrderOptions(
  auth: DocumentsAuthScope,
  direction: Direction,
  chargeableKg: number,
): Promise<CalculatorOptions> {
  const qs = new URLSearchParams({
    direction,
    chargeable_kg: String(chargeableKg),
    login: auth.login,
    password: auth.password,
    inn: auth.inn,
  });
  const res = await fetch(`/api/documents/order-options?${qs.toString()}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(parseError(res, data));
  return (data as { options: CalculatorOptions }).options;
}

export type DocumentsOrderQuotePayload = {
  from: AddressSelection;
  to: AddressSelection;
  places: ParcelPlace[];
  mainlineMode: MainlineMode;
  direction?: Direction;
  declaredValueRub?: number;
  extraCodes?: string[];
  fromParty?: DeliveryParty;
  toParty?: DeliveryParty;
};

export async function fetchDocumentsOrderQuote(
  auth: DocumentsAuthScope,
  payload: DocumentsOrderQuotePayload,
): Promise<QuoteResult> {
  const res = await fetch("/api/documents/order-quote", {
    method: "POST",
    headers: authHeaders(auth),
    body: authBody(auth, payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(parseError(res, data));
  return (data as { quote: QuoteResult }).quote;
}

export type DocumentsOrderAttachment = {
  name: string;
  mimeType?: string;
  base64: string;
};

export type DocumentsOrderSubmitPayload = DocumentsOrderQuotePayload & {
  punktOtpravki: string;
  punktNaznacheniya: string;
  fromPvzRef?: string;
  toPvzRef?: string;
  fromAddressType?: "pvz" | "custom" | "warehouse";
  toAddressType?: "pvz" | "custom" | "warehouse";
  nomerZayavkiKlienta?: string;
  dataZabora: string;
  tableRows?: TableRow[];
  fivepostBatchId?: number | null;
  attachments?: DocumentsOrderAttachment[];
};

export type DocumentsOrder1cSubmitPayload = {
  ЗаказчикИНН: string;
  ОтправительИНН?: string;
  ПолучательИНН?: string;
  ПунктОтправки: string;
  ПунктНазначения: string;
  ДатаЗабораПлан: string;
  ОГ?: boolean;
  НомерЗаявкиКлиента?: string;
  Посылки: Array<{
    ШтрихкодЗаказчика: string;
    ШтрихкодЗаказчика2?: string;
    Ид?: string;
    Товары: Array<{
      ИДОтправления?: string;
      ID?: string;
      Name: string;
      ТМЦ?: string;
      Количество: number;
      ОбъявленнаяСтоимостьТовара: number;
    }>;
  }>;
};

import { postJsonXhr } from "./postJsonXhr";

export type DocumentsOrder1cSubmitResult = {
  ok: boolean;
  status: number;
  nomerZayavki: string | null;
  message: string;
  error?: string;
  /** Сырой ответ 1С / API (для песочницы в форме заявки). */
  upstream?: unknown;
  request_id?: string;
  raw?: unknown;
};

export class DocumentsOrder1cSubmitError extends Error {
  status: number;
  upstream?: unknown;
  request_id?: string;
  raw?: unknown;

  constructor(message: string, opts: { status: number; upstream?: unknown; request_id?: string; raw?: unknown }) {
    super(message);
    this.name = "DocumentsOrder1cSubmitError";
    this.status = opts.status;
    this.upstream = opts.upstream;
    this.request_id = opts.request_id;
    this.raw = opts.raw;
  }
}

export async function submitOrderTo1c(
  auth: DocumentsAuthScope,
  order: DocumentsOrder1cSubmitPayload,
): Promise<DocumentsOrder1cSubmitResult> {
  // flat — без конфликта на Vercel; затем пути на VPS; 405/404 → следующий.
  const endpoints = [
    "/api/order-submit-1c",
    "/api/orders/submit-1c",
    "/api/documents/order-submit-1c",
  ] as const;
  let lastError: DocumentsOrder1cSubmitError | null = null;
  const body = authBody(auth, { order });
  const headers = authHeaders(auth);

  for (const endpoint of endpoints) {
    const res = await postJsonXhr(endpoint, headers, body);
    const data =
      res.data && typeof res.data === "object" && !Array.isArray(res.data)
        ? (res.data as Record<string, unknown>)
        : ({ raw: res.data } as Record<string, unknown>);
    const upstream = data.upstream ?? data;
    const requestId = typeof data.request_id === "string" ? data.request_id : undefined;
    const meta = {
      endpoint: res.url,
      client_method: res.method,
      received_method: data.received_method ?? null,
      http_status: res.status,
    };

    // На Vercel старый nested path может отдавать 405 из‑за конфликта с api/orders.
    if (res.status === 404 || res.status === 405) {
      lastError = new DocumentsOrder1cSubmitError(parseError(res.status, data), {
        status: res.status,
        upstream,
        request_id: requestId,
        raw: { ...data, ...meta },
      });
      continue;
    }

    if (res.status < 200 || res.status >= 300) {
      throw new DocumentsOrder1cSubmitError(parseError(res.status, data), {
        status: res.status,
        upstream,
        request_id: requestId,
        raw: { ...data, ...meta },
      });
    }

    return {
      ok: true,
      status: res.status,
      nomerZayavki: (data.nomerZayavki as string | null | undefined) ?? null,
      message: typeof data.message === "string" ? data.message : "Заявка передана в 1С",
      upstream,
      request_id: requestId,
      raw: { ...data, ...meta },
    };
  }

  throw (
    lastError ||
    new DocumentsOrder1cSubmitError("Не найден API оформления заявки в 1С", { status: 404 })
  );
}

export async function submitDocumentsOrder(
  auth: DocumentsAuthScope,
  payload: DocumentsOrderSubmitPayload,
): Promise<{ nomerZayavki: string; quote: QuoteResult; emailSent: boolean; message: string }> {
  const res = await fetch("/api/documents/order-submit", {
    method: "POST",
    headers: authHeaders(auth),
    body: authBody(auth, payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(parseError(res, data));
  const d = data as {
    nomerZayavki: string;
    quote: QuoteResult;
    emailSent?: boolean;
    message?: string;
  };
  return {
    nomerZayavki: d.nomerZayavki,
    quote: d.quote,
    emailSent: d.emailSent === true,
    message: d.message || "Заявка зарегистрирована",
  };
}

export type DocumentsFivepostRow = {
  lineNo: number;
  clientOrderNo: string;
  partnerOrderNo: string;
  teBarcode: string;
  placesCount: number;
  omniBarcode: string;
  itemName: string;
  itemNameRu: string;
  unitCost: number | null;
  totalCost: number | null;
  weightG: number | null;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
};

export type DocumentsFivepostImportResult = {
  batchId: number;
  rowCount: number;
  translatedCount: number;
  needsTranslationCount: number;
  rows: DocumentsFivepostRow[];
};

function numOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeDocumentsFivepostRow(raw: Record<string, unknown>): DocumentsFivepostRow {
  return {
    lineNo: Number(raw.lineNo ?? raw.line_no ?? 0),
    clientOrderNo: String(raw.clientOrderNo ?? raw.client_order_no ?? ""),
    partnerOrderNo: String(raw.partnerOrderNo ?? raw.partner_order_no ?? ""),
    teBarcode: String(raw.teBarcode ?? raw.te_barcode ?? ""),
    placesCount: Math.max(1, Math.round(Number(raw.placesCount ?? raw.places_count) || 1)),
    omniBarcode: String(raw.omniBarcode ?? raw.omni_barcode ?? ""),
    itemName: String(raw.itemName ?? raw.item_name ?? ""),
    itemNameRu: String(raw.itemNameRu ?? raw.item_name_ru ?? raw.itemName ?? raw.item_name ?? ""),
    unitCost: numOrNull(raw.unitCost ?? raw.unit_cost),
    totalCost: numOrNull(raw.totalCost ?? raw.total_cost),
    weightG: numOrNull(raw.weightG ?? raw.weight_g),
    lengthMm: numOrNull(raw.lengthMm ?? raw.length_mm),
    widthMm: numOrNull(raw.widthMm ?? raw.width_mm),
    heightMm: numOrNull(raw.heightMm ?? raw.height_mm),
  };
}

function normalizeDocumentsFivepostImportResult(data: Record<string, unknown>): DocumentsFivepostImportResult {
  const rowsRaw = Array.isArray(data.rows) ? data.rows : [];
  return {
    batchId: Number(data.batchId ?? data.batch_id ?? 0),
    rowCount: Number(data.rowCount ?? data.row_count ?? rowsRaw.length),
    translatedCount: Number(data.translatedCount ?? data.translated_count ?? 0),
    needsTranslationCount: Number(data.needsTranslationCount ?? data.needs_translation_count ?? 0),
    rows: rowsRaw
      .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
      .map((row) => normalizeDocumentsFivepostRow(row)),
  };
}

export async function saveDocumentsFivepostRows(
  auth: DocumentsAuthScope,
  payload: { filename: string; route?: Direction; rows: FivepostParsedRow[] },
): Promise<DocumentsFivepostImportResult> {
  const res = await fetch("/api/documents/fivepost-save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-login": auth.login,
      "x-password": auth.password,
    },
    body: JSON.stringify({
      login: auth.login,
      password: auth.password,
      inn: auth.inn,
      customerName: auth.customerName || undefined,
      filename: payload.filename,
      route: payload.route,
      rows: payload.rows,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
  if (!res.ok) throw new Error(data?.error || `Ошибка сохранения (${res.status})`);
  return normalizeDocumentsFivepostImportResult(data);
}

/** @deprecated Используйте parseFivepostShipmentFile + saveDocumentsFivepostRows */
export async function importDocumentsFivepostFile(
  auth: DocumentsAuthScope,
  file: File,
  opts?: { route?: Direction },
): Promise<DocumentsFivepostImportResult> {
  const form = new FormData();
  form.append("file", file);
  form.append("login", auth.login);
  form.append("password", auth.password);
  form.append("inn", auth.inn);
  if (auth.customerName) form.append("customerName", auth.customerName);
  if (opts?.route) form.append("route", opts.route);
  form.append("translate", "0");

  const res = await fetch("/api/documents/fivepost-import", {
    method: "POST",
    headers: {
      "x-login": auth.login,
      "x-password": auth.password,
    },
    body: form,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
  if (!res.ok) throw new Error(data?.error || `Ошибка импорта (${res.status})`);
  return normalizeDocumentsFivepostImportResult(data);
}

export async function translateDocumentsFivepostBatch(
  auth: DocumentsAuthScope,
  batchId: number,
): Promise<DocumentsFivepostImportResult> {
  const res = await fetch("/api/documents/fivepost-translate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-login": auth.login,
      "x-password": auth.password,
    },
    body: JSON.stringify({
      login: auth.login,
      password: auth.password,
      inn: auth.inn,
      customerName: auth.customerName || undefined,
      batchId,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
  if (!res.ok) throw new Error(data?.error || `Ошибка перевода (${res.status})`);
  return normalizeDocumentsFivepostImportResult(data);
}

export async function deleteDocumentsOrder(
  auth: Pick<DocumentsAuthScope, "login" | "password" | "inn" | "customerName">,
  pendingOrderId: number,
  nomerZayavki?: string,
): Promise<void> {
  const res = await fetch("/api/documents/order-delete", {
    method: "POST",
    headers: authHeaders(auth as DocumentsAuthScope),
    body: authBody(auth as DocumentsAuthScope, {
      pendingOrderId,
      nomerZayavki: nomerZayavki || undefined,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(parseError(res, data));
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });
}

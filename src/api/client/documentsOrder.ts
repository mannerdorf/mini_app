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

function parseError(res: Response, data: unknown): string {
  if (typeof (data as { error?: string })?.error === "string") return (data as { error: string }).error;
  return `HTTP ${res.status}`;
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
  nomerZayavki?: string;
  dataZabora: string;
  tableRows?: TableRow[];
  fivepostBatchId?: number | null;
  attachments?: DocumentsOrderAttachment[];
};

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
  const data = (await res.json().catch(() => ({}))) as DocumentsFivepostImportResult & { error?: string };
  if (!res.ok) throw new Error(data?.error || `Ошибка сохранения (${res.status})`);
  return data;
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
  const data = (await res.json().catch(() => ({}))) as DocumentsFivepostImportResult & { error?: string };
  if (!res.ok) throw new Error(data?.error || `Ошибка импорта (${res.status})`);
  return data;
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
  const data = (await res.json().catch(() => ({}))) as DocumentsFivepostImportResult & { error?: string };
  if (!res.ok) throw new Error(data?.error || `Ошибка перевода (${res.status})`);
  return data;
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

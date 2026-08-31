/**
 * Опрос по заказчику (INN): маппинг статусов 1С → события уведомлений и шаблоны для Telegram.
 */

import {
  CARGO_STAGE_EVENT_IDS,
  cargoStageEventLabel,
  type CargoStageEventId,
} from "./notificationCargoEvents.js";
import { getOrderCustomerInn } from "./orderCustomerScope.js";
import { normalizeNotificationInn } from "./notificationInnScope.js";
import { cacheHistoryDateFrom } from "./cacheHistoryDays.js";

export type { CargoStageEventId } from "./notificationCargoEvents.js";
export {
  CARGO_NOTIFICATION_STAGES,
  CARGO_STAGE_EVENT_IDS,
  getCargoStageEventIdFromState,
  getCargoStageEventsOnStateChange,
  isCargoStageNotificationEnabled,
  isRecentNotificationItem,
  notificationItemDate,
  RECENT_CARGO_NOTIFY_DAYS,
} from "./notificationCargoEvents.js";

const PEREVOZKI_BASE =
  "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetPerevozki";
const INVOICES_BASE =
  "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetIinvoices";
const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";

export type CargoEvent = CargoStageEventId | "bill_created" | "bill_paid";

/** @deprecated Coarse filter; для админки и фильтров списка. */
export type LegacyCargoStatusKey = "accepted" | "in_transit" | "delivered";

function pickFirst(item: any, keys: string[]): unknown {
  for (const key of keys) {
    const v = item?.[key];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return undefined;
}

const JUNK_BILL_NUMBERS = new Set([
  "0",
  "false",
  "true",
  "-",
  "—",
  "нет",
  "да",
  "null",
  "undefined",
  "none",
  "выставлен",
  "выставлен счет",
  "выставлен счёт",
]);

function isPlausibleBillNumber(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "object" || typeof value === "boolean") return false;
  const s = String(value).trim();
  if (!s || JUNK_BILL_NUMBERS.has(s.toLowerCase())) return false;
  return /\d/.test(s);
}

function pickFirstScalarBill(record: Record<string, unknown> | null | undefined, keys: readonly string[]): string {
  if (!record) return "";
  for (const key of keys) {
    const value = record[key];
    if (!isPlausibleBillNumber(value)) continue;
    return String(value).trim();
  }
  return "";
}

const NESTED_WRAPPER_KEYS = ["Response", "Data", "Result", "result", "data", "items", "Items"] as const;
const NESTED_INVOICE_KEYS = ["Invoice", "invoice", "Счет", "Счёт", "Bill", "BillDoc"] as const;

function pushNestedRecords(
  out: Array<{ record: Record<string, unknown>; allowInvoiceNumber: boolean }>,
  nested: unknown,
  allowInvoiceNumber: boolean,
): void {
  if (Array.isArray(nested)) {
    for (const row of nested) {
      if (row && typeof row === "object" && !Array.isArray(row)) {
        out.push({ record: row as Record<string, unknown>, allowInvoiceNumber });
      }
    }
    return;
  }
  if (nested && typeof nested === "object") {
    out.push({ record: nested as Record<string, unknown>, allowInvoiceNumber });
  }
}

function billRecordCandidates(item: any): Array<{ record: Record<string, unknown>; allowInvoiceNumber: boolean }> {
  if (!item || typeof item !== "object") return [];
  const root = item as Record<string, unknown>;
  const out: Array<{ record: Record<string, unknown>; allowInvoiceNumber: boolean }> = [
    { record: root, allowInvoiceNumber: false },
  ];
  for (const key of NESTED_INVOICE_KEYS) {
    pushNestedRecords(out, root[key], true);
  }
  for (const key of NESTED_WRAPPER_KEYS) {
    pushNestedRecords(out, root[key], false);
  }
  return out;
}

const BILL_NUMBER_KEYS = [
  "NumberBill",
  "BillNumber",
  "BillNum",
  "Bill_Number",
  "billnum",
  "bill_number",
  "Invoice",
  "InvoiceNumber",
  "Счет",
  "Счёт",
  "НомерСчета",
  "НомерСчёта",
] as const;

const INVOICE_DOCUMENT_NUMBER_KEYS = ["Number", "number", "Номер", "N"] as const;

function cargoNumberOf(item: any): string {
  return String(item?.Number ?? item?.number ?? item?.НомерПеревозки ?? "").trim();
}

function sameDocNumber(a: string, b: string): boolean {
  const na = a.replace(/^0000-/, "").replace(/^0+/, "") || "";
  const nb = b.replace(/^0000-/, "").replace(/^0+/, "") || "";
  return Boolean(na && nb && na === nb);
}

/** ИНН заказчика из записи перевозки/счёта (как в perevozki API). */
export function notificationItemInn(item: any): string {
  const fromOrder = getOrderCustomerInn(item);
  if (fromOrder) return fromOrder;
  const v =
    item?.КлиентИНН ??
    item?.КлиентИнн ??
    item?.ИННЗаказчика ??
    item?.CustomerINN ??
    item?.CustomerInn ??
    item?.customerInn ??
    item?.INNCustomer ??
    item?.InnCustomer ??
    item?.INN ??
    item?.Inn ??
    item?.inn ??
    item?.ЗаказчикИНН ??
    "";
  return normalizeNotificationInn(v);
}

/** Номер счёта строго из полей счёта — без подстановки номера перевозки. */
export function pickBillNumber(item: any): string {
  const cargoNumber = cargoNumberOf(item);
  for (const { record, allowInvoiceNumber } of billRecordCandidates(item)) {
    const keys = allowInvoiceNumber ? [...BILL_NUMBER_KEYS, ...INVOICE_DOCUMENT_NUMBER_KEYS] : [...BILL_NUMBER_KEYS];
    const hit = pickFirstScalarBill(record, keys);
    if (!hit) continue;
    if (cargoNumber && sameDocNumber(hit, cargoNumber)) continue;
    return hit;
  }
  return "";
}

const BILL_SUM_KEYS = ["SumDoc", "SumBill", "AmountBill", "СуммаДокумента", "Sum", "Amount", "Сумма"] as const;

/** Сумма счёта: поля перевозки, затем вложенный Invoice. */
export function pickBillSumRaw(item: any): unknown {
  for (const { record } of billRecordCandidates(item)) {
    const hit = pickFirst(record, [...BILL_SUM_KEYS]);
    if (hit !== undefined && hit !== null && typeof hit !== "object" && String(hit).trim() !== "") {
      return hit;
    }
  }
  return undefined;
}

/** В данных есть явный номер счёта (не номер перевозки). */
export function hasRealBillNumber(item: any): boolean {
  return pickBillNumber(item).length > 0;
}

/** Признак выставленного счёта: номер счёта и/или StateBill из 1С. */
export function hasBillSignal(item: any): boolean {
  if (hasRealBillNumber(item)) return true;
  const stateBill = String(item?.StateBill ?? item?.stateBill ?? item?.StatusBill ?? "").trim();
  return stateBill.length > 0;
}

/** State 1С → ключ события перевозки (как в alice getFilterKeyByStatus). */
export function getCargoStatusKey(state: string | undefined): LegacyCargoStatusKey | null {
  if (!state) return null;
  const lower = state.toLowerCase().trim();
  // Промежуточный этап перед delivered: "готов к выдаче" шлем тем же шаблоном, что и accepted.
  if (lower.includes("готов к выдаче") || lower.includes("к выдаче")) return "accepted";
  if (lower.includes("доставлен") || lower.includes("заверш")) return "delivered";
  if (lower.includes("пути") || lower.includes("отправлен")) return "in_transit";
  if (lower.includes("готов") || lower.includes("принят") || lower.includes("ответ")) return "accepted";
  return null;
}

/** StateBill 1С → оплачен ли счёт. */
export function getPaymentKey(stateBill: string | undefined): "paid" | "unpaid" | "partial" | "unknown" {
  if (!stateBill) return "unknown";
  const lower = stateBill.toLowerCase().trim();
  if (
    lower.includes("не оплачен") ||
    lower.includes("неоплачен") ||
    lower.includes("не оплачён") ||
    lower.includes("unpaid") ||
    lower.includes("ожидает") ||
    lower.includes("pending")
  )
    return "unpaid";
  if (lower.includes("оплачен") || lower.includes("paid") || lower.includes("оплачён")) return "paid";
  if (lower.includes("частично") || lower.includes("partial")) return "partial";
  return "unknown";
}

/** Запрос перевозок по ИНН заказчика (сервисный логин/пароль для опроса раз в час). */
export async function fetchPerevozkiByInn(
  inn: string,
  serviceLogin: string,
  servicePassword: string,
  dateFrom?: string,
  dateTo?: string
): Promise<{ items: any[]; raw?: any }> {
  const to = dateTo || new Date().toISOString().split("T")[0];
  const from = dateFrom || (() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  })();
  const url = new URL(PEREVOZKI_BASE);
  url.searchParams.set("DateB", from);
  url.searchParams.set("DateE", to);
  url.searchParams.set("INN", String(inn).trim());

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Auth: `Basic ${serviceLogin}:${servicePassword}`,
      Authorization: SERVICE_AUTH,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GetPerevozki by INN failed: ${res.status} ${text.slice(0, 200)}`);
  }
  try {
    const json = JSON.parse(text);
    const list = Array.isArray(json) ? json : json.items || [];
    return { items: Array.isArray(list) ? list : [], raw: json };
  } catch {
    return { items: [] };
  }
}

/** Разбор ответа GetIinvoices: массив, items/Items/Invoices/data. */
export function extractInvoicesFromResponse(json: unknown): any[] {
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== "object") return [];
  const obj = json as Record<string, unknown>;
  for (const key of ["items", "Items", "Invoices", "invoices", "data", "Data", "result", "Result", "rows", "Rows"]) {
    const value = obj[key];
    if (Array.isArray(value)) return value;
  }
  for (const value of Object.values(obj)) {
    if (
      Array.isArray(value) &&
      value.length > 0 &&
      value.every((row) => row && typeof row === "object" && !Array.isArray(row))
    ) {
      return value;
    }
  }
  return [];
}

/** Запрос счетов по ИНН заказчика (для daily summary и bill_created). */
export async function fetchInvoicesByInn(
  inn: string,
  serviceLogin: string,
  servicePassword: string,
  dateFrom?: string,
  dateTo?: string
): Promise<{ items: any[]; raw?: any }> {
  const to = dateTo || new Date().toISOString().split("T")[0];
  const from = dateFrom || cacheHistoryDateFrom();
  const url = new URL(INVOICES_BASE);
  url.searchParams.set("DateB", from);
  url.searchParams.set("DateE", to);
  url.searchParams.set("INN", String(inn).trim());

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Auth: `Basic ${serviceLogin}:${servicePassword}`,
      Authorization: SERVICE_AUTH,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GetIinvoices by INN failed: ${res.status} ${text.slice(0, 200)}`);
  }
  try {
    const json = JSON.parse(text);
    return { items: extractInvoicesFromResponse(json), raw: json };
  } catch {
    return { items: [] };
  }
}

/** Текст уведомления в Telegram по событию (шаблоны из docs/web-push-setup.md). */
export function formatTelegramMessage(
  event: CargoEvent,
  cargoNumber: string,
  item?: {
    Mest?: number;
    W?: number;
    Value?: number;
    PW?: number;
    Sender?: string;
    Receiver?: string;
    Poluchatel?: string;
  }
): string {
  const n = cargoNumber;
  const anyItem = item as any;
  const mest = item?.Mest ?? "—";
  const pw = item?.PW ?? "—";
  const w = item?.W ?? "—";
  const volume = item?.Value ?? "—";
  const sender = String(item?.Sender || "—").trim() || "—";
  const receiver = String(item?.Receiver || item?.Poluchatel || "—").trim() || "—";
  const details = `№ ${n} - мест: ${mest}, платный вес: ${pw}, вес: ${w}, объём: ${volume}, отправитель: ${sender}, получатель: ${receiver}.`;
  const billSumRaw = pickBillSumRaw(anyItem);
  const billSumNum = typeof billSumRaw === "number" ? billSumRaw : parseFloat(String(billSumRaw ?? "").replace(",", "."));
  const billSum = Number.isFinite(billSumNum) ? new Intl.NumberFormat("ru-RU").format(Math.round(billSumNum)) : "—";
  const billNumberRaw = pickBillNumber(anyItem);
  const billNumber = billNumberRaw
    ? String(billNumberRaw).replace(/^0000-/, "").replace(/^0+/, "") || "0"
    : "—";
  if (CARGO_STAGE_EVENT_IDS.includes(event as CargoStageEventId)) {
    return `${cargoStageEventLabel(event as CargoStageEventId)}. № ${n}`;
  }
  switch (event) {
    case "bill_created":
      return `Вам выставлен счет № ${billNumber} по перевозке № ${n} на сумму ${billSum} ₽.`;
    case "bill_paid":
      return `Счет № ${billNumber} по перевозке № ${n} оплачен.`;
    default:
      return `Обновление статуса перевозки. ${details}`;
  }
}

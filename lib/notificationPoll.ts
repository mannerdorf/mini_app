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
  return String(pickFirst(item, [...BILL_NUMBER_KEYS]) ?? "").trim();
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

/** Запрос счетов по ИНН заказчика (для daily summary). */
export async function fetchInvoicesByInn(
  inn: string,
  serviceLogin: string,
  servicePassword: string,
  dateFrom?: string,
  dateTo?: string
): Promise<{ items: any[]; raw?: any }> {
  const to = dateTo || new Date().toISOString().split("T")[0];
  const from = dateFrom || (() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d.toISOString().split("T")[0];
  })();
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
    const list = Array.isArray(json) ? json : json.items ?? json.Invoices ?? json.invoices ?? [];
    return { items: Array.isArray(list) ? list : [], raw: json };
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
  const billSumRaw = pickFirst(anyItem, ["SumDoc", "SumBill", "AmountBill", "СуммаДокумента", "Sum", "Amount", "Сумма"]);
  const billSumNum = typeof billSumRaw === "number" ? billSumRaw : parseFloat(String(billSumRaw ?? "").replace(",", "."));
  const billSum = Number.isFinite(billSumNum) ? new Intl.NumberFormat("ru-RU").format(Math.round(billSumNum)) : "—";
  if (CARGO_STAGE_EVENT_IDS.includes(event as CargoStageEventId)) {
    return `${cargoStageEventLabel(event as CargoStageEventId)}. № ${n}`;
  }
  switch (event) {
    case "bill_created":
      return `Вам выставлен счет по перевозке № ${n} на сумму ${billSum} ₽.`;
    case "bill_paid":
      return `Счет по перевозке № ${n} оплачен.`;
    default:
      return `Обновление статуса перевозки. ${details}`;
  }
}

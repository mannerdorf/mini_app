/**
 * Опрос по заказчику (INN): маппинг статусов 1С → события уведомлений и шаблоны для Telegram.
 */

const PEREVOZKI_BASE =
  "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetPerevozki";
const INVOICES_BASE =
  "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetIinvoices";
const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";

export type CargoEvent = "accepted" | "in_transit" | "delivered" | "bill_created" | "bill_paid";

function pickFirst(item: any, keys: string[]): unknown {
  for (const key of keys) {
    const v = item?.[key];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return undefined;
}

/** State 1С → ключ события перевозки (как в alice getFilterKeyByStatus). */
export function getCargoStatusKey(state: string | undefined): CargoEvent | null {
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
  const billNumber = String(
    pickFirst(anyItem, ["NumberBill", "BillNumber", "Invoice", "InvoiceNumber", "Счет", "Счёт"]) ?? n
  ).trim() || n;
  const billDate = String(
    pickFirst(anyItem, ["DateBill", "BillDate", "InvoiceDate", "ДатаСчета", "ДатаСчёта", "Date"]) ?? "—"
  ).trim() || "—";
  const billSumRaw = pickFirst(anyItem, ["SumDoc", "Sum", "Amount", "Сумма"]);
  const billVatRaw = pickFirst(anyItem, ["SumNDS", "NDS", "VAT", "НДС"]);
  const billSumNum = typeof billSumRaw === "number" ? billSumRaw : parseFloat(String(billSumRaw ?? "").replace(",", "."));
  const billVatNum = typeof billVatRaw === "number" ? billVatRaw : parseFloat(String(billVatRaw ?? "").replace(",", "."));
  const billSum = Number.isFinite(billSumNum) ? new Intl.NumberFormat("ru-RU").format(Math.round(billSumNum)) : "—";
  const billVat = Number.isFinite(billVatNum) ? new Intl.NumberFormat("ru-RU").format(Math.round(billVatNum)) : "—";
  switch (event) {
    case "accepted": {
      return `Создана перевозка. ${details}`;
    }
    case "in_transit":
      return `Перевозка в пути. № ${n}`;
    case "delivered":
      return `Перевозка доставлена. № ${n}`;
    case "bill_created":
      return `Создан счет (${billNumber}) от ${billDate} на сумму ${billSum} ₽, в том числе НДС ${billVat} ₽.`;
    case "bill_paid":
      return `Счет (${billNumber}) оплачен.`;
    default:
      return `Обновление статуса перевозки. ${details}`;
  }
}

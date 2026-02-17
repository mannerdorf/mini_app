/**
 * Опрос по заказчику (INN): маппинг статусов 1С → события уведомлений и шаблоны для Telegram.
 */

const PEREVOZKI_BASE =
  "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetPerevozki";
const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";

export type CargoEvent = "accepted" | "in_transit" | "delivered" | "bill_paid";

/** State 1С → ключ события перевозки (как в alice getFilterKeyByStatus). */
export function getCargoStatusKey(state: string | undefined): CargoEvent | null {
  if (!state) return null;
  const lower = state.toLowerCase().trim();
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
  const mest = item?.Mest ?? "—";
  const pw = item?.PW ?? "—";
  const sender = String(item?.Sender || "—").trim() || "—";
  const receiver = String(item?.Receiver || item?.Poluchatel || "—").trim() || "—";
  const details = `№ ${n} - мест: ${mest}, платный вес: ${pw}, отправитель: ${sender}, получатель: ${receiver}.`;
  switch (event) {
    case "accepted": {
      return `Создана перевозка. ${details}`;
    }
    case "in_transit":
      return `Перевозка в пути. ${details}`;
    case "delivered":
      return `Перевозка доставлена. ${details}`;
    case "bill_paid":
      return `Счёт по перевозке оплачен. ${details}`;
    default:
      return `Обновление статуса перевозки. ${details}`;
  }
}

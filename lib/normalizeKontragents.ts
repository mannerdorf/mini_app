import { isEdoMyCounterpartyStatus } from "./kontragentEdoStatus.js";

export type NormalizedKontragent = {
  inn: string;
  supplier_name: string;
  email: string;
  counterparty_status: string;
};

function getStr(el: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = el[key];
    if (value != null && value !== "") return String(value).trim();
  }
  return "";
}

export function extractCounterpartyArray(raw: unknown): Record<string, unknown>[] {
  if (!raw || typeof raw !== "object") return [];
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  const obj = raw as Record<string, unknown>;
  const from =
    obj.Items ??
    obj.items ??
    obj.Customers ??
    obj.customers ??
    obj.Counterparties ??
    obj.counterparties ??
    obj.Counterpartys ??
    obj.counterpartys ??
    obj.Kontragents ??
    obj.kontragents ??
    obj.Contragents ??
    obj.contragents ??
    obj.Suppliers ??
    obj.suppliers ??
    obj.Data ??
    obj.data ??
    obj.Result ??
    obj.result ??
    obj.Rows ??
    obj.rows;
  if (Array.isArray(from)) return from as Record<string, unknown>[];
  if (obj.INN != null || obj.Inn != null || obj.inn != null) return [obj];
  return [];
}

/** Парсинг ответа GETAPI?metod=GETALLKontragents для cache_suppliers. */
export function normalizeKontragentsFrom1c(raw: unknown): NormalizedKontragent[] {
  const arr = extractCounterpartyArray(raw);
  const byInn = new Map<string, NormalizedKontragent>();
  for (const el of arr) {
    if (!el || typeof el !== "object") continue;
    let inn = getStr(el, "Inn", "INN", "inn", "ИНН", "Code", "code", "Код");
    inn = inn.replace(/\D/g, "") || inn.trim();
    if (!inn || (inn.length !== 10 && inn.length !== 12)) continue;
    const name =
      getStr(
        el,
        "Name",
        "name",
        "Supplier",
        "supplier",
        "Contragent",
        "contragent",
        "Kontragent",
        "kontragent",
        "Поставщик",
        "Контрагент",
        "Наименование"
      ) || inn;
    const email = getStr(el, "Email", "email", "E-mail", "e-mail", "Почта", "Mail");
    const counterparty_status = getStr(el, "status", "Status", "Статус");
    const prev = byInn.get(inn);
    if (prev && isEdoMyCounterpartyStatus(prev.counterparty_status) && !isEdoMyCounterpartyStatus(counterparty_status)) {
      continue;
    }
    byInn.set(inn, { inn, supplier_name: name, email, counterparty_status });
  }
  return Array.from(byInn.values());
}

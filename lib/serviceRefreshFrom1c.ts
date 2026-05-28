import type { Pool } from "pg";
import { getPerevozkiServiceCredentials } from "./cacheHistoryDays.js";
import { hasServiceModePermission, getRegisteredUserPermissions } from "./legalDocuments.js";
import { verifyRegisteredUser } from "./verifyRegisteredUser.js";
import { extractArrayFromAnyPayload, buildSendingsMetrics, upsertSendingsMetrics } from "./sendingsMetrics.js";

const PEREVOZKI_URL = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetPerevozki";
const INVOICES_URL = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetIinvoices";
const ACTS_URL = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetActs";
const ZAYAVKI_URL = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetZayavki";
const GETAPI_URL = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GETAPI";
const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";

export type ServiceRefreshKind = "perevozki" | "invoices" | "acts" | "sendings" | "orders";

export type ServiceRefreshKindResult = {
  kind: ServiceRefreshKind;
  dateFrom: string;
  dateTo: string;
  fetched: number;
  cacheTotal: number;
  detail?: string;
  error?: string;
};

export type ServiceRefreshResult = {
  dateFrom: string;
  dateTo: string;
  kinds: ServiceRefreshKindResult[];
};

function normalizeDateOnly(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const ruMatch = s.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\D.*)?$/);
  if (ruMatch) return `${ruMatch[3]}-${ruMatch[2]}-${ruMatch[1]}`;
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().split("T")[0];
}

function itemDate(kind: ServiceRefreshKind, item: any): string {
  if (kind === "perevozki") {
    return normalizeDateOnly(
      item?.DatePrih ?? item?.DateVr ?? item?.DateDoc ?? item?.Date ?? item?.date ?? item?.Дата ?? "",
    );
  }
  if (kind === "sendings") {
    return normalizeDateOnly(
      item?.DateOtpr ??
        item?.DateSend ??
        item?.DateShipment ??
        item?.ShipmentDate ??
        item?.DateDoc ??
        item?.Date ??
        item?.date ??
        item?.ДатаОтправки ??
        item?.Дата ??
        item?.DatePrih ??
        item?.DateVr ??
        "",
    );
  }
  if (kind === "orders") {
    return normalizeDateOnly(
      item?.DateZayavki ?? item?.DateRequest ?? item?.DateDoc ?? item?.Date ?? item?.date ?? item?.ДатаЗаявки ?? item?.Дата ?? "",
    );
  }
  return normalizeDateOnly(item?.DateDoc ?? item?.Date ?? item?.dateDoc ?? item?.date ?? item?.Дата ?? "");
}

function itemKey(kind: ServiceRefreshKind, item: any): string {
  const number = String(
    item?.Number ??
      item?.number ??
      item?.Номер ??
      item?.N ??
      item?.НомерЗаявки ??
      item?.НомерОтправки ??
      item?.SendingNumber ??
      item?.sendingNumber ??
      "",
  ).trim();
  const link = String(item?.Invoice ?? item?.invoice ?? item?.Счёт ?? item?.Счет ?? item?.Customer ?? item?.customer ?? "").trim();
  const date = itemDate(kind, item);
  const base = [kind, number, link, date].filter(Boolean).join("|");
  return base || `${kind}|${JSON.stringify(item).slice(0, 300)}`;
}

export function mergeDocumentCacheRows(
  kind: ServiceRefreshKind,
  existing: unknown[],
  incoming: unknown[],
  dateFrom: string,
  dateTo: string,
): unknown[] {
  const merged = new Map<string, unknown>();
  for (const item of existing) {
    const d = itemDate(kind, item);
    if (!d || d < dateFrom || d > dateTo) {
      merged.set(itemKey(kind, item), item);
    }
  }
  for (const item of incoming) {
    merged.set(itemKey(kind, item), item);
  }
  return Array.from(merged.values());
}

function kindConfig(kind: ServiceRefreshKind): { url: string; table: string; jsonKeys: string[] } {
  if (kind === "perevozki") {
    return { url: PEREVOZKI_URL, table: "cache_perevozki", jsonKeys: ["items", "Items"] };
  }
  if (kind === "sendings") {
    return { url: `${GETAPI_URL}?metod=Getotpravki`, table: "cache_sendings", jsonKeys: [] };
  }
  if (kind === "invoices") {
    return { url: INVOICES_URL, table: "cache_invoices", jsonKeys: ["items", "Items", "Invoices", "invoices"] };
  }
  if (kind === "acts") {
    return { url: ACTS_URL, table: "cache_acts", jsonKeys: ["items", "Items", "Acts", "acts"] };
  }
  return { url: ZAYAVKI_URL, table: "cache_orders", jsonKeys: ["items", "Items", "Zayavki", "zayavki", "data", "Data", "result", "Result", "rows", "Rows"] };
}

async function fetchServiceJson(login: string, password: string, url: string, dateFrom: string, dateTo: string) {
  const sep = url.includes("?") ? "&" : "?";
  const fullUrl = `${url}${sep}DateB=${encodeURIComponent(dateFrom)}&DateE=${encodeURIComponent(dateTo)}`;
  const response = await fetch(fullUrl, {
    method: "GET",
    headers: {
      Auth: `Basic ${login}:${password}`,
      Authorization: SERVICE_AUTH,
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON: ${text.slice(0, 200)}`);
  }
  if (json && typeof json === "object" && json.Success === false) {
    throw new Error(String(json.Error ?? json.error ?? json.message ?? "Success=false"));
  }
  return json;
}

function extractKnownArray(json: unknown, ...keys: string[]): unknown[] {
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== "object") return [];
  const obj = json as Record<string, unknown>;
  for (const key of keys) {
    const value = obj[key];
    if (Array.isArray(value)) return value;
  }
  return extractArrayFromAnyPayload(json);
}

async function readCacheRow(pool: Pool, table: string): Promise<unknown[]> {
  const { rows } = await pool.query<{ data: unknown }>(`select data from ${table} where id = 1 limit 1`);
  return Array.isArray(rows[0]?.data) ? (rows[0].data as unknown[]) : [];
}

async function updateCacheRow(pool: Pool, table: string, rows: unknown[]): Promise<void> {
  await pool.query(`update ${table} set data = $1, fetched_at = now() where id = 1`, [JSON.stringify(rows)]);
}

export async function refreshDocumentCacheFrom1c(
  pool: Pool,
  login: string,
  password: string,
  dateFrom: string,
  dateTo: string,
  kinds: ServiceRefreshKind[],
): Promise<ServiceRefreshKindResult[]> {
  const results: ServiceRefreshKindResult[] = [];
  for (const kind of kinds) {
    const { url, table, jsonKeys } = kindConfig(kind);
    try {
      const json = await fetchServiceJson(login, password, url, dateFrom, dateTo);
      const fetchedRows = extractKnownArray(json, ...jsonKeys);
      const currentRows = await readCacheRow(pool, table);
      const mergedRows = mergeDocumentCacheRows(kind, currentRows, fetchedRows, dateFrom, dateTo);
      await updateCacheRow(pool, table, mergedRows);

      let detail: string | undefined;
      if (kind === "sendings" && fetchedRows.length > 0) {
        const perevozkiRows = await readCacheRow(pool, "cache_perevozki");
        const metricsRows = buildSendingsMetrics(fetchedRows as any[], perevozkiRows as any[]);
        const metrics = await upsertSendingsMetrics(pool, metricsRows);
        detail = `metrics=${metrics.updated}`;
      }

      results.push({
        kind,
        dateFrom,
        dateTo,
        fetched: fetchedRows.length,
        cacheTotal: mergedRows.length,
        detail,
      });
    } catch (e: any) {
      results.push({
        kind,
        dateFrom,
        dateTo,
        fetched: 0,
        cacheTotal: 0,
        error: e?.message || String(e),
      });
    }
  }
  return results;
}

export type AuthorizeServiceRefreshInput = {
  login: string;
  password: string;
  serviceMode?: boolean;
  isRegisteredUser?: boolean;
};

export async function authorizeServiceRefreshFrom1c(
  pool: Pool,
  input: AuthorizeServiceRefreshInput,
): Promise<{ ok: true; login: string; password: string } | { ok: false; status: number; error: string }> {
  if (!input.serviceMode) {
    return { ok: false, status: 403, error: "Доступно только в служебном режиме" };
  }
  const login = String(input.login ?? "").trim();
  const password = String(input.password ?? "");
  if (!login || !password) {
    return { ok: false, status: 400, error: "login and password are required" };
  }

  const service = getPerevozkiServiceCredentials();
  if (!service) {
    return { ok: false, status: 503, error: "Не заданы PEREVOZKI_SERVICE_LOGIN / PEREVOZKI_SERVICE_PASSWORD" };
  }

  if (login === service.login && password === service.password) {
    return { ok: true, login: service.login, password: service.password };
  }

  if (input.isRegisteredUser) {
    const verified = await verifyRegisteredUser(pool, login, password);
    if (!verified) {
      return { ok: false, status: 401, error: "Неверный логин или пароль" };
    }
    const perms = await getRegisteredUserPermissions(pool, login);
    if (!verified.accessAllInns && !hasServiceModePermission(perms)) {
      return { ok: false, status: 403, error: "Нет права служебного режима" };
    }
    return { ok: true, login: service.login, password: service.password };
  }

  return { ok: false, status: 403, error: "Обновление из 1С доступно служебному аккаунту или пользователю с правом service_mode" };
}

export function serviceRefreshKindsForDocumentsSection(section: string): ServiceRefreshKind[] {
  switch (section) {
    case "Счета":
    case "ЭДО":
      return ["invoices", "perevozki"];
    case "УПД":
      return ["acts", "invoices", "perevozki"];
    case "Заявки":
      return ["orders"];
    case "Отправки":
      return ["sendings", "perevozki"];
    default:
      return [];
  }
}

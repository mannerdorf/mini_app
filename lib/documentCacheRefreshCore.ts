import type { Pool } from "pg";
import { CACHE_HISTORY_DAYS } from "./cacheHistoryDays.js";
import {
  buildCargoSendingAssignments,
  buildSendingsMetrics,
  extractArrayFromAnyPayload,
  upsertCargoSendingAssignments,
  upsertSendingsMetrics,
} from "./sendingsMetrics.js";
import { dispatchWebPushCargoEvents } from "../api/_lib/webpushEventDispatch.js";

export const CACHE_RECENT_DAYS = 30;
export const CACHE_DEEP_DAYS = 90;
/** Шаг backfill в админке (30 дней × ~12 ≈ 365). */
export const CACHE_BACKFILL_STEP_DAYS = 30;

const PEREVOZKI_URL = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetPerevozki";
const INVOICES_URL = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetIinvoices";
const ACTS_URL = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetActs";
const ZAYAVKI_URL = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetZayavki";
const GETAPI_URL = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GETAPI";
export const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";

export type DocumentCacheKind = "perevozki" | "sendings" | "invoices" | "acts" | "customers";
export type DatedDocumentCacheKind = Exclude<DocumentCacheKind, "customers"> | "orders";

export const ROTATING_DOCUMENT_KINDS: DocumentCacheKind[] = ["perevozki", "sendings", "invoices", "acts"];

export function isoDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function addDaysIso(baseIso: string, delta: number): string {
  return isoDate(addDays(new Date(`${baseIso}T12:00:00`), delta));
}

export function minIso(a: string, b: string): string {
  return a <= b ? a : b;
}

/** Фиксированное окно: последние `days` календарных дней включительно. */
export function getFixedWindowRange(days: number, reference = new Date()): { dateFrom: string; dateTo: string; days: number } {
  const span = Math.max(1, Math.trunc(days));
  const dateTo = isoDate(reference);
  const dateFrom = isoDate(addDays(reference, -(span - 1)));
  return { dateFrom, dateTo, days: span };
}

export function normalizeDateOnly(raw: unknown): string {
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

export function itemDate(kind: DatedDocumentCacheKind, item: any): string {
  if (kind === "perevozki") {
    return normalizeDateOnly(item?.DatePrih ?? item?.DateVr ?? item?.DateDoc ?? item?.Date ?? item?.date ?? item?.Дата ?? "");
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
    return normalizeDateOnly(item?.DateZayavki ?? item?.DateRequest ?? item?.DateDoc ?? item?.Date ?? item?.date ?? item?.ДатаЗаявки ?? item?.Дата ?? "");
  }
  return normalizeDateOnly(item?.DateDoc ?? item?.Date ?? item?.dateDoc ?? item?.date ?? item?.Дата ?? "");
}

export function itemKey(kind: DatedDocumentCacheKind, item: any): string {
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

export function mergeChunkIntoCache(
  kind: DatedDocumentCacheKind,
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

export async function fetchServiceJson(login: string, password: string, url: string) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Auth: `Basic ${login}:${password}`,
      Authorization: SERVICE_AUTH,
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
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

export function extractKnownArray(json: unknown, ...keys: string[]): unknown[] {
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== "object") return [];
  const obj = json as Record<string, unknown>;
  for (const key of keys) {
    const value = obj[key];
    if (Array.isArray(value)) return value;
  }
  return extractArrayFromAnyPayload(json);
}

export async function readCacheRow(pool: Pool, table: string): Promise<unknown[]> {
  const { rows } = await pool.query<{ data: unknown }>(`select data from ${table} where id = 1 limit 1`);
  return Array.isArray(rows[0]?.data) ? (rows[0].data as unknown[]) : [];
}

export async function updateCacheRow(pool: Pool, table: string, rows: unknown[]): Promise<void> {
  await pool.query(`update ${table} set data = $1, fetched_at = now() where id = 1`, [JSON.stringify(rows)]);
}

function kindEndpoint(kind: DatedDocumentCacheKind, dateFrom: string, dateTo: string): { url: string; table: string; jsonKeys: string[] } {
  if (kind === "perevozki") {
    return { url: `${PEREVOZKI_URL}?DateB=${dateFrom}&DateE=${dateTo}`, table: "cache_perevozki", jsonKeys: ["items", "Items"] };
  }
  if (kind === "sendings") {
    return { url: `${GETAPI_URL}?metod=Getotpravki&DateB=${dateFrom}&DateE=${dateTo}`, table: "cache_sendings", jsonKeys: [] };
  }
  if (kind === "invoices") {
    return { url: `${INVOICES_URL}?DateB=${dateFrom}&DateE=${dateTo}`, table: "cache_invoices", jsonKeys: ["items", "Items", "Invoices", "invoices"] };
  }
  if (kind === "acts") {
    return { url: `${ACTS_URL}?DateB=${dateFrom}&DateE=${dateTo}`, table: "cache_acts", jsonKeys: ["items", "Items", "Acts", "acts"] };
  }
  return {
    url: `${ZAYAVKI_URL}?DateB=${dateFrom}&DateE=${dateTo}`,
    table: "cache_orders",
    jsonKeys: ["items", "Items", "Zayavki", "zayavki", "data", "Data", "result", "Result", "rows", "Rows"],
  };
}

export type RefreshWindowResult = {
  kind: DatedDocumentCacheKind | "customers";
  mode: "recent" | "deep" | "backfill" | "chunk";
  dateFrom: string;
  dateTo: string;
  chunkCountRows: number;
  cacheCount: number;
  detail?: string;
};

export async function refreshDatedKindForWindow(
  pool: Pool,
  login: string,
  password: string,
  kind: DatedDocumentCacheKind,
  dateFrom: string,
  dateTo: string,
  mode: RefreshWindowResult["mode"],
  options?: { webPush?: boolean },
): Promise<RefreshWindowResult> {
  const { url, table, jsonKeys } = kindEndpoint(kind, dateFrom, dateTo);
  const json = await fetchServiceJson(login, password, url);
  const chunkRows = extractKnownArray(json, ...jsonKeys);
  const currentRows = await readCacheRow(pool, table);
  const mergedRows = mergeChunkIntoCache(kind, currentRows, chunkRows, dateFrom, dateTo);
  await updateCacheRow(pool, table, mergedRows);

  let detail: string | undefined;
  if (kind === "perevozki" && chunkRows.length > 0 && options?.webPush !== false) {
    const dispatchResult = await dispatchWebPushCargoEvents({
      pool,
      items: chunkRows as any[],
      source: `cron_refresh_${mode}`,
      dedupeTtlSeconds: 300,
    });
    detail = `webpush changed=${dispatchResult.changed}, delivered=${dispatchResult.delivered}, failed=${dispatchResult.failed}, deduped=${dispatchResult.deduped}`;
  }
  if (kind === "sendings") {
    const perevozkiRows = await readCacheRow(pool, "cache_perevozki");
    const metricsRows = buildSendingsMetrics(chunkRows as any[], perevozkiRows as any[]);
    const metrics = await upsertSendingsMetrics(pool, metricsRows);
    const assignments = await upsertCargoSendingAssignments(pool, buildCargoSendingAssignments(chunkRows as any[]));
    detail = `metrics=${metrics.updated}, assignments=${assignments.updated}`;
  }

  return { kind, mode, dateFrom, dateTo, chunkCountRows: chunkRows.length, cacheCount: mergedRows.length, detail };
}

export async function ensureDocumentCacheTables(pool: Pool): Promise<void> {
  await pool.query(
    "create table if not exists cache_sendings (id int primary key default 1 check (id = 1), data jsonb not null default '[]', fetched_at timestamptz not null default now())",
  );
  await pool.query("insert into cache_sendings (id, data, fetched_at) values (1, '[]', '1970-01-01') on conflict (id) do nothing");
  await pool.query(
    `create table if not exists sendings_metrics (
       customer_inn text not null,
       sending_number text not null,
       cargo_numbers jsonb not null default '[]'::jsonb,
       send_start_at timestamptz,
       first_ready_at timestamptz,
       in_transit_hours numeric(12, 2),
       first_seen_at timestamptz not null default now(),
       last_seen_at timestamptz not null default now(),
       updated_at timestamptz not null default now(),
       primary key (customer_inn, sending_number)
     )`,
  );
  await pool.query(
    "create table if not exists cache_orders (id int primary key default 1 check (id = 1), data jsonb not null default '[]', fetched_at timestamptz not null default now())",
  );
  await pool.query("insert into cache_orders (id, data, fetched_at) values (1, '[]', '1970-01-01') on conflict (id) do nothing");
  await pool.query(
    `create table if not exists document_cache_backfill_state (
       id int primary key default 1 check (id = 1),
       range_start date not null,
       range_end date not null,
       next_from date not null,
       step_days int not null default 30,
       done boolean not null default false,
       last_step jsonb,
       updated_at timestamptz not null default now()
     )`,
  );
  await pool.query(
    `alter table document_cache_backfill_state add column if not exists kind_cursor int not null default 0`,
  );
  await pool.query(
    `insert into document_cache_backfill_state (id, range_start, range_end, next_from, step_days, done, updated_at)
     select 1, $1::date, $2::date, $1::date, $3, false, now()
     where not exists (select 1 from document_cache_backfill_state where id = 1)`,
    [
      isoDate(addDays(new Date(), -(CACHE_HISTORY_DAYS - 1))),
      isoDate(new Date()),
      CACHE_BACKFILL_STEP_DAYS,
    ],
  );
}

export function getRotatingDocumentKind(reference = new Date(), intervalMs: number): DocumentCacheKind {
  const slot = Math.floor(reference.getTime() / intervalMs);
  if (slot % (ROTATING_DOCUMENT_KINDS.length * 5) === ROTATING_DOCUMENT_KINDS.length * 5 - 1) {
    return "customers";
  }
  return ROTATING_DOCUMENT_KINDS[slot % ROTATING_DOCUMENT_KINDS.length] ?? "perevozki";
}

export type CacheCoverageStats = {
  perevozki: { count: number; minDate: string | null; maxDate: string | null; fetchedAt: string | null };
  sendings: { count: number; minDate: string | null; maxDate: string | null; fetchedAt: string | null };
  invoices: { count: number; minDate: string | null; maxDate: string | null; fetchedAt: string | null };
  acts: { count: number; minDate: string | null; maxDate: string | null; fetchedAt: string | null };
};

export const CACHE_COVERAGE_KINDS: Array<{ kind: DatedDocumentCacheKind; table: string; label: string }> = [
  { kind: "perevozki", table: "cache_perevozki", label: "Грузы" },
  { kind: "sendings", table: "cache_sendings", label: "Отправки" },
  { kind: "invoices", table: "cache_invoices", label: "Счета" },
  { kind: "acts", table: "cache_acts", label: "УПД" },
];

export type CacheCoverageMonthRow = {
  month: string;
  monthLabel: string;
  perevozki: number;
  sendings: number;
  invoices: number;
  acts: number;
};

const MONTH_NAMES_RU = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

export function formatCoverageMonthLabel(month: string): string {
  const [y, m] = month.split("-");
  const mi = Number(m);
  if (!y || mi < 1 || mi > 12) return month;
  return `${MONTH_NAMES_RU[mi - 1]} ${y}`;
}

function monthKeyFromDate(isoDay: string): string {
  return isoDay.slice(0, 7);
}

async function summarizeCacheKind(pool: Pool, table: string, kind: DatedDocumentCacheKind) {
  const row = await pool.query<{ data: unknown; fetched_at: Date | null }>(
    `select data, fetched_at from ${table} where id = 1 limit 1`,
  );
  const list = Array.isArray(row.rows[0]?.data) ? (row.rows[0].data as unknown[]) : [];
  let minDate: string | null = null;
  let maxDate: string | null = null;
  const byMonth = new Map<string, number>();
  for (const item of list) {
    const d = itemDate(kind, item);
    if (!d) continue;
    if (!minDate || d < minDate) minDate = d;
    if (!maxDate || d > maxDate) maxDate = d;
    const mk = monthKeyFromDate(d);
    byMonth.set(mk, (byMonth.get(mk) ?? 0) + 1);
  }
  return {
    count: list.length,
    minDate,
    maxDate,
    fetchedAt: row.rows[0]?.fetched_at ? new Date(row.rows[0].fetched_at).toISOString() : null,
    byMonth,
  };
}

export async function readCacheCoverageStats(pool: Pool): Promise<CacheCoverageStats> {
  const perevozki = await summarizeCacheKind(pool, "cache_perevozki", "perevozki");
  const sendings = await summarizeCacheKind(pool, "cache_sendings", "sendings");
  const invoices = await summarizeCacheKind(pool, "cache_invoices", "invoices");
  const acts = await summarizeCacheKind(pool, "cache_acts", "acts");
  return {
    perevozki: { count: perevozki.count, minDate: perevozki.minDate, maxDate: perevozki.maxDate, fetchedAt: perevozki.fetchedAt },
    sendings: { count: sendings.count, minDate: sendings.minDate, maxDate: sendings.maxDate, fetchedAt: sendings.fetchedAt },
    invoices: { count: invoices.count, minDate: invoices.minDate, maxDate: invoices.maxDate, fetchedAt: invoices.fetchedAt },
    acts: { count: acts.count, minDate: acts.minDate, maxDate: acts.maxDate, fetchedAt: acts.fetchedAt },
  };
}

export async function readCacheCoverageByMonth(pool: Pool): Promise<CacheCoverageMonthRow[]> {
  const summaries = await Promise.all(
    CACHE_COVERAGE_KINDS.map(async ({ kind, table }) => ({
      kind,
      ...(await summarizeCacheKind(pool, table, kind)),
    })),
  );
  const monthSet = new Set<string>();
  for (const s of summaries) {
    for (const mk of s.byMonth.keys()) monthSet.add(mk);
  }
  const months = Array.from(monthSet).sort();
  return months.map((month) => {
    const row: CacheCoverageMonthRow = {
      month,
      monthLabel: formatCoverageMonthLabel(month),
      perevozki: 0,
      sendings: 0,
      invoices: 0,
      acts: 0,
    };
    for (const s of summaries) {
      row[s.kind] = s.byMonth.get(month) ?? 0;
    }
    return row;
  });
}

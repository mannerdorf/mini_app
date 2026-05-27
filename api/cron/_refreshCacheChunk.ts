import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { requireCronAuth } from "../_lib/cronAuth.js";
import { initRequestContext, logError, logInfo } from "../_lib/observability.js";
import { dispatchWebPushCargoEvents } from "../_lib/webpushEventDispatch.js";
import { CACHE_HISTORY_DAYS } from "../../lib/cacheHistoryDays.js";
import {
  buildCargoSendingAssignments,
  buildSendingsMetrics,
  extractArrayFromAnyPayload,
  upsertCargoSendingAssignments,
  upsertSendingsMetrics,
} from "../../lib/sendingsMetrics.js";

const PEREVOZKI_URL = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetPerevozki";
const INVOICES_URL = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetIinvoices";
const ACTS_URL = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetActs";
const ZAYAVKI_URL = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetZayavki";
const GETAPI_URL = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GETAPI";
const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";
const CACHE_CHUNK_DAYS = 90;
const CRON_INTERVAL_MS = 5 * 60 * 1000;

type CacheKind = "perevozki" | "sendings" | "invoices" | "acts" | "customers";
type DatedCacheKind = Exclude<CacheKind, "customers"> | "orders";

const ROTATING_KINDS: CacheKind[] = ["perevozki", "sendings", "invoices", "acts"];

function isoDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

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

function getStringQuery(req: VercelRequest, key: string): string {
  const value = req.query[key];
  return typeof value === "string" ? value.trim() : "";
}

function getChunkCount(): number {
  return Math.max(1, Math.ceil(CACHE_HISTORY_DAYS / CACHE_CHUNK_DAYS));
}

function getChunkRange(chunk: number, reference = new Date()): { chunk: number; chunkCount: number; dateFrom: string; dateTo: string } {
  const chunkCount = getChunkCount();
  const normalizedChunk = Math.max(0, Math.min(chunkCount - 1, chunk));
  const endOffset = normalizedChunk * CACHE_CHUNK_DAYS;
  const startOffset = Math.min(CACHE_HISTORY_DAYS - 1, endOffset + CACHE_CHUNK_DAYS - 1);
  return {
    chunk: normalizedChunk,
    chunkCount,
    dateFrom: isoDate(addDays(reference, -startOffset)),
    dateTo: isoDate(addDays(reference, -endOffset)),
  };
}

function getRotatingTask(reference = new Date()): { kind: CacheKind; chunk: number } {
  const tasks: Array<{ kind: CacheKind; chunk: number }> = [];
  for (const kind of ROTATING_KINDS) {
    for (let chunk = 0; chunk < getChunkCount(); chunk += 1) tasks.push({ kind, chunk });
  }
  tasks.push({ kind: "customers", chunk: 0 });
  const slot = Math.floor(reference.getTime() / CRON_INTERVAL_MS);
  return tasks[slot % tasks.length] ?? { kind: "invoices", chunk: 0 };
}

function getRequestedChunk(req: VercelRequest, fallback: number): number {
  const raw = getStringQuery(req, "chunk");
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function itemDate(kind: DatedCacheKind, item: any): string {
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

function itemKey(kind: DatedCacheKind, item: any): string {
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

function mergeChunkIntoCache(kind: DatedCacheKind, existing: unknown[], incoming: unknown[], dateFrom: string, dateTo: string): unknown[] {
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

async function fetchServiceJson(login: string, password: string, url: string) {
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

async function readCacheRow(pool: ReturnType<typeof getPool>, table: string): Promise<unknown[]> {
  const { rows } = await pool.query<{ data: unknown }>(`select data from ${table} where id = 1 limit 1`);
  return Array.isArray(rows[0]?.data) ? (rows[0].data as unknown[]) : [];
}

async function updateCacheRow(pool: ReturnType<typeof getPool>, table: string, rows: unknown[]): Promise<void> {
  await pool.query(`update ${table} set data = $1, fetched_at = now() where id = 1`, [JSON.stringify(rows)]);
}

async function ensureChunkTables(pool: ReturnType<typeof getPool>): Promise<void> {
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
}

function extractCustomerArray(raw: unknown): any[] {
  if (!raw || typeof raw !== "object") return [];
  if (Array.isArray(raw)) return raw;
  const o = raw as Record<string, unknown>;
  const from = o.Items ?? o.items ?? o.Customers ?? o.customers ?? o.Data ?? o.data ?? o.Result ?? o.result ?? o.Rows ?? o.rows;
  if (Array.isArray(from)) return from;
  if (o.INN != null || o.Inn != null || o.inn != null) return [o];
  return Object.values(o).filter((v) => v && typeof v === "object") as any[];
}

function getStr(el: any, ...keys: string[]): string {
  if (!el || typeof el !== "object") return "";
  for (const key of keys) {
    const value = el[key];
    if (value != null && value !== "") return String(value).trim();
  }
  return "";
}

function normalizeCacheCustomers(raw: unknown): { inn: string; customer_name: string; email: string }[] {
  const byInn = new Map<string, { inn: string; customer_name: string; email: string }>();
  for (const el of extractCustomerArray(raw)) {
    let inn = getStr(el, "Inn", "INN", "inn", "ИНН", "Code", "code", "Код");
    inn = inn.replace(/\D/g, "") || inn.trim();
    if (!inn || (inn.length !== 10 && inn.length !== 12)) continue;
    const customer_name =
      getStr(el, "Name", "name", "Customer", "customer", "Contragent", "contragent", "Client", "client", "Заказчик", "Наименование") || inn;
    const email = getStr(el, "Email", "email", "E-mail", "e-mail", "Почта", "Mail");
    byInn.set(inn, { inn, customer_name, email });
  }
  return Array.from(byInn.values());
}

async function refreshCustomers(pool: ReturnType<typeof getPool>, login: string, password: string): Promise<{ count: number }> {
  const json = await fetchServiceJson(login, password, `${GETAPI_URL}?metod=Getcustomers`);
  const rows = normalizeCacheCustomers(json);
  await pool.query("delete from cache_customers");
  if (rows.length > 0) {
    await pool.query(
      `insert into cache_customers (inn, customer_name, email, fetched_at)
       select inn, customer_name, email, now()
       from unnest($1::text[], $2::text[], $3::text[]) as t(inn, customer_name, email)
       on conflict (inn) do update set customer_name = excluded.customer_name, email = excluded.email, fetched_at = now()`,
      [rows.map((r) => r.inn), rows.map((r) => r.customer_name), rows.map((r) => r.email)],
    );
  }
  return { count: rows.length };
}

async function refreshDatedKind(
  pool: ReturnType<typeof getPool>,
  login: string,
  password: string,
  kind: DatedCacheKind,
  chunk: number,
): Promise<{ kind: DatedCacheKind; chunk: number; chunkCount: number; dateFrom: string; dateTo: string; chunkCountRows: number; cacheCount: number; detail?: string }> {
  const { dateFrom, dateTo, chunk: normalizedChunk, chunkCount } = getChunkRange(chunk);
  let url = "";
  let table = "";
  let jsonKeys: string[] = [];
  if (kind === "perevozki") {
    url = `${PEREVOZKI_URL}?DateB=${dateFrom}&DateE=${dateTo}`;
    table = "cache_perevozki";
    jsonKeys = ["items", "Items"];
  } else if (kind === "sendings") {
    url = `${GETAPI_URL}?metod=Getotpravki&DateB=${dateFrom}&DateE=${dateTo}`;
    table = "cache_sendings";
  } else if (kind === "invoices") {
    url = `${INVOICES_URL}?DateB=${dateFrom}&DateE=${dateTo}`;
    table = "cache_invoices";
    jsonKeys = ["items", "Items", "Invoices", "invoices"];
  } else if (kind === "acts") {
    url = `${ACTS_URL}?DateB=${dateFrom}&DateE=${dateTo}`;
    table = "cache_acts";
    jsonKeys = ["items", "Items", "Acts", "acts"];
  } else {
    url = `${ZAYAVKI_URL}?DateB=${dateFrom}&DateE=${dateTo}`;
    table = "cache_orders";
    jsonKeys = ["items", "Items", "Zayavki", "zayavki", "data", "Data", "result", "Result", "rows", "Rows"];
  }

  const json = await fetchServiceJson(login, password, url);
  const chunkRows = extractKnownArray(json, ...jsonKeys);
  const currentRows = await readCacheRow(pool, table);
  const mergedRows = mergeChunkIntoCache(kind, currentRows, chunkRows, dateFrom, dateTo);
  await updateCacheRow(pool, table, mergedRows);

  let detail: string | undefined;
  if (kind === "perevozki" && chunkRows.length > 0) {
    const dispatchResult = await dispatchWebPushCargoEvents({
      pool,
      items: chunkRows as any[],
      source: "cron_refresh_cache_chunk",
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

  return { kind, chunk: normalizedChunk, chunkCount, dateFrom, dateTo, chunkCountRows: chunkRows.length, cacheCount: mergedRows.length, detail };
}

function ensureCronAuth(req: VercelRequest, res: VercelResponse, route: string) {
  const ctx = initRequestContext(req, res, route);
  const cronAuthError = requireCronAuth(req);
  if (cronAuthError) {
    logInfo(ctx, "cron_auth_failed", { status: cronAuthError.status });
    res.status(cronAuthError.status).json({ error: cronAuthError.error, request_id: ctx.requestId });
    return { ok: false as const, ctx };
  }
  return { ok: true as const, ctx };
}

function getServiceCredentials(): { login: string; password: string } | null {
  const login = process.env.PEREVOZKI_SERVICE_LOGIN;
  const password = process.env.PEREVOZKI_SERVICE_PASSWORD;
  return login && password ? { login, password } : null;
}

export async function handleRefreshCacheChunk(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = ensureCronAuth(req, res, "cron/refresh-cache");
  if (!auth.ok) return;
  const credentials = getServiceCredentials();
  if (!credentials) return res.status(503).json({ error: "PEREVOZKI_SERVICE_LOGIN/PEREVOZKI_SERVICE_PASSWORD are not configured", request_id: auth.ctx.requestId });

  try {
    const pool = getPool();
    await ensureChunkTables(pool);
    const rotating = getRotatingTask();
    const rawKind = getStringQuery(req, "kind") as CacheKind;
    const kind: CacheKind = rawKind && (["perevozki", "sendings", "invoices", "acts", "customers"] as string[]).includes(rawKind) ? rawKind : rotating.kind;
    const chunk = getRequestedChunk(req, rotating.chunk);

    const result =
      kind === "customers"
        ? { kind, ...(await refreshCustomers(pool, credentials.login, credentials.password)) }
        : await refreshDatedKind(pool, credentials.login, credentials.password, kind, chunk);

    logInfo(auth.ctx, "refresh_cache_chunk_done", result);
    return res.status(200).json({ ok: true, mode: "chunked", historyDays: CACHE_HISTORY_DAYS, chunkDays: CACHE_CHUNK_DAYS, result, request_id: auth.ctx.requestId });
  } catch (e: any) {
    logError(auth.ctx, "refresh_cache_chunk_failed", e);
    return res.status(500).json({ error: "Ошибка обновления chunk-кэша", details: e?.message || String(e), request_id: auth.ctx.requestId });
  }
}

export async function handleRefreshOrdersCacheChunk(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = ensureCronAuth(req, res, "cron/refresh-orders-cache");
  if (!auth.ok) return;
  const credentials = getServiceCredentials();
  if (!credentials) return res.status(503).json({ error: "PEREVOZKI_SERVICE_LOGIN/PEREVOZKI_SERVICE_PASSWORD are not configured", request_id: auth.ctx.requestId });

  try {
    const pool = getPool();
    await ensureChunkTables(pool);
    const rotatingChunk = Math.floor(Date.now() / (15 * 60 * 1000)) % getChunkCount();
    const result = await refreshDatedKind(pool, credentials.login, credentials.password, "orders", getRequestedChunk(req, rotatingChunk));
    logInfo(auth.ctx, "refresh_orders_cache_chunk_done", result);
    return res.status(200).json({ ok: true, mode: "chunked", historyDays: CACHE_HISTORY_DAYS, chunkDays: CACHE_CHUNK_DAYS, result, request_id: auth.ctx.requestId });
  } catch (e: any) {
    logError(auth.ctx, "refresh_orders_cache_chunk_failed", e);
    return res.status(500).json({ error: "Ошибка обновления chunk-кэша заявок", details: e?.message || String(e), request_id: auth.ctx.requestId });
  }
}

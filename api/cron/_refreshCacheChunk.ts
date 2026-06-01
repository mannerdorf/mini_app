import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { requireCronAuth } from "../_lib/cronAuth.js";
import { initRequestContext, logError, logInfo } from "../_lib/observability.js";
import { CACHE_HISTORY_DAYS } from "../../lib/cacheHistoryDays.js";
import {
  CACHE_DEEP_DAYS,
  CACHE_RECENT_DAYS,
  ensureDocumentCacheTables,
  fetchServiceJson,
  getFixedWindowRange,
  getRotatingDocumentKind,
  refreshDatedKindForWindow,
  ROTATING_DOCUMENT_KINDS,
  type DocumentCacheKind,
} from "../../lib/documentCacheRefreshCore.js";

const CRON_INTERVAL_MS = 5 * 60 * 1000;
const GETAPI_URL = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GETAPI";

function getStringQuery(req: VercelRequest, key: string): string {
  const value = req.query[key];
  return typeof value === "string" ? value.trim() : "";
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

function resolveKind(req: VercelRequest, reference = new Date(), intervalMs = CRON_INTERVAL_MS): DocumentCacheKind {
  const rawKind = getStringQuery(req, "kind") as DocumentCacheKind;
  if (rawKind && (["perevozki", "sendings", "invoices", "acts", "customers"] as string[]).includes(rawKind)) {
    return rawKind;
  }
  return getRotatingDocumentKind(reference, intervalMs);
}

/** Крон каждые 5 мин: последние 30 дней, по одному типу документов за запуск. */
export async function handleRefreshCacheRecent(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = ensureCronAuth(req, res, "cron/refresh-cache");
  if (!auth.ok) return;
  const credentials = getServiceCredentials();
  if (!credentials) {
    return res.status(503).json({
      error: "PEREVOZKI_SERVICE_LOGIN/PEREVOZKI_SERVICE_PASSWORD are not configured",
      request_id: auth.ctx.requestId,
    });
  }

  try {
    const pool = getPool();
    await ensureDocumentCacheTables(pool);
    const kind = resolveKind(req);
    const { dateFrom, dateTo } = getFixedWindowRange(CACHE_RECENT_DAYS);

    const result =
      kind === "customers"
        ? {
            kind: "customers" as const,
            mode: "recent" as const,
            dateFrom,
            dateTo,
            chunkCountRows: 0,
            cacheCount: (await refreshCustomers(pool, credentials.login, credentials.password)).count,
          }
        : await refreshDatedKindForWindow(pool, credentials.login, credentials.password, kind, dateFrom, dateTo, "recent");

    logInfo(auth.ctx, "refresh_cache_recent_done", result);
    return res.status(200).json({
      ok: true,
      mode: "recent",
      windowDays: CACHE_RECENT_DAYS,
      historyDays: CACHE_HISTORY_DAYS,
      result,
      request_id: auth.ctx.requestId,
    });
  } catch (e: any) {
    logError(auth.ctx, "refresh_cache_recent_failed", e);
    return res.status(500).json({ error: "Ошибка обновления кэша (recent)", details: e?.message || String(e), request_id: auth.ctx.requestId });
  }
}

/** Крон 4×/сутки: последние 90 дней, по одному типу за запуск. */
export async function handleRefreshCacheDeep(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = ensureCronAuth(req, res, "cron/refresh-cache-deep");
  if (!auth.ok) return;
  const credentials = getServiceCredentials();
  if (!credentials) {
    return res.status(503).json({
      error: "PEREVOZKI_SERVICE_LOGIN/PEREVOZKI_SERVICE_PASSWORD are not configured",
      request_id: auth.ctx.requestId,
    });
  }

  try {
    const pool = getPool();
    await ensureDocumentCacheTables(pool);
    const deepIntervalMs = 6 * 60 * 60 * 1000;
    const rawKind = getStringQuery(req, "kind") as DocumentCacheKind;
    const kind =
      rawKind && (ROTATING_DOCUMENT_KINDS as string[]).includes(rawKind)
        ? rawKind
        : ROTATING_DOCUMENT_KINDS[Math.floor(Date.now() / deepIntervalMs) % ROTATING_DOCUMENT_KINDS.length] ?? "perevozki";
    const { dateFrom, dateTo } = getFixedWindowRange(CACHE_DEEP_DAYS);

    const result = await refreshDatedKindForWindow(pool, credentials.login, credentials.password, kind, dateFrom, dateTo, "deep");

    logInfo(auth.ctx, "refresh_cache_deep_done", result);
    return res.status(200).json({
      ok: true,
      mode: "deep",
      windowDays: CACHE_DEEP_DAYS,
      historyDays: CACHE_HISTORY_DAYS,
      result,
      request_id: auth.ctx.requestId,
    });
  } catch (e: any) {
    logError(auth.ctx, "refresh_cache_deep_failed", e);
    return res.status(500).json({ error: "Ошибка обновления кэша (deep)", details: e?.message || String(e), request_id: auth.ctx.requestId });
  }
}

/** @deprecated используйте handleRefreshCacheRecent */
export async function handleRefreshCacheChunk(req: VercelRequest, res: VercelResponse) {
  return handleRefreshCacheRecent(req, res);
}

export async function handleRefreshOrdersCacheChunk(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = ensureCronAuth(req, res, "cron/refresh-orders-cache");
  if (!auth.ok) return;
  const credentials = getServiceCredentials();
  if (!credentials) {
    return res.status(503).json({
      error: "PEREVOZKI_SERVICE_LOGIN/PEREVOZKI_SERVICE_PASSWORD are not configured",
      request_id: auth.ctx.requestId,
    });
  }

  try {
    const pool = getPool();
    await ensureDocumentCacheTables(pool);
    const { dateFrom, dateTo } = getFixedWindowRange(CACHE_DEEP_DAYS);
    const result = await refreshDatedKindForWindow(pool, credentials.login, credentials.password, "orders", dateFrom, dateTo, "chunk", { webPush: false });
    logInfo(auth.ctx, "refresh_orders_cache_done", result);
    return res.status(200).json({ ok: true, mode: "orders", historyDays: CACHE_HISTORY_DAYS, result, request_id: auth.ctx.requestId });
  } catch (e: any) {
    logError(auth.ctx, "refresh_orders_cache_failed", e);
    return res.status(500).json({ error: "Ошибка обновления chunk-кэша заявок", details: e?.message || String(e), request_id: auth.ctx.requestId });
  }
}

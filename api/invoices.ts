import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyRegisteredUser, type VerifiedRegisteredUser } from "../lib/verifyRegisteredUser.js";
import { initRequestContext, logError } from "./_lib/observability.js";
import { respondCorsPreflight } from "./_lib/cors.js";
import {
  getPerevozkiServiceCredentials,
  shouldServeFromDocumentCache,
} from "../lib/cacheHistoryDays.js";
import { handleHaulzSummarySandboxRequest, isHaulzSummarySandboxAction } from "../lib/haulzSummarySandboxApi.js";
import { fetchWithTimeout, upstreamTimeoutMessage } from "../lib/fetchWithTimeout.js";
import { preferCacheOnlyOnVercel } from "../lib/vercelRuntime.js";
import { readDocumentsFromCacheByPeriod } from "../lib/documentCacheRead.js";
import {
  MAX_INVOICE_ROWS_PER_RESPONSE,
  MAX_SERVICE_INVOICE_RANGE_DAYS,
  capInvoiceRows,
  clampDateFromToMaxSpan,
  filterUnpaidInvoices,
  slimInvoiceForEdoMonitor,
} from "../lib/invoiceResponseLimits.js";

/**
 * Прокси для GetIinvoices: счета.
 * Если в БД есть свежий кэш (обновлён кроном за 15 мин) и у пользователя есть INN в account_companies — отдаём из кэша.
 */
const BASE_URL =
  "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetIinvoices";

const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";
const CACHE_FRESH_MINUTES = 15;

function invoiceInn(item: any): string {
  const v = item?.INN ?? item?.Inn ?? item?.inn ?? "";
  return String(v).trim();
}

export function invoicesItemInn(item: any): string {
  return invoiceInn(item);
}

function invoiceDate(item: any): string {
  const d = item?.DateDoc ?? item?.Date ?? item?.dateDoc ?? item?.date ?? "";
  return normalizeDateOnly(d);
}

function extractInvoiceList(json: unknown): any[] {
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== "object") return [];
  const o = json as Record<string, unknown>;
  const list = o.items ?? o.Items ?? o.invoices ?? o.Invoices ?? o.data ?? o.Data ?? [];
  return Array.isArray(list) ? list : [];
}

async function filterInvoicesForRegisteredUser(
  pool: ReturnType<typeof getPool>,
  verified: VerifiedRegisteredUser,
  login: string,
  inn: unknown,
  dateFrom: string,
  dateTo: string,
  list: any[],
): Promise<any[]> {
  let filterInns: Set<string> | null = null;
  if (!verified.accessAllInns) {
    const acRows = await pool.query<{ inn: string }>(
      "SELECT inn FROM account_companies WHERE login = $1",
      [String(login).trim().toLowerCase()],
    );
    const allowed = new Set(acRows.rows.map((r) => r.inn.trim()).filter(Boolean));
    if (verified.inn?.trim()) allowed.add(verified.inn.trim());
    filterInns = allowed.size > 0 ? allowed : verified.inn ? new Set([verified.inn]) : null;
  }
  const requestedInn = inn && String(inn).trim() ? String(inn).trim() : null;
  const finalInns =
    filterInns === null
      ? null
      : requestedInn
        ? filterInns.has(requestedInn)
          ? new Set([requestedInn])
          : new Set<string>()
        : filterInns;
  return list.filter((item) => {
    if (finalInns !== null) {
      const itemInnVal = invoiceInn(item);
      if (!finalInns.has(itemInnVal)) return false;
    }
    const d = invoiceDate(item);
    return d >= dateFrom && d <= dateTo;
  });
}

function normalizeDateOnly(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const ruMatch = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (ruMatch) return `${ruMatch[3]}-${ruMatch[2]}-${ruMatch[1]}`;
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().split("T")[0];
}

type InvoiceResponseOptions = {
  monitor?: string;
  unpaidOnly?: boolean;
};

function finalizeInvoiceList(items: unknown[], options: InvoiceResponseOptions): unknown[] {
  let rows = (Array.isArray(items) ? items : []).map((item) =>
    item && typeof item === "object" ? (item as Record<string, unknown>) : {},
  );
  if (options.unpaidOnly) {
    rows = filterUnpaidInvoices(rows);
  }
  if (options.monitor === "edo") {
    rows = rows.map(slimInvoiceForEdoMonitor);
  }
  return capInvoiceRows(rows, MAX_INVOICE_ROWS_PER_RESPONSE).items;
}

/** Кэш счетов для зарегистрированного пользователя (Partner API v1 и isRegisteredUser). */
export async function readRegisteredInvoicesFromCache(
  pool: ReturnType<typeof getPool>,
  verified: VerifiedRegisteredUser,
  login: string,
  dateFrom: string,
  dateTo: string,
  inn: unknown,
): Promise<any[]> {
  try {
    let filterInns: Set<string> | null = null;
    if (!verified.accessAllInns) {
      const acRows = await pool.query<{ inn: string }>(
        "SELECT inn FROM account_companies WHERE login = $1",
        [String(login).trim().toLowerCase()],
      );
      const allowed = new Set(acRows.rows.map((r) => r.inn.trim()).filter(Boolean));
      if (verified.inn?.trim()) allowed.add(verified.inn.trim());
      filterInns = allowed.size > 0 ? allowed : verified.inn ? new Set([verified.inn]) : null;
    }
    const requestedInn = inn && String(inn).trim() ? String(inn).trim() : null;
    const finalInns =
      filterInns === null
        ? null
        : requestedInn
          ? filterInns.has(requestedInn)
            ? new Set([requestedInn])
            : new Set<string>()
          : filterInns;

    const { items, fromNormalized } = await readDocumentsFromCacheByPeriod(pool, "invoices", dateFrom, dateTo, {
      inns: finalInns,
    });
    if (fromNormalized) return items;
    return filterInvoicesForRegisteredUser(pool, verified, login, inn, dateFrom, dateTo, items);
  } catch {
    return [];
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (respondCorsPreflight(req, res)) return;
  const ctx = initRequestContext(req, res, "invoices");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  let body: any = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON body", request_id: ctx.requestId });
    }
  }

  if (isHaulzSummarySandboxAction(body?.action)) {
    const handled = await handleHaulzSummarySandboxRequest(req, res, ctx.requestId);
    if (handled) return;
  }

  const {
    login,
    password,
    dateFrom: rawDateFrom = "2024-01-01",
    dateTo: rawDateTo = new Date().toISOString().split("T")[0],
    inn,
    serviceMode,
    isRegisteredUser,
    monitor,
    unpaidOnly,
  } = body || {};

  let dateFrom = String(rawDateFrom ?? "").trim();
  let dateTo = String(rawDateTo ?? "").trim();
  const responseOptions: InvoiceResponseOptions = {
    monitor: typeof monitor === "string" ? monitor.trim() : undefined,
    unpaidOnly: unpaidOnly === true || unpaidOnly === "true" || unpaidOnly === 1,
  };

  if (!login || !password) {
    return res.status(400).json({ error: "login and password are required", request_id: ctx.requestId });
  }

  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(dateFrom) || !dateRe.test(dateTo)) {
    return res
      .status(400)
      .json({ error: "Invalid date format (YYYY-MM-DD required)", request_id: ctx.requestId });
  }

  if (serviceMode) {
    dateFrom = clampDateFromToMaxSpan(dateFrom, dateTo, MAX_SERVICE_INVOICE_RANGE_DAYS);
  }

  const useDocumentCache = shouldServeFromDocumentCache(dateFrom, dateTo);
  let registeredVerified: VerifiedRegisteredUser | null = null;

  if (isRegisteredUser) {
    try {
      const pool = getPool();
      const verified = await verifyRegisteredUser(pool, login, password);
      if (!verified) {
        return res.status(401).json({ error: "Неверный email или пароль", request_id: ctx.requestId });
      }
      registeredVerified = verified;
      if (!useDocumentCache) {
        // Период старше окна кэша — ниже прямой запрос в 1С через сервисный аккаунт.
      } else {
        const filtered = await readRegisteredInvoicesFromCache(pool, verified, login, dateFrom, dateTo, inn);
        return res.status(200).json(finalizeInvoiceList(filtered, responseOptions));
      }
    } catch (e) {
      logError(ctx, "invoices_registered_user_failed", e);
      return res.status(200).json([]);
    }
  }

  // Быстрый путь: cache_invoices (последние CACHE_HISTORY_DAYS дн.; старше — 1С ниже).
  if (useDocumentCache) try {
    const pool = getPool();
    if (serviceMode) {
      const { items } = await readDocumentsFromCacheByPeriod(pool, "invoices", dateFrom, dateTo);
      const filtered = items.filter((item) => {
        const d = invoiceDate(item);
        return d >= dateFrom && d <= dateTo;
      });
      return res.status(200).json(finalizeInvoiceList(filtered, responseOptions));
    }
    const userInnsRow = await pool.query<{ inn: string }>(
      "SELECT inn FROM account_companies WHERE login = $1",
      [String(login).trim().toLowerCase()],
    );
    const allowedInns = new Set(userInnsRow.rows.map((r) => r.inn.trim()).filter(Boolean));
    const requestedInn = inn && String(inn).trim() ? String(inn).trim() : null;
    const filterInns = requestedInn
      ? allowedInns.has(requestedInn)
        ? new Set([requestedInn])
        : new Set<string>()
      : allowedInns;
    if (filterInns.size > 0) {
      const { items, fromNormalized } = await readDocumentsFromCacheByPeriod(pool, "invoices", dateFrom, dateTo, {
        inns: filterInns,
      });
      const filtered = fromNormalized
        ? items
        : items.filter((item) => {
            const itemInnVal = invoiceInn(item);
            if (!filterInns.has(itemInnVal)) return false;
            const d = invoiceDate(item);
            return d >= dateFrom && d <= dateTo;
          });
      return res.status(200).json(finalizeInvoiceList(filtered, responseOptions));
    }
  } catch {
    if (preferCacheOnlyOnVercel()) {
      return res.status(200).json([]);
    }
    // БД недоступна или кэш пустой — идём в 1С
  }

  if (preferCacheOnlyOnVercel()) {
    return res.status(200).json([]);
  }

  const url = new URL(BASE_URL);
  url.searchParams.set("DateB", dateFrom);
  url.searchParams.set("DateE", dateTo);
  if (!serviceMode && inn && String(inn).trim()) {
    url.searchParams.set("INN", String(inn).trim());
  }

  let upstreamLogin = String(login);
  let upstreamPassword = String(password);
  if (isRegisteredUser && registeredVerified) {
    const serviceCreds = getPerevozkiServiceCredentials();
    if (!serviceCreds) {
      return res.status(503).json({
        error: "Service credentials are not configured",
        request_id: ctx.requestId,
      });
    }
    upstreamLogin = serviceCreds.login;
    upstreamPassword = serviceCreds.password;
    const requestedInn = inn && String(inn).trim() ? String(inn).trim() : null;
    if (requestedInn) url.searchParams.set("INN", requestedInn);
  }

  try {
    const upstream = await fetchWithTimeout(
      url.toString(),
      {
        method: "GET",
        headers: {
          Auth: `Basic ${upstreamLogin}:${upstreamPassword}`,
          Authorization: SERVICE_AUTH,
        },
      },
      50_000,
    );

    const text = await upstream.text();

    if (!upstream.ok) {
      try {
        const errJson = JSON.parse(text) as Record<string, unknown>;
        const message = (errJson?.Error ?? errJson?.error ?? errJson?.message) as
          | string
          | undefined;
        const errorText =
          typeof message === "string" && message.trim()
            ? message.trim()
            : text || upstream.statusText;
        return res.status(upstream.status).json({ error: errorText, request_id: ctx.requestId });
      } catch {
        return res.status(upstream.status).send(text || upstream.statusText);
      }
    }

    try {
      const json = JSON.parse(text);
      if (json && typeof json === "object" && json.Success === false) {
        const message = (json.Error ?? json.error ?? json.message) as
          | string
          | undefined;
        const errorText =
          typeof message === "string" && message.trim()
            ? message.trim()
            : "Ошибка авторизации";
        return res.status(401).json({ error: errorText, request_id: ctx.requestId });
      }
      if (isRegisteredUser && registeredVerified) {
        try {
          const pool = getPool();
          const list = extractInvoiceList(json);
          const filtered = await filterInvoicesForRegisteredUser(
            pool,
            registeredVerified,
            login,
            inn,
            dateFrom,
            dateTo,
            list,
          );
          return res.status(200).json(finalizeInvoiceList(filtered, responseOptions));
        } catch (e) {
          logError(ctx, "invoices_registered_1c_filter_failed", e);
          return res.status(200).json([]);
        }
      }
      return res.status(200).json(finalizeInvoiceList(extractInvoiceList(json), responseOptions));
    } catch {
      return res.status(200).send(text);
    }
  } catch (e: unknown) {
    logError(ctx, "invoices_proxy_failed", e);
    const isTimeout = e instanceof Error && e.name === "AbortError";
    return res.status(isTimeout ? 504 : 500).json({
      error: upstreamTimeoutMessage(e),
      request_id: ctx.requestId,
    });
  }
}

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest, getAdminTokenPayload } from "../lib/adminAuth.js";
import { withErrorLog } from "../lib/requestErrorLog.js";
import { initRequestContext, logError } from "./_lib/observability.js";
import { readDocumentsFromCacheByPeriod } from "../lib/documentCacheRead.js";
import { getPerevozkiServiceCredentials } from "../lib/cacheHistoryDays.js";
import {
  buildCargoTimelineReportRow,
  filterCargoTimelineRowsByDelay,
  matchesCargoRouteFilter,
  resolveCargoTimelineSteps,
  summarizeCargoTimelineReport,
  type CargoTimelineDelayFilter,
  type CargoTimelineReport,
} from "../lib/cargoTimelineReport.js";
import { fetchWithTimeout } from "../lib/fetchWithTimeout.js";

const GETAPI_BASE = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GETAPI";
const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";
const UPSTREAM_TIMEOUT_MS = 20_000;
const MAX_ROWS = 200;
const MAX_FETCH = 40;
const FETCH_CONCURRENCY = 6;

function normalizePerevozkaNumberForLookup(num: string): string {
  const trimmed = String(num).trim();
  const digits = trimmed.replace(/^0000-/, "").replace(/\D/g, "");
  if (!digits) return trimmed;
  const core = digits.replace(/^0+/, "") || digits;
  if (/^\d{1,9}$/.test(core)) return core.padStart(9, "0");
  return trimmed;
}

async function fetchTimelineFrom1C(number: string, inn: string | undefined, login: string, password: string): Promise<unknown | null> {
  const haulzAuth = process.env.POSTB_HAULZ_AUTH?.trim() || `Basic ${login}:${password}`;
  const norm = normalizePerevozkaNumberForLookup(number);
  for (const methodName of ["Getperevozka", "GetPerevozka"] as const) {
    const url = new URL(GETAPI_BASE);
    url.searchParams.set("metod", methodName);
    url.searchParams.set("Number", norm);
    if (inn?.trim()) url.searchParams.set("INN", inn.trim());
    try {
      const upstream = await fetchWithTimeout(
        url.toString(),
        {
          method: "GET",
          headers: {
            Auth: haulzAuth,
            Authorization: SERVICE_AUTH,
            Accept: "application/json",
          },
        },
        UPSTREAM_TIMEOUT_MS,
      );
      if (!upstream.ok) continue;
      const text = await upstream.text();
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function runWorker() {
    while (nextIndex < items.length) {
      const idx = nextIndex;
      nextIndex += 1;
      results[idx] = await worker(items[idx]!, idx);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => runWorker());
  await Promise.all(workers);
  return results;
}

async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "admin-cargo-timeline-report");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const token = getAdminTokenFromRequest(req);
  if (!verifyAdminToken(token) || getAdminTokenPayload(token)?.superAdmin !== true) {
    return res.status(403).json({ error: "Доступ только для суперадминистратора", request_id: ctx.requestId });
  }

  let body: Record<string, unknown> = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
  if (typeof req.body === "string") {
    try {
      body = JSON.parse(req.body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON body", request_id: ctx.requestId });
    }
  }

  const dateFrom = String(body.dateFrom ?? "").trim();
  const dateTo = String(body.dateTo ?? "").trim();
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(dateFrom) || !dateRe.test(dateTo)) {
    return res.status(400).json({ error: "Укажите dateFrom и dateTo в формате YYYY-MM-DD", request_id: ctx.requestId });
  }
  if (dateFrom > dateTo) {
    return res.status(400).json({ error: "dateFrom не может быть позже dateTo", request_id: ctx.requestId });
  }

  const routeFilterRaw = String(body.routeFilter ?? "all").trim();
  const routeFilter = routeFilterRaw === "MSK-KGD" || routeFilterRaw === "KGD-MSK" ? routeFilterRaw : "all";
  const delayFilterRaw = String(body.delayFilter ?? "all").trim();
  const delayFilter: CargoTimelineDelayFilter =
    delayFilterRaw === "loading" || delayFilterRaw === "delivery" ? delayFilterRaw : "all";

  const serviceCreds = getPerevozkiServiceCredentials();

  try {
    const pool = getPool();
    const { items } = await readDocumentsFromCacheByPeriod(pool, "perevozki", dateFrom, dateTo, {
      dateField: "prih",
    });
    const filtered = items
      .filter((item) => item && typeof item === "object")
      .filter((item) => matchesCargoRouteFilter(item as Record<string, unknown>, routeFilter))
      .slice(0, MAX_ROWS) as Record<string, unknown>[];

    const needsFetch: Array<{ item: Record<string, unknown>; index: number }> = [];
    const preliminary: Array<ReturnType<typeof buildCargoTimelineReportRow> | null> = filtered.map((item, index) => {
      const embeddedSteps = resolveCargoTimelineSteps(item, item);
      const row = buildCargoTimelineReportRow(item, embeddedSteps, embeddedSteps.length >= 2 ? "embedded" : "partial");
      if (!row && serviceCreds) needsFetch.push({ item, index });
      return row;
    });

    const fetchTargets = needsFetch.slice(0, MAX_FETCH);
    if (fetchTargets.length > 0 && serviceCreds) {
      await mapWithConcurrency(fetchTargets, FETCH_CONCURRENCY, async ({ item, index }) => {
        const number = String(item.Number ?? item.number ?? "").trim();
        if (!number) return;
        const inn = String(item.INN ?? item.Inn ?? item.inn ?? "").trim() || undefined;
        const payload = await fetchTimelineFrom1C(number, inn, serviceCreds.login, serviceCreds.password);
        if (!payload) return;
        const steps = resolveCargoTimelineSteps(payload, item);
        preliminary[index] = buildCargoTimelineReportRow(item, steps, steps.length >= 2 ? "fetched" : "partial");
      });
    }

    const rows = filterCargoTimelineRowsByDelay(
      preliminary.filter((row): row is NonNullable<typeof row> => row != null),
      delayFilter,
    );

    const report: CargoTimelineReport = {
      dateFrom,
      dateTo,
      summary: summarizeCargoTimelineReport(
        preliminary.filter((row): row is NonNullable<typeof row> => row != null),
      ),
      rows,
      truncated: items.length > MAX_ROWS,
      truncatedMessage:
        items.length > MAX_ROWS
          ? `Показаны первые ${MAX_ROWS} перевозок из ${items.length} за период.`
          : undefined,
    };

    return res.status(200).json(report);
  } catch (e: unknown) {
    logError(ctx, "admin_cargo_timeline_report_failed", e);
    return res.status(500).json({
      error: (e as Error)?.message || "Ошибка формирования отчёта таймлайна",
      request_id: ctx.requestId,
    });
  }
}

export default withErrorLog(handler);

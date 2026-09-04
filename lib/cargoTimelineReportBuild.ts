import type { Pool } from "pg";
import { readDocumentsFromCacheByPeriod } from "./documentCacheRead.js";
import { getPerevozkiServiceCredentials } from "./cacheHistoryDays.js";
import {
  buildCargoTimelineReportRow,
  filterCargoTimelineRowsByDelay,
  matchesCargoRouteFilter,
  resolveCargoTimelineSteps,
  summarizeCargoTimelineReport,
  type CargoTimelineDelayFilter,
  type CargoTimelineReport,
} from "./cargoTimelineReport.js";
import { fetchWithTimeout } from "./fetchWithTimeout.js";

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

async function fetchTimelineFrom1C(
  number: string,
  inn: string | undefined,
  login: string,
  password: string,
): Promise<unknown | null> {
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

export type BuildCargoTimelineReportParams = {
  dateFrom: string;
  dateTo: string;
  routeFilter: "all" | "MSK-KGD" | "KGD-MSK";
  delayFilter: CargoTimelineDelayFilter;
};

export async function buildCargoTimelineReport(
  pool: Pool,
  params: BuildCargoTimelineReportParams,
): Promise<CargoTimelineReport> {
  const { dateFrom, dateTo, routeFilter, delayFilter } = params;
  const serviceCreds = getPerevozkiServiceCredentials();

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

  return {
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
}

export function parseCargoTimelineReportParams(body: Record<string, unknown>): BuildCargoTimelineReportParams | { error: string } {
  const dateFrom = String(body.dateFrom ?? "").trim();
  const dateTo = String(body.dateTo ?? "").trim();
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(dateFrom) || !dateRe.test(dateTo)) {
    return { error: "Укажите dateFrom и dateTo в формате YYYY-MM-DD" };
  }
  if (dateFrom > dateTo) {
    return { error: "dateFrom не может быть позже dateTo" };
  }

  const routeFilterRaw = String(body.routeFilter ?? "all").trim();
  const routeFilter = routeFilterRaw === "MSK-KGD" || routeFilterRaw === "KGD-MSK" ? routeFilterRaw : "all";
  const delayFilterRaw = String(body.delayFilter ?? "all").trim();
  const delayFilter: CargoTimelineDelayFilter =
    delayFilterRaw === "loading" || delayFilterRaw === "delivery" ? delayFilterRaw : "all";

  return { dateFrom, dateTo, routeFilter, delayFilter };
}

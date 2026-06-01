/** Глубина «скользящего» окна крона (recent/deep). Старше earliest — только если есть в cache_* после backfill. */
export const CACHE_HISTORY_DAYS = Math.max(
  1,
  Number(process.env.CACHE_HISTORY_DAYS) || 365,
);

/** Нижняя граница истории в cache_* (backfill и отдача из кэша на Vercel). */
export const CACHE_EARLIEST_DATE = (() => {
  const raw = String(process.env.CACHE_EARLIEST_DATE ?? "2025-01-01").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "2025-01-01";
})();

function minIsoDate(a: string, b: string): string {
  return a <= b ? a : b;
}

export function cacheHistoryDateFrom(reference = new Date()): string {
  const from = new Date(reference);
  from.setDate(from.getDate() - CACHE_HISTORY_DAYS);
  const rolling = from.toISOString().split("T")[0];
  return minIsoDate(CACHE_EARLIEST_DATE, rolling);
}

/** Начало диапазона backfill: не раньше CACHE_EARLIEST_DATE. */
export function cacheBackfillRangeStart(reference = new Date(), historyDays = CACHE_HISTORY_DAYS): string {
  const span = Math.max(1, Math.trunc(historyDays));
  const from = new Date(reference);
  from.setDate(from.getDate() - (span - 1));
  const rolling = from.toISOString().split("T")[0];
  return minIsoDate(CACHE_EARLIEST_DATE, rolling);
}

/** true, если dateFrom раньше окна, которое покрывает кэш крона. */
export function isDateRangeOlderThanCache(dateFrom: string, reference = new Date()): boolean {
  const from = String(dateFrom ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return false;
  return from < cacheHistoryDateFrom(reference);
}

/**
 * Отдавать из cache_* (иначе — прямой запрос в 1С).
 * Учитывает пересечение периода с окном кэша: «год 2025» (01.01–31.12) при кэше с июня
 * всё равно читается из Postgres, а не уходит в 1С с Vercel.
 */
export function shouldServeFromDocumentCache(
  dateFrom: string,
  dateTo?: string,
  reference = new Date(),
): boolean {
  const cacheFrom = cacheHistoryDateFrom(reference);
  const from = String(dateFrom ?? "").trim();
  const to = String(dateTo ?? from).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return true;
  if (/^\d{4}-\d{2}-\d{2}$/.test(to) && to >= cacheFrom) return true;
  return from >= cacheFrom;
}

export function getPerevozkiServiceCredentials(): { login: string; password: string } | null {
  const login = String(process.env.PEREVOZKI_SERVICE_LOGIN ?? "").trim();
  const password = String(process.env.PEREVOZKI_SERVICE_PASSWORD ?? "").trim();
  if (!login || !password) return null;
  return { login, password };
}

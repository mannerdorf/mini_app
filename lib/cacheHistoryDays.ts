/** Глубина снимка в cache_* (крон refresh-cache). Старше — прямой запрос в 1С. */
export const CACHE_HISTORY_DAYS = Math.max(
  1,
  Number(process.env.CACHE_HISTORY_DAYS) || 365,
);

export function cacheHistoryDateFrom(reference = new Date()): string {
  const from = new Date(reference);
  from.setDate(from.getDate() - CACHE_HISTORY_DAYS);
  return from.toISOString().split("T")[0];
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

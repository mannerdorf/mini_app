/** Канонические домены production (haulz.space). Legacy haulz.ru — на период переезда. */

export const HAULZ_APP_HOST = "haulz.space";
export const HAULZ_API_HOST = "api.haulz.space";
export const HAULZ_APP_RELEASE_HOST = "app.haulz.space";

export const DEFAULT_APP_URL = `https://${HAULZ_APP_HOST}`;
export const DEFAULT_PUBLIC_API_ORIGIN = `https://${HAULZ_API_HOST}`;
export const DEFAULT_APP_RELEASE_ORIGIN = `https://${HAULZ_APP_RELEASE_HOST}`;

/** @deprecated use HAULZ_APP_RELEASE_HOST */
export const HAULZ_ANDROID_RELEASE_HOST = HAULZ_APP_RELEASE_HOST;

/** @deprecated use DEFAULT_APP_RELEASE_ORIGIN */
export const DEFAULT_ANDROID_RELEASE_ORIGIN = DEFAULT_APP_RELEASE_ORIGIN;

/** Старые домены: фронт и API остаются валидными до отключения редиректа. */
export const LEGACY_APP_HOST = "haulz.ru";
export const LEGACY_API_HOST = "api.haulz.ru";
export const LEGACY_APP_URL = `https://${LEGACY_APP_HOST}`;
export const LEGACY_PUBLIC_API_ORIGIN = `https://${LEGACY_API_HOST}`;

export function isHaulzFrontendHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === HAULZ_APP_HOST || host.endsWith(`.${HAULZ_APP_HOST}`)) return true;
  if (host === LEGACY_APP_HOST || host.endsWith(`.${LEGACY_APP_HOST}`)) return true;
  return host.endsWith(".layero.ru");
}

/**
 * Браузер ходит в /api/* на том же хосте (nginx проксирует на VPS).
 * Не api.haulz.space — меньше нагрузка и стабильнее на мобильных сетях.
 */
export function usesSameOriginBrowserApi(origin: string): boolean {
  const normalized = origin.trim().replace(/\/+$/, "");
  if (!normalized) return false;
  try {
    return isHaulzFrontendHostname(new URL(normalized).hostname);
  } catch {
    return false;
  }
}

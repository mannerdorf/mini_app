/** VPS Timeweb (Node + nginx). */
export const HAULZ_API_HOST = "72.56.36.185";

/**
 * Базовый URL API. По умолчанию — IP бэкенда.
 * Для HTTPS-фронта (haulz.ru) при mixed content задайте в сборке:
 * VITE_API_ORIGIN=https://api.haulz.ru (тот же сервер, другой Host/SNI).
 */
export function resolveHaulzApiOrigin(envOrigin?: string): string {
  const fromEnv = String(envOrigin ?? "").trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  return `http://${HAULZ_API_HOST}`;
}

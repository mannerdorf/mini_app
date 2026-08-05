/** Официальный базовый URL Partner API v1 (production VPS). */
export const PARTNER_API_PUBLIC_ORIGIN = "https://api.haulz.ru";

/**
 * Origin для браузерного миниаппа / Capacitor.
 * :8443 — обход зависаний TLS на :443 с части внешних сетей (HTTP :80 при этом жив).
 */
export const APP_API_PUBLIC_ORIGIN = "https://api.haulz.ru:8443";

/** Документация для интеграторов (путь в репозитории). */
export const PARTNER_API_DOCS_PATH = "docs/PARTNER_API.md";

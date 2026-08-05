/** Официальный базовый URL Partner API v1 (production VPS). */
export const PARTNER_API_PUBLIC_ORIGIN = "https://api.haulz.ru";

/**
 * Origin для браузерного миниаппа / Capacitor.
 * Только :443 — мобильные сети / Telegram WebView часто блокируют :8443 и другие non-443 порты.
 * Устойчивость при флапе TLS на api — через same-origin proxy на haulz.ru (Caddy), не через :8443.
 */
export const APP_API_PUBLIC_ORIGIN = "https://api.haulz.ru";

/** Документация для интеграторов (путь в репозитории). */
export const PARTNER_API_DOCS_PATH = "docs/PARTNER_API.md";

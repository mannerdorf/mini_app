import { getAppUrl } from "../sendRegistrationEmail.js";
import { getPublicApiOrigin } from "../publicApiOrigin.js";

/** Базовый URL API для ссылок из писем (согласование перевозки). */
export function getHaulzCalcPublicApiBase(): string {
  const explicit = String(process.env.HAULZ_CALC_PUBLIC_API_BASE || process.env.VITE_API_ORIGIN || "").trim();
  if (explicit) return explicit.replace(/\/$/, "");
  return getPublicApiOrigin() || getAppUrl().replace(/\/$/, "");
}

export function buildCalcAgreeTransportUrl(token: string): string {
  const base = getHaulzCalcPublicApiBase();
  return `${base}/api/haulz-calculator/agree-transport?token=${encodeURIComponent(token)}`;
}

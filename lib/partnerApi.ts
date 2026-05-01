import type { VercelRequest } from "@vercel/node";

/**
 * Извлекает токен из заголовка `Authorization: Bearer …` (внешний API v1 и проверки здоровья).
 */
export function getBearerPartnerToken(req: VercelRequest): string {
  const raw = req.headers?.authorization || req.headers?.Authorization;
  const s = Array.isArray(raw) ? raw[0] : String(raw || "");
  const m = s.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

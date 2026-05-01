import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Партнёрский API (раздел 12): доступ по статическому ключу из окружения.
 * `HAULZ_PARTNER_API_KEY` — один ключ, или `HAULZ_PARTNER_API_KEYS` — несколько через запятую.
 */
export function getBearerPartnerToken(req: VercelRequest): string {
  const raw = req.headers?.authorization || req.headers?.Authorization;
  const s = Array.isArray(raw) ? raw[0] : String(raw || "");
  const m = s.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

export function getConfiguredPartnerKeys(): string[] {
  const multi = String(process.env.HAULZ_PARTNER_API_KEYS || "").trim();
  if (multi) {
    return multi
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }
  const single = String(process.env.HAULZ_PARTNER_API_KEY || "").trim();
  return single ? [single] : [];
}

export function verifyPartnerApiKey(token: string): boolean {
  if (!token) return false;
  const keys = getConfiguredPartnerKeys();
  return keys.length > 0 && keys.includes(token);
}

/** Отправляет 401 и возвращает false, если ключ неверен или не настроен. */
export function requirePartnerApiAuth(
  req: VercelRequest,
  res: VercelResponse,
  requestId: string
): boolean {
  const keys = getConfiguredPartnerKeys();
  if (keys.length === 0) {
    res.status(503).json({
      error: "Partner API не настроен: задайте HAULZ_PARTNER_API_KEY или HAULZ_PARTNER_API_KEYS",
      request_id: requestId,
    });
    return false;
  }
  const token = getBearerPartnerToken(req);
  if (!verifyPartnerApiKey(token)) {
    res.status(401).json({ error: "Неверный или отсутствует Bearer-токен партнёра", request_id: requestId });
    return false;
  }
  return true;
}

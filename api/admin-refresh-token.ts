import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createAdminToken } from "../lib/adminAuth.js";
import { getAdminTokenFromRequest } from "../lib/adminAuth.js";
import { verifyAdminToken } from "../lib/adminAuth.js";

/**
 * POST /api/admin-refresh-token
 * Headers: Authorization: Bearer <token>
 *
 * Если токен валиден — возвращает новый токен (продлевает сессию).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = getAdminTokenFromRequest(req);
  if (!verifyAdminToken(token)) {
    return res.status(401).json({ error: "Требуется авторизация админа" });
  }

  const newToken = createAdminToken();
  return res.status(200).json({ ok: true, adminToken: newToken });
}

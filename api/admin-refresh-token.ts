import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createAdminToken } from "../lib/adminAuth.js";
import { getAdminTokenFromRequest } from "../lib/adminAuth.js";
import { verifyAdminToken } from "../lib/adminAuth.js";
import { initRequestContext } from "./_lib/observability.js";

/**
 * POST /api/admin-refresh-token
 * Headers: Authorization: Bearer <token>
 *
 * Если токен валиден — возвращает новый токен (продлевает сессию).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "admin-refresh-token");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const token = getAdminTokenFromRequest(req);
  if (!verifyAdminToken(token)) {
    return res.status(401).json({ error: "Требуется авторизация админа", request_id: ctx.requestId });
  }

  const newToken = createAdminToken();
  return res.status(200).json({ ok: true, adminToken: newToken, request_id: ctx.requestId });
}

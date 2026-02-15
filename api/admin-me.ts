import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminTokenFromRequest, getAdminTokenPayload } from "../lib/adminAuth.js";
import { withErrorLog } from "../lib/requestErrorLog.js";

/** GET /api/admin-me — возвращает isSuperAdmin (true только для входа по ADMIN_LOGIN/ADMIN_PASSWORD в Vercel) */
async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const token = getAdminTokenFromRequest(req);
  const payload = getAdminTokenPayload(token);
  if (!payload?.admin) {
    return res.status(401).json({ error: "Требуется авторизация админа" });
  }
  return res.status(200).json({ isSuperAdmin: payload.superAdmin === true });
}
export default withErrorLog(handler);
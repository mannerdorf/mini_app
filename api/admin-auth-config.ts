import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest } from "../lib/adminAuth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = getAdminTokenFromRequest(req);
  if (!verifyAdminToken(token)) {
    return res.status(401).json({ error: "Требуется авторизация админа" });
  }
  if (req.method === "GET") {
    try {
      const pool = getPool();
      const { rows } = await pool.query("SELECT api_v1, api_v2, cms FROM admin_auth_config WHERE id = 1");
      const config = rows[0] || { api_v1: true, api_v2: true, cms: true };
      return res.status(200).json({ config });
    } catch (e: unknown) {
      console.error("admin-auth-config GET error:", e);
      return res.status(500).json({ error: "Ошибка загрузки конфигурации" });
    }
  }
  if (req.method === "POST") {
    let body: { api_v1?: boolean; api_v2?: boolean; cms?: boolean } = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: "Invalid JSON" });
      }
    }
    const api_v1 = body.api_v1 ?? true;
    const api_v2 = body.api_v2 ?? true;
    const cms = body.cms ?? true;
    try {
      const pool = getPool();
      await pool.query(
        `INSERT INTO admin_auth_config (id, api_v1, api_v2, cms, updated_at)
         VALUES (1, $1, $2, $3, now())
         ON CONFLICT (id) DO UPDATE SET api_v1 = EXCLUDED.api_v1, api_v2 = EXCLUDED.api_v2, cms = EXCLUDED.cms, updated_at = now()`,
        [api_v1, api_v2, cms]
      );
      return res.status(200).json({ ok: true, config: { api_v1, api_v2, cms } });
    } catch (e: unknown) {
      console.error("admin-auth-config POST error:", e);
      return res.status(500).json({ error: "Ошибка обновления конфигурации" });
    }
  }
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}

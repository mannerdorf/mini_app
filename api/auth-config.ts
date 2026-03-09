import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { initRequestContext, logError } from "./_lib/observability.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "auth-config");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }
  try {
    const pool = getPool();
    const { rows } = await pool.query("SELECT api_v1, api_v2, cms FROM admin_auth_config WHERE id = 1");
    const config = rows[0] || { api_v1: true, api_v2: true, cms: true };
    return res.status(200).json({ config, request_id: ctx.requestId });
  } catch (e: unknown) {
    logError(ctx, "auth_config_failed", e);
    return res.status(500).json({ error: "Ошибка загрузки конфигурации авторизации", request_id: ctx.requestId });
  }
}

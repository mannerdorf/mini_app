import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminTokenFromRequest, getAdminTokenPayload } from "../lib/adminAuth.js";
import { getPool } from "./_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = getAdminTokenFromRequest(req);
  const payload = getAdminTokenPayload(token);
  if (!(payload as any)?.admin) {
    return res.status(401).json({ error: "Требуется авторизация админа" });
  }

  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT
         id,
         login,
         customer_inn AS "customerInn",
         contract,
         period_from AS "periodFrom",
         period_to AS "periodTo",
         status,
         created_at AS "createdAt",
         updated_at AS "updatedAt",
         processed_at AS "processedAt",
         processed_by AS "processedBy"
       FROM sverki_requests
       ORDER BY created_at DESC, id DESC
       LIMIT 500`
    );
    return res.json({ requests: rows });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Ошибка загрузки заявок актов сверок" });
  }
}

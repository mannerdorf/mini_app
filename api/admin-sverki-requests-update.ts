import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminTokenFromRequest, getAdminTokenPayload } from "../lib/adminAuth.js";
import { getPool } from "./_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST" && req.method !== "DELETE") {
    res.setHeader("Allow", "POST, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = getAdminTokenFromRequest(req);
  const payload = getAdminTokenPayload(token);
  if (!(payload as any)?.admin) {
    return res.status(401).json({ error: "Требуется авторизация админа" });
  }

  const id = Number((req.body as any)?.id ?? (req.query as any)?.id);
  if (req.method === "DELETE") {
    if ((payload as any)?.superAdmin !== true) {
      return res.status(403).json({ error: "Удаление доступно только суперадминистратору" });
    }
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "Некорректный id" });
    try {
      const pool = getPool();
      const result = await pool.query("DELETE FROM sverki_requests WHERE id = $1", [id]);
      if ((result.rowCount || 0) <= 0) return res.status(404).json({ error: "Заявка не найдена" });
      return res.json({ ok: true, deleted: true });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Ошибка удаления заявки" });
    }
  }

  const status = String((req.body as any)?.status || "").trim();
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "Некорректный id" });
  if (status !== "edo_sent") return res.status(400).json({ error: "Поддерживается только статус edo_sent" });

  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `UPDATE sverki_requests
       SET status = 'edo_sent',
           updated_at = now(),
           processed_at = now(),
           processed_by = $2
       WHERE id = $1
       RETURNING
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
         processed_by AS "processedBy"`,
      [id, String((payload as any)?.login || "admin")]
    );
    if (!rows[0]) return res.status(404).json({ error: "Заявка не найдена" });
    return res.json({ ok: true, request: rows[0] });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Ошибка обновления заявки" });
  }
}

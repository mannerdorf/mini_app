/**
 * GET — скачивание/просмотр вложения заявки на расходы.
 * Для суперадмина (Bearer token).
 * ?requestUid=...&attachmentId=...
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest, getAdminTokenPayload } from "../lib/adminAuth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = getAdminTokenFromRequest(req);
  if (!verifyAdminToken(token) || !token) {
    return res.status(401).json({ error: "Требуется авторизация админа" });
  }
  if (!getAdminTokenPayload(token)?.superAdmin) {
    return res.status(403).json({ error: "Доступ только для супер-администратора" });
  }

  const requestUid = String(req.query?.requestUid ?? "").trim();
  const attachmentId = Number(req.query?.attachmentId);
  if (!requestUid || !Number.isFinite(attachmentId)) {
    return res.status(400).json({ error: "Укажите requestUid и attachmentId" });
  }

  try {
    const pool = getPool();
    const { rows } = await pool.query<{ file_data: Buffer; file_name: string; mime_type: string | null }>(
      `SELECT a.file_data, a.file_name, a.mime_type
       FROM expense_request_attachments a
       JOIN expense_requests er ON er.id = a.request_id AND er.uid = $1
       WHERE a.id = $2`,
      [requestUid, attachmentId]
    );
    const row = rows[0];
    if (!row || !row.file_data) {
      return res.status(404).json({ error: "Вложение не найдено" });
    }
    const mime = row.mime_type?.trim() || "application/octet-stream";
    const fileName = row.file_name?.trim() || "attachment";
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(fileName)}"`);
    return res.send(row.file_data);
  } catch (e) {
    console.error("admin-expense-attachment:", e);
    return res.status(500).json({ error: "Ошибка загрузки вложения" });
  }
}

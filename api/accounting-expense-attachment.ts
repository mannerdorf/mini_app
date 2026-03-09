/**
 * GET — скачивание/просмотр вложения заявки на расходы.
 * Для пользователей с доступом «Бухгалтерия».
 * ?requestUid=...&attachmentId=...
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyRegisteredUser } from "../lib/verifyRegisteredUser.js";
import { initRequestContext, logError } from "./_lib/observability.js";

function pickCredentials(req: VercelRequest): { login: string; password: string } {
  const login = String(req.headers["x-login"] ?? req.query?.login ?? "").trim();
  const password = String(req.headers["x-password"] ?? req.query?.password ?? "").trim();
  if (login && password) return { login, password };
  return { login: "", password: "" };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "accounting-expense-attachment");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const { login, password } = pickCredentials(req);
  if (!login || !password) {
    return res.status(400).json({ error: "login и password обязательны (x-login, x-password)", request_id: ctx.requestId });
  }

  const pool = getPool();
  const verified = await verifyRegisteredUser(pool, login, password);
  if (!verified) {
    return res.status(401).json({ error: "Неверный логин или пароль", request_id: ctx.requestId });
  }

  const { rows: userRows } = await pool.query<{ permissions: Record<string, boolean> }>(
    "SELECT permissions FROM registered_users WHERE LOWER(TRIM(login)) = $1 AND active = true",
    [login.trim().toLowerCase()]
  );
  const permissions = userRows[0]?.permissions;
  const hasAccounting = permissions && typeof permissions === "object" && permissions.accounting === true;
  if (!hasAccounting) {
    return res.status(403).json({ error: "Нет доступа к разделу Бухгалтерия", request_id: ctx.requestId });
  }

  const requestUid = String(req.query?.requestUid ?? "").trim();
  const attachmentId = Number(req.query?.attachmentId);
  if (!requestUid || !Number.isFinite(attachmentId)) {
    return res.status(400).json({ error: "Укажите requestUid и attachmentId", request_id: ctx.requestId });
  }

  try {
    const { rows } = await pool.query<{ file_data: Buffer; file_name: string; mime_type: string | null }>(
      `SELECT a.file_data, a.file_name, a.mime_type
       FROM expense_request_attachments a
       JOIN expense_requests er ON er.id = a.request_id AND er.uid = $1
       WHERE a.id = $2`,
      [requestUid, attachmentId]
    );
    const row = rows[0];
    if (!row || !row.file_data) {
      return res.status(404).json({ error: "Вложение не найдено", request_id: ctx.requestId });
    }
    const mime = row.mime_type?.trim() || "application/octet-stream";
    const fileName = row.file_name?.trim() || "attachment";
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(fileName)}"`);
    return res.send(row.file_data);
  } catch (e) {
    logError(ctx, "accounting_expense_attachment_failed", e);
    return res.status(500).json({ error: "Ошибка загрузки вложения", request_id: ctx.requestId });
  }
}

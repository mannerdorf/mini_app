/**
 * API заявок на расходы для админки.
 * GET — список всех заявок из БД (суперадмин).
 * PATCH — обновление статуса заявки.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest, getAdminTokenPayload } from "../lib/adminAuth.js";

type DbRow = {
  id: number;
  uid: string;
  login: string;
  department: string;
  doc_number: string;
  doc_date: string | null;
  period: string;
  category_id: string;
  amount: number;
  vat_rate: string;
  employee_name: string;
  comment: string;
  vehicle_text: string | null;
  status: string;
  rejection_reason: string | null;
  created_at: string;
};

const STATUSES = new Set(["draft", "pending_approval", "sent", "approved", "rejected", "paid"]);

function toFrontendFormat(r: DbRow, login: string) {
  return {
    id: r.uid,
    createdAt: r.created_at,
    login,
    department: r.department,
    docNumber: r.doc_number,
    docDate: r.doc_date ? String(r.doc_date).slice(0, 10) : "",
    period: r.period,
    categoryId: r.category_id,
    categoryName: r.category_id,
    amount: Number(r.amount),
    vatRate: r.vat_rate || "",
    employeeName: r.employee_name || "",
    comment: r.comment || "",
    vehicleOrEmployee: r.vehicle_text || "",
    attachmentNames: [] as string[],
    status: r.status,
    rejectionReason: r.rejection_reason,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = getAdminTokenFromRequest(req);
  if (!verifyAdminToken(token)) {
    return res.status(401).json({ error: "Требуется авторизация админа" });
  }
  if (!getAdminTokenPayload(token)?.superAdmin) {
    return res.status(403).json({ error: "Доступ только для супер-администратора" });
  }

  const pool = getPool();

  if (req.method === "GET") {
    try {
      const { rows } = await pool.query<DbRow>(
        `SELECT id, uid, login, department, doc_number, doc_date, period, category_id, amount, vat_rate, employee_name, comment, vehicle_text, status, rejection_reason, created_at
         FROM expense_requests
         ORDER BY created_at DESC`
      );
      const items = rows.map((r) => toFrontendFormat(r, r.login));
      const catRes = await pool.query<{ id: string; name: string }>("SELECT id, name FROM expense_categories");
      const catMap = Object.fromEntries(catRes.rows.map((c) => [c.id, c.name]));
      for (const it of items) {
        (it as any).categoryName = catMap[it.categoryId] || it.categoryId;
      }
      return res.json({ items });
    } catch (e) {
      console.error("admin-expense-requests GET:", e);
      return res.status(500).json({ error: "Ошибка загрузки заявок" });
    }
  }

  if (req.method === "DELETE") {
    const uid = String(req.query?.uid ?? req.body?.uid ?? "").trim();
    if (!uid) return res.status(400).json({ error: "Укажите uid" });
    try {
      const { rowCount } = await pool.query("DELETE FROM expense_requests WHERE uid = $1", [uid]);
      if (rowCount === 0) return res.status(404).json({ error: "Заявка не найдена" });
      return res.json({ ok: true });
    } catch (e) {
      console.error("admin-expense-requests DELETE:", e);
      return res.status(500).json({ error: "Ошибка удаления" });
    }
  }

  if (req.method === "PATCH") {
    const uid = String(req.query?.uid ?? req.body?.uid ?? "").trim();
    const newStatus = String(req.body?.status ?? req.query?.status ?? "").trim();
    const rejectionReason = typeof req.body?.rejection_reason === "string" ? req.body.rejection_reason.trim() : null;
    if (!uid || !STATUSES.has(newStatus)) {
      return res.status(400).json({ error: "Укажите uid и корректный status" });
    }
    try {
      const params = newStatus === "approved"
        ? [newStatus, rejectionReason, getAdminTokenPayload(token)?.login ?? "admin", uid]
        : [newStatus, rejectionReason, uid];
      const { rowCount } = await pool.query(
        newStatus === "approved"
          ? `UPDATE expense_requests SET status = $1, rejection_reason = $2, approved_by = $3, approved_at = now(), updated_at = now() WHERE uid = $4`
          : `UPDATE expense_requests SET status = $1, rejection_reason = $2, updated_at = now() WHERE uid = $3`,
        params
      );
      if (rowCount === 0) {
        return res.status(404).json({ error: "Заявка не найдена" });
      }
      return res.json({ ok: true });
    } catch (e) {
      console.error("admin-expense-requests PATCH:", e);
      return res.status(500).json({ error: "Ошибка обновления статуса" });
    }
  }

  res.setHeader("Allow", "GET, PATCH, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}

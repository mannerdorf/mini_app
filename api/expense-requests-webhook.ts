/**
 * Вебхук для приёма заявок на расходы.
 * Вызывается при создании и отправке на согласование.
 * Сохраняет/обновляет заявки в БД expense_requests.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";

const STATUSES = new Set(["draft", "pending_approval", "sent", "approved", "rejected", "paid"]);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  let body: unknown = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }
  }
  const b = body as {
    id?: string;
    createdAt?: string;
    login?: string;
    department?: string;
    docNumber?: string;
    docDate?: string;
    period?: string;
    categoryId?: string;
    categoryName?: string;
    amount?: number;
    vatRate?: string;
    employeeName?: string;
    comment?: string;
    vehicleOrEmployee?: string;
    supplierName?: string;
    supplierInn?: string;
    status?: string;
    attachmentNames?: string[];
  };
  const uid = String(b?.id ?? "").trim();
  const login = String(b?.login ?? "").trim();
  if (!uid || !login) {
    return res.status(400).json({ error: "id и login обязательны" });
  }
  const department = String(b?.department ?? "").trim() || "—";
  const docNumber = String(b?.docNumber ?? "").trim();
  const docDate = b?.docDate ? String(b.docDate).slice(0, 10) : null;
  const period = String(b?.period ?? "").trim() || new Date().toISOString().slice(0, 7);
  const categoryId = String(b?.categoryId ?? "other").trim() || "other";
  const amount = Number(b?.amount);
  const vatRate = String(b?.vatRate ?? "").trim();
  const employeeName = String(b?.employeeName ?? "").trim();
  const comment = String(b?.comment ?? "").trim();
  const vehicleText = String(b?.vehicleOrEmployee ?? "").trim() || null;
  const supplierName = String(b?.supplierName ?? "").trim() || null;
  const supplierInn = String(b?.supplierInn ?? "").trim() || null;
  const status = STATUSES.has(String(b?.status ?? "")) ? String(b.status) : "draft";

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: "Некорректная сумма" });
  }

  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO expense_requests (uid, login, department, doc_number, doc_date, period, category_id, amount, vat_rate, employee_name, comment, vehicle_text, supplier_name, supplier_inn, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::timestamptz, now())
       ON CONFLICT (uid) DO UPDATE SET
         login = EXCLUDED.login,
         department = EXCLUDED.department,
         doc_number = EXCLUDED.doc_number,
         doc_date = EXCLUDED.doc_date,
         period = EXCLUDED.period,
         category_id = EXCLUDED.category_id,
         amount = EXCLUDED.amount,
         vat_rate = EXCLUDED.vat_rate,
         employee_name = EXCLUDED.employee_name,
         comment = EXCLUDED.comment,
         vehicle_text = EXCLUDED.vehicle_text,
         supplier_name = EXCLUDED.supplier_name,
         supplier_inn = EXCLUDED.supplier_inn,
         status = EXCLUDED.status,
         updated_at = now()`,
      [
        uid,
        login,
        department,
        docNumber,
        docDate,
        period,
        categoryId,
        amount,
        vatRate,
        employeeName,
        comment,
        vehicleText,
        supplierName,
        supplierInn,
        status,
        b?.createdAt ?? new Date().toISOString(),
      ]
    );
    return res.json({ ok: true });
  } catch (e) {
    console.error("expense-requests-webhook:", e);
    return res.status(500).json({ error: "Ошибка сохранения заявки" });
  }
}

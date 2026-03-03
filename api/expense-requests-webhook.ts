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
    const columnsRes = await pool.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'expense_requests'`
    );
    const cols = new Set(columnsRes.rows.map((r) => String(r.column_name || "").trim()));
    const has = (name: string) => cols.has(name);

    if (!has("uid")) {
      return res.status(500).json({ error: "В таблице expense_requests отсутствует колонка uid. Выполните миграции." });
    }

    const valuesByColumn: Record<string, unknown> = {
      uid,
      login,
      department,
      doc_number: docNumber,
      doc_date: docDate,
      period,
      category_id: categoryId,
      amount,
      vat_rate: vatRate,
      employee_name: employeeName,
      comment,
      vehicle_text: vehicleText,
      supplier_name: supplierName,
      supplier_inn: supplierInn,
      status,
      created_at: b?.createdAt ?? new Date().toISOString(),
    };

    const insertColumns = Object.keys(valuesByColumn).filter((c) => has(c));
    const insertValues = insertColumns.map((c) => valuesByColumn[c]);
    const placeholders = insertColumns.map((_, i) => `$${i + 1}`);
    const updateColumns = insertColumns.filter((c) => c !== "uid" && c !== "created_at");
    const updateSet = [
      ...updateColumns.map((c) => `${c} = EXCLUDED.${c}`),
      ...(has("updated_at") ? ["updated_at = now()"] : []),
    ];

    const createdAtIdx = insertColumns.indexOf("created_at");
    if (createdAtIdx >= 0) {
      placeholders[createdAtIdx] = `$${createdAtIdx + 1}::timestamptz`;
    }

    const upsertSql = updateSet.length > 0
      ? `ON CONFLICT (uid) DO UPDATE SET ${updateSet.join(", ")}`
      : `ON CONFLICT (uid) DO NOTHING`;

    await pool.query(
      `INSERT INTO expense_requests (${insertColumns.join(", ")})
       VALUES (${placeholders.join(", ")})
       ${upsertSql}`,
      insertValues
    );
    return res.json({ ok: true });
  } catch (e) {
    console.error("expense-requests-webhook:", e);
    return res.status(500).json({ error: "Ошибка сохранения заявки" });
  }
}

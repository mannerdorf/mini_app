/**
 * API заявок на расходы для текущего пользователя.
 * GET — список заявок автора из БД (по login).
 * Синхронизация статусов (rejected, approved и т.д.) после решений руководителя.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyRegisteredUser } from "../lib/verifyRegisteredUser.js";

type DbRow = {
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
  supplier_name: string | null;
  supplier_inn: string | null;
  status: string;
  rejection_reason: string | null;
  created_at: string;
};

function pickCredentials(req: VercelRequest): { login: string; password: string } {
  const login = String(req.headers["x-login"] ?? req.query?.login ?? "").trim();
  const password = String(req.headers["x-password"] ?? req.query?.password ?? "").trim();
  return { login, password };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "PATCH" && req.method !== "DELETE") {
    res.setHeader("Allow", "GET, PATCH, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { login, password } = pickCredentials(req);
  if (!login || !password) {
    return res.status(400).json({ error: "login and password required (x-login, x-password)" });
  }

  const pool = getPool();
  const verified = await verifyRegisteredUser(pool, login, password);
  if (!verified) {
    return res.status(401).json({ error: "Неверный логин или пароль" });
  }

  const loginKey = login.trim().toLowerCase();

  if (req.method === "PATCH") {
    let body: unknown = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: "Invalid JSON" });
      }
    }
    const b = body as { uid?: string; employeeName?: string; docDate?: string; status?: string };
    const uid = String(b?.uid ?? "").trim();
    if (!uid) return res.status(400).json({ error: "Укажите uid заявки" });
    try {
      const colsRes = await pool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'expense_requests'`
      );
      const cols = new Set(colsRes.rows.map((r) => String(r.column_name || "").trim()));
      const has = (n: string) => cols.has(n);
      const sets: string[] = [];
      const values: unknown[] = [];
      let i = 0;
      const add = (col: string, val: unknown) => {
        if (has(col) && val !== undefined) {
          i += 1;
          sets.push(`${col} = $${i}`);
          values.push(val);
        }
      };
      const empName = typeof b?.employeeName === "string" ? b.employeeName.trim() : undefined;
      if (empName !== undefined) add("employee_name", empName);
      const docDateRaw = typeof b?.docDate === "string" ? b.docDate.slice(0, 10) : undefined;
      if (docDateRaw !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(docDateRaw)) add("doc_date", docDateRaw);
      const statusVal = typeof b?.status === "string" ? b.status.trim() : undefined;
      if (statusVal && ["draft", "pending_approval"].includes(statusVal)) add("status", statusVal);
      if (has("updated_at")) sets.push("updated_at = now()");
      if (sets.length === 0) return res.status(400).json({ error: "Нет полей для обновления" });
      values.push(uid, loginKey);
      const { rowCount } = await pool.query<{ login: string }>(
        `UPDATE expense_requests SET ${sets.join(", ")} WHERE uid = $${i + 1} AND LOWER(TRIM(login)) = $${i + 2} RETURNING login`,
        values
      );
      if (rowCount === 0) {
        const exists = await pool.query("SELECT 1 FROM expense_requests WHERE uid = $1", [uid]);
        if (exists.rows.length === 0) return res.status(404).json({ error: "Заявка не найдена" });
        return res.status(403).json({ error: "Нет доступа к этой заявке" });
      }
      return res.json({ ok: true });
    } catch (e) {
      console.error("my-expense-requests PATCH:", e);
      return res.status(500).json({ error: "Ошибка обновления заявки" });
    }
  }

  if (req.method === "DELETE") {
    const uid = String(req.query?.uid ?? (req.body && typeof req.body === "object" && "uid" in req.body ? req.body.uid : "") ?? "").trim();
    if (!uid) return res.status(400).json({ error: "Укажите uid заявки" });
    try {
      const { rowCount } = await pool.query(
        `DELETE FROM expense_requests WHERE uid = $1 AND LOWER(TRIM(login)) = $2`,
        [uid, loginKey]
      );
      if (rowCount === 0) {
        const exists = await pool.query("SELECT 1 FROM expense_requests WHERE uid = $1", [uid]);
        if (exists.rows.length === 0) return res.status(404).json({ error: "Заявка не найдена" });
        return res.status(403).json({ error: "Нет доступа к этой заявке" });
      }
      return res.json({ ok: true });
    } catch (e) {
      console.error("my-expense-requests DELETE:", e);
      return res.status(500).json({ error: "Ошибка удаления заявки" });
    }
  }

  try {
    const columnsRes = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'expense_requests'`
    );
    const cols = new Set(columnsRes.rows.map((r) => String(r.column_name || "").trim()));
    const has = (name: string) => cols.has(name);
    const selectExpr = (name: string, fallback: string) => (has(name) ? name : `${fallback} AS ${name}`);

    const { rows } = await pool.query<DbRow>(
      `SELECT
         ${selectExpr("uid", "id::text")},
         ${selectExpr("login", "''::text")},
         ${selectExpr("department", "''::text")},
         ${selectExpr("doc_number", "''::text")},
         ${selectExpr("doc_date", "NULL::date")},
         ${selectExpr("period", "''::text")},
         ${selectExpr("category_id", "'other'::text")},
         ${selectExpr("amount", "0::numeric")},
         ${selectExpr("vat_rate", "''::text")},
         ${selectExpr("employee_name", "''::text")},
         ${selectExpr("comment", "''::text")},
         ${selectExpr("vehicle_text", "NULL::text")},
         ${selectExpr("supplier_name", "NULL::text")},
         ${selectExpr("supplier_inn", "NULL::text")},
         ${selectExpr("status", "'draft'::text")},
         ${selectExpr("rejection_reason", "NULL::text")},
         ${selectExpr("created_at", "now()")}
       FROM expense_requests
       WHERE LOWER(TRIM(login)) = $1
       ORDER BY created_at DESC`,
      [loginKey]
    );

    const catRes = await pool.query<{ id: string; name: string }>("SELECT id, name FROM expense_categories");
    const catMap = Object.fromEntries(catRes.rows.map((c) => [c.id, c.name]));

    const items = rows.map((r) => ({
      id: r.uid,
      createdAt: r.created_at,
      department: r.department,
      docNumber: r.doc_number,
      docDate: r.doc_date ? String(r.doc_date).slice(0, 10) : "",
      period: r.period,
      categoryId: r.category_id,
      categoryName: catMap[r.category_id] || r.category_id,
      amount: Number(r.amount),
      vatRate: r.vat_rate || "",
      employeeName: r.employee_name || "",
      comment: r.comment || "",
      vehicleOrEmployee: r.vehicle_text || "",
      supplierName: r.supplier_name || undefined,
      supplierInn: r.supplier_inn || undefined,
      status: r.status,
      rejectionReason: r.rejection_reason || undefined,
    }));

    return res.json({ items });
  } catch (e) {
    console.error("my-expense-requests:", e);
    return res.status(500).json({ error: "Ошибка загрузки заявок" });
  }
}

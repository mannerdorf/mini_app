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
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
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
      status: r.status,
      rejectionReason: r.rejection_reason || undefined,
    }));

    return res.json({ items });
  } catch (e) {
    console.error("my-expense-requests:", e);
    return res.status(500).json({ error: "Ошибка загрузки заявок" });
  }
}

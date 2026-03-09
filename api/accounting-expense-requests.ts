/**
 * API согласованных заявок на расходы для пользователей с доступом «Бухгалтерия».
 * GET — список заявок со статусом approved/sent/paid (как в админке).
 * PATCH — обновление статуса (например, на paid).
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyRegisteredUser } from "../lib/verifyRegisteredUser.js";
import { initRequestContext, logError } from "./_lib/observability.js";

type DbRow = {
  uid: string;
  login: string;
  department: string;
  doc_number: string;
  doc_date: string | null;
  period: string;
  category_id: string;
  amount: number;
  employee_name: string;
  comment: string;
  vehicle_text: string | null;
  status: string;
  created_at: string;
};

const STATUSES = new Set(["approved", "sent", "paid"]);

function pickCredentials(req: VercelRequest): { login: string; password: string } {
  const login = String(req.headers["x-login"] ?? req.query?.login ?? "").trim();
  const password = String(req.headers["x-password"] ?? req.query?.password ?? "").trim();
  if (login && password) return { login, password };
  let body: any = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  return {
    login: String(body?.login ?? "").trim(),
    password: String(body?.password ?? "").trim(),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "accounting-expense-requests");
  if (req.method !== "GET" && req.method !== "PATCH") {
    res.setHeader("Allow", "GET, PATCH");
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

  if (req.method === "GET") {
    try {
      const columnsRes = await pool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'expense_requests'`
      );
      const cols = new Set(columnsRes.rows.map((r) => String(r.column_name || "").trim()));
      const has = (name: string) => cols.has(name);
      const selectExpr = (col: string, fallback: string) => (has(col) ? `er.${col}` : `${fallback} AS ${col}`);

      const { rows } = await pool.query<DbRow & { db_id?: number }>(
        `SELECT
           er.id as db_id,
           ${selectExpr("uid", "er.id::text")},
           ${selectExpr("login", "''::text")},
           ${selectExpr("department", "''::text")},
           ${selectExpr("doc_number", "''::text")},
           ${selectExpr("doc_date", "NULL::date")},
           ${selectExpr("period", "''::text")},
           ${selectExpr("category_id", "'other'::text")},
           ${selectExpr("amount", "0::numeric")},
           ${selectExpr("employee_name", "''::text")},
           ${selectExpr("comment", "''::text")},
           ${selectExpr("vehicle_text", "NULL::text")},
           ${selectExpr("status", "'draft'::text")},
           ${selectExpr("created_at", "now()")}
         FROM expense_requests er
         WHERE er.status = ANY($1::text[])
         ORDER BY er.created_at DESC`,
        [["approved", "sent", "paid"]]
      );

      const catRes = await pool.query<{ id: string; name: string }>("SELECT id, name FROM expense_categories");
      const catMap = Object.fromEntries(catRes.rows.map((c) => [c.id, c.name]));

      const requestIds = rows.map((r) => (r as DbRow & { db_id?: number }).db_id).filter((id): id is number => id != null);
      let attachmentsByRequest: Record<number, Array<{ id: number; fileName: string; mimeType: string | null }>> = {};
      if (requestIds.length > 0) {
        const attRes = await pool.query<{ request_id: number; id: number; file_name: string; mime_type: string | null }>(
          `SELECT request_id, id, file_name, mime_type FROM expense_request_attachments WHERE request_id = ANY($1::int[])`,
          [requestIds]
        );
        for (const a of attRes.rows) {
          if (!attachmentsByRequest[a.request_id]) attachmentsByRequest[a.request_id] = [];
          attachmentsByRequest[a.request_id].push({
            id: a.id,
            fileName: a.file_name,
            mimeType: a.mime_type,
          });
        }
      }

      const items = rows.map((r) => {
        const row = r as DbRow & { db_id?: number };
        const dbId = row.db_id;
        const attachments = dbId != null ? (attachmentsByRequest[dbId] || []) : [];
        return {
          id: r.uid,
          createdAt: r.created_at,
          login: r.login,
          department: r.department,
          docNumber: r.doc_number,
          docDate: r.doc_date ? String(r.doc_date).slice(0, 10) : "",
          period: r.period,
          categoryId: r.category_id,
          categoryName: catMap[r.category_id] || r.category_id,
          amount: Number(r.amount),
          employeeName: r.employee_name || "",
          comment: r.comment || "",
          vehicleOrEmployee: r.vehicle_text || "",
          status: r.status,
          attachments,
        };
      });

      return res.json({ items, request_id: ctx.requestId });
    } catch (e) {
      logError(ctx, "accounting_expense_requests_get_failed", e);
      return res.status(500).json({ error: "Ошибка загрузки заявок", request_id: ctx.requestId });
    }
  }

  if (req.method === "PATCH") {
    let body: any = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: "Invalid JSON", request_id: ctx.requestId });
      }
    }
    const uid = String(body?.uid ?? "").trim();
    const newStatus = String(body?.status ?? "").trim();
    if (!uid || !STATUSES.has(newStatus)) {
      return res.status(400).json({ error: "Укажите uid и status (approved, sent, paid)", request_id: ctx.requestId });
    }
    try {
      const { rowCount } = await pool.query(
        `UPDATE expense_requests SET status = $1, updated_at = now() WHERE uid = $2 AND status = ANY($3::text[])`,
        [newStatus, uid, ["approved", "sent", "paid"]]
      );
      if (rowCount === 0) {
        return res.status(404).json({ error: "Заявка не найдена или нельзя изменить статус", request_id: ctx.requestId });
      }
      return res.json({ ok: true, request_id: ctx.requestId });
    } catch (e) {
      logError(ctx, "accounting_expense_requests_patch_failed", e);
      return res.status(500).json({ error: "Ошибка обновления статуса", request_id: ctx.requestId });
    }
  }

  return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
}

/**
 * API заявок на расходы для админки.
 * GET — список всех заявок из БД (суперадмин).
 * PATCH — обновление статуса заявки.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { ensurePnlTransportColumns } from "./_pnl-ensure.js";
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

type RequestForPnlRow = {
  id: number;
  uid: string;
  status: string;
  amount: number;
  department: string;
  doc_number: string;
  doc_date: string | null;
  period: string;
  login: string;
  employee_name: string;
  comment: string;
  category_name: string | null;
  category_cost_type: string | null;
};

const STATUSES = new Set(["draft", "pending_approval", "sent", "approved", "rejected", "paid"]);

function normalizeOperationType(raw?: string | null): "COGS" | "OPEX" | "CAPEX" {
  const v = String(raw ?? "").trim().toUpperCase();
  if (v === "COGS" || v === "CAPEX") return v;
  return "OPEX";
}

function mapDepartmentToPnl(raw?: string | null): { department: string; logisticsStage: string | null } {
  const source = String(raw ?? "").trim();
  const upper = source.toUpperCase();
  const known = new Set(["LOGISTICS_MSK", "LOGISTICS_KGD", "ADMINISTRATION", "DIRECTION", "IT", "SALES", "SERVICE", "GENERAL"]);
  if (known.has(upper)) {
    return { department: upper, logisticsStage: null };
  }
  const s = source.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
  if (s.includes("забор")) return { department: "LOGISTICS_MSK", logisticsStage: "PICKUP" };
  const hasMsk = s.includes("москва") || s.includes("мск");
  const hasKgd = s.includes("калининград") || s.includes("кгд");
  if (s.includes("склад") && hasMsk && !hasKgd) return { department: "LOGISTICS_MSK", logisticsStage: "DEPARTURE_WAREHOUSE" };
  if (s.includes("склад отправления")) return { department: "LOGISTICS_MSK", logisticsStage: "DEPARTURE_WAREHOUSE" };
  if (s.includes("магистрал")) return { department: "LOGISTICS_MSK", logisticsStage: "MAINLINE" };
  if (s.includes("склад") && hasKgd) return { department: "LOGISTICS_KGD", logisticsStage: "ARRIVAL_WAREHOUSE" };
  if (s.includes("склад получения")) return { department: "LOGISTICS_KGD", logisticsStage: "ARRIVAL_WAREHOUSE" };
  if (s.includes("последняя миля") || s.includes("last mile") || (s.includes("миля") && hasKgd)) return { department: "LOGISTICS_KGD", logisticsStage: "LAST_MILE" };
  if (s.includes("администрац") || s.includes("управляющ")) return { department: "ADMINISTRATION", logisticsStage: null };
  if (s.includes("дирекц")) return { department: "DIRECTION", logisticsStage: null };
  if (s.includes("продаж")) return { department: "SALES", logisticsStage: null };
  if (s.includes("сервис")) return { department: "SERVICE", logisticsStage: null };
  if (s === "it" || s.includes(" айти") || s.includes("it ")) return { department: "IT", logisticsStage: null };
  return { department: source || "GENERAL", logisticsStage: null };
}

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
      const columnsRes = await pool.query<{ column_name: string }>(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'expense_requests'`
      );
      const cols = new Set(columnsRes.rows.map((r) => String(r.column_name || "").trim()));
      const has = (name: string) => cols.has(name);
      const selectExpr = (name: string, fallbackExpr: string) => (has(name) ? name : `${fallbackExpr} AS ${name}`);

      const { rows } = await pool.query<DbRow & { id?: number }>(
        `SELECT
           ${selectExpr("id", "0::bigint")},
           ${selectExpr("uid", "('legacy-' || id::text)")},
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
         ORDER BY created_at DESC`
      );
      const catRes = await pool.query<{ id: string; name: string }>("SELECT id, name FROM expense_categories");
      const catMap = Object.fromEntries(catRes.rows.map((c) => [c.id, c.name]));

      const requestIds = rows.map((r) => (r as DbRow & { id?: number }).id).filter((id): id is number => id != null && id > 0);
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
        const row = r as DbRow & { id?: number };
        const base = toFrontendFormat(r, r.login);
        const attachments = row.id != null ? (attachmentsByRequest[row.id] || []) : [];
        return { ...base, categoryName: catMap[base.categoryId] || base.categoryId, attachments };
      });
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
      const colsRes = await pool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'expense_requests'`
      );
      const cols = new Set(colsRes.rows.map((r) => String(r.column_name || "").trim()));
      const hasCol = (n: string) => cols.has(n);
      const empSel = hasCol("employee_name") ? "er.employee_name" : "''::text AS employee_name";

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const { rows } = await client.query<RequestForPnlRow>(
          `SELECT er.id, er.uid, er.status, er.amount, er.department, er.doc_number, er.doc_date, er.period, er.login, ${empSel}, er.comment,
                  ec.name AS category_name, ec.cost_type AS category_cost_type
           FROM expense_requests er
           LEFT JOIN expense_categories ec ON ec.id = er.category_id
           WHERE er.uid = $1
           LIMIT 1`,
          [uid]
        );
        const requestRow = rows[0];
        if (!requestRow) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "Заявка не найдена" });
        }

        const previousStatus = requestRow.status;
        const params = newStatus === "approved"
          ? [newStatus, rejectionReason, getAdminTokenPayload(token)?.login ?? "admin", uid]
          : [newStatus, rejectionReason, uid];
        await client.query(
          newStatus === "approved"
            ? `UPDATE expense_requests SET status = $1, rejection_reason = $2, approved_by = $3, approved_at = now(), updated_at = now() WHERE uid = $4`
            : `UPDATE expense_requests SET status = $1, rejection_reason = $2, updated_at = now() WHERE uid = $3`,
          params
        );

        // При переходе в "approved" ("Согласована") автоматически отражаем расход в PNL.
        if (newStatus === "approved" && previousStatus !== "approved") {
          await ensurePnlTransportColumns(pool);
          const operationType = normalizeOperationType(requestRow.category_cost_type);
          const deptMap = mapDepartmentToPnl(requestRow.department);
          const opDate = requestRow.doc_date
            ? new Date(String(requestRow.doc_date))
            : new Date();
          const amountAbs = Math.abs(Number(requestRow.amount) || 0);
          if (amountAbs > 0) {
            const logisticsStage = operationType === "COGS" ? deptMap.logisticsStage : null;
            await client.query(
              `INSERT INTO pnl_operations (date, counterparty, purpose, amount, operation_type, department, logistics_stage, direction, transport_type)
               VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NULL)`,
              [
                opDate,
                requestRow.employee_name || requestRow.login || "expense_request",
                `Согласование заявки ${requestRow.doc_number || requestRow.uid}${requestRow.category_name ? ` (${requestRow.category_name})` : ""}`,
                -amountAbs,
                operationType,
                deptMap.department || "GENERAL",
                logisticsStage,
              ]
            );
          }
        }

        await client.query("COMMIT");
      } catch (txErr) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackErr) {
          console.error("admin-expense-requests PATCH rollback failed:", rollbackErr);
        }
        throw txErr;
      } finally {
        client.release();
      }
      return res.json({ ok: true });
    } catch (e) {
      const err = e as Error & { code?: string };
      console.error("admin-expense-requests PATCH:", err);
      const msg = err?.message || String(e);
      return res.status(500).json({
        error: "Ошибка обновления статуса",
        details: msg.length > 200 ? msg.slice(0, 200) + "..." : msg,
      });
    }
  }

  if (req.method === "PUT") {
    let body: unknown = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: "Invalid JSON" });
      }
    }
    const b = body as Record<string, unknown>;
    const uid = String(b?.uid ?? "").trim();
    if (!uid) return res.status(400).json({ error: "Укажите uid" });
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
      add("doc_number", String(b?.docNumber ?? "").trim());
      add("doc_date", typeof b?.docDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.docDate) ? b.docDate : null);
      add("period", String(b?.period ?? "").trim());
      add("department", String(b?.department ?? "").trim());
      add("category_id", String(b?.categoryId ?? "other").trim());
      const amount = Number(b?.amount);
      if (Number.isFinite(amount)) add("amount", amount);
      add("vat_rate", String(b?.vatRate ?? "").trim());
      add("comment", String(b?.comment ?? "").trim());
      const vText = String(b?.vehicleOrEmployee ?? "").trim();
      add("vehicle_text", vText || null);
      add("employee_name", String(b?.employeeName ?? "").trim());
      if (has("updated_at")) {
        i += 1;
        sets.push("updated_at = now()");
      }
      if (sets.length === 0) return res.status(400).json({ error: "Нет полей для обновления" });
      values.push(uid);
      const { rowCount } = await pool.query(
        `UPDATE expense_requests SET ${sets.join(", ")} WHERE uid = $${i + 1}`,
        values
      );
      if (rowCount === 0) return res.status(404).json({ error: "Заявка не найдена" });
      return res.json({ ok: true });
    } catch (e) {
      console.error("admin-expense-requests PUT:", e);
      return res.status(500).json({ error: "Ошибка обновления заявки" });
    }
  }

  res.setHeader("Allow", "GET, PATCH, PUT, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}

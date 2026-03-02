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
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const { rows } = await client.query<RequestForPnlRow>(
          `SELECT er.id, er.uid, er.status, er.amount, er.department, er.doc_number, er.doc_date, er.period, er.login, er.employee_name, er.comment,
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
        await client.query("ROLLBACK");
        throw txErr;
      } finally {
        client.release();
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

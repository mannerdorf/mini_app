import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { initRequestContext, logError } from "./_lib/observability.js";

function mapDepartmentToPnl(raw?: string | null): { department: string | null; logisticsStage: string | null } {
  const source = String(raw ?? "").trim();
  if (!source) return { department: null, logisticsStage: null };
  const upper = source.toUpperCase();
  const known = new Set(["LOGISTICS_MSK", "LOGISTICS_KGD", "ADMINISTRATION", "DIRECTION", "IT", "SALES", "SERVICE", "GENERAL"]);
  if (known.has(upper)) return { department: upper, logisticsStage: null };
  const s = source.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
  if (s.includes("забор")) return { department: "LOGISTICS_MSK", logisticsStage: "PICKUP" };
  const hasMsk = s.includes("москва") || s.includes("мск");
  const hasKgd = s.includes("калининград") || s.includes("кгд");
  if (s.includes("склад") && hasMsk && !hasKgd) return { department: "LOGISTICS_MSK", logisticsStage: "DEPARTURE_WAREHOUSE" };
  if (s.includes("склад отправления")) return { department: "LOGISTICS_MSK", logisticsStage: "DEPARTURE_WAREHOUSE" };
  if (s.includes("магистрал")) return { department: "LOGISTICS_MSK", logisticsStage: "MAINLINE" };
  if (s.includes("склад") && hasKgd) return { department: "LOGISTICS_KGD", logisticsStage: "ARRIVAL_WAREHOUSE" };
  if (s.includes("склад получения")) return { department: "LOGISTICS_KGD", logisticsStage: "ARRIVAL_WAREHOUSE" };
  if (s.includes("последняя миля") || s.includes("last mile") || (s.includes("миля") && hasKgd)) {
    return { department: "LOGISTICS_KGD", logisticsStage: "LAST_MILE" };
  }
  if (s.includes("администрац") || s.includes("управляющ")) return { department: "ADMINISTRATION", logisticsStage: null };
  if (s.includes("дирекц")) return { department: "DIRECTION", logisticsStage: null };
  if (s.includes("продаж")) return { department: "SALES", logisticsStage: null };
  if (s.includes("сервис")) return { department: "SERVICE", logisticsStage: null };
  if (s === "it" || s.includes(" айти") || s.includes("it ")) return { department: "IT", logisticsStage: null };
  return { department: null, logisticsStage: null };
}

/**
 * Справочник статей расходов для заявок на расходы.
 * Если передано подразделение — отдаём статьи только для него из pnl_expense_categories.
 * Иначе возвращаем общий активный список статей (fallback).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "expense-request-categories");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }
  try {
    const pool = getPool();
    const requestedDepartment = String(req.query.department ?? "").trim();
    const mapped = mapDepartmentToPnl(requestedDepartment);
    const useDepartmentFilter = Boolean(mapped.department);
    let rows: Array<{ id: string; name: string; costType: string | null; sortOrder: number | null }> = [];

    if (useDepartmentFilter) {
      if (mapped.logisticsStage) {
        const scoped = await pool.query<{ id: string; name: string; costType: string | null; sortOrder: number | null }>(
          `SELECT DISTINCT ON (ec.id) ec.id, ec.name, ec.cost_type AS "costType", ec.sort_order AS "sortOrder"
           FROM pnl_expense_categories p
           JOIN expense_categories ec ON ec.id = p.expense_category_id
           WHERE ec.active = true
             AND p.department = $1
             AND p.logistics_stage = $2
           ORDER BY ec.id, ec.sort_order, ec.name`,
          [mapped.department, mapped.logisticsStage]
        );
        rows = scoped.rows;
      } else {
        const scoped = await pool.query<{ id: string; name: string; costType: string | null; sortOrder: number | null }>(
          `SELECT DISTINCT ON (ec.id) ec.id, ec.name, ec.cost_type AS "costType", ec.sort_order AS "sortOrder"
           FROM pnl_expense_categories p
           JOIN expense_categories ec ON ec.id = p.expense_category_id
           WHERE ec.active = true
             AND p.department = $1
             AND p.logistics_stage IS NULL
           ORDER BY ec.id, ec.sort_order, ec.name`,
          [mapped.department]
        );
        rows = scoped.rows;
      }
    }

    if (!useDepartmentFilter) {
      const common = await pool.query<{ id: string; name: string; costType: string | null; sortOrder: number | null }>(
        `SELECT ec.id, ec.name, ec.cost_type AS "costType", ec.sort_order AS "sortOrder"
         FROM expense_categories ec
         WHERE ec.active = true
         ORDER BY ec.sort_order, ec.name`
      );
      rows = common.rows;
    }

    return res.json(rows);
  } catch (e) {
    logError(ctx, "expense_request_categories_failed", e);
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ error: msg || "Ошибка загрузки статей расходов", request_id: ctx.requestId });
  }
}

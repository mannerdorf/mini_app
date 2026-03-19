import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import { resolveWbAccess } from "../_wb.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "wb_summary_list");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  try {
    const pool = getPool();
    const access = await resolveWbAccess(req, pool, "read");
    if (!access) return res.status(401).json({ error: "Нет доступа", request_id: ctx.requestId });

    const limitRaw = Number(req.query.limit ?? 50);
    const pageRaw = Number(req.query.page ?? 1);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.trunc(limitRaw))) : 50;
    const page = Number.isFinite(pageRaw) ? Math.max(1, Math.trunc(pageRaw)) : 1;
    const offset = (page - 1) * limit;

    const boxId = String(req.query.boxId ?? "").trim();
    const claimNumber = String(req.query.claimNumber ?? "").trim();
    const declaredRaw = String(req.query.declared ?? "").trim().toLowerCase();
    const dateFrom = String(req.query.dateFrom ?? "").trim();
    const dateTo = String(req.query.dateTo ?? "").trim();
    const article = String(req.query.article ?? "").trim();
    const brand = String(req.query.brand ?? "").trim();
    const q = String(req.query.q ?? "").trim();

    const where: string[] = [];
    const params: unknown[] = [];
    if (boxId) {
      params.push(boxId);
      where.push(`s.box_id = $${params.length}`);
    }
    if (claimNumber) {
      params.push(`%${claimNumber}%`);
      where.push(`coalesce(s.claim_number, '') ilike $${params.length}`);
    }
    if (declaredRaw === "true" || declaredRaw === "false") {
      params.push(declaredRaw === "true");
      where.push(`s.declared = $${params.length}`);
    }
    if (dateFrom) {
      params.push(dateFrom);
      where.push(`s.source_document_date >= $${params.length}::date`);
    }
    if (dateTo) {
      params.push(dateTo);
      where.push(`s.source_document_date <= $${params.length}::date`);
    }
    if (article) {
      params.push(article.toLowerCase());
      where.push(`lower(coalesce(i.article, '')) like '%' || $${params.length} || '%'`);
    }
    if (brand) {
      params.push(brand.toLowerCase());
      where.push(`lower(coalesce(i.brand, '')) like '%' || $${params.length} || '%'`);
    }
    if (q) {
      params.push(`%${q}%`);
      where.push(`(
        s.box_id ilike $${params.length}
        or coalesce(s.claim_number, '') ilike $${params.length}
        or coalesce(s.source_document_number, '') ilike $${params.length}
        or coalesce(s.description, '') ilike $${params.length}
      )`);
    }

    const whereSql = where.length ? `where ${where.join(" and ")}` : "";
    const countRes = await pool.query<{ total: number }>(
      `select count(*)::int as total
       from wb_summary s
       left join wb_inbound_items i on i.id = s.inbound_item_id
       ${whereSql}`,
      params,
    );
    const total = countRes.rows[0]?.total ?? 0;

    const dataParams = [...params, limit, offset];
    const rowsRes = await pool.query(
      `select
         s.box_id as "boxId",
         s.claim_number as "claimNumber",
         s.declared as "declared",
         s.source_document_number as "documentNumber",
         s.source_document_date as "documentDate",
         s.source_row_number as "rowNumber",
         s.description as "description",
         s.cost_rub as "costRub",
         i.inventory_number as "inventoryNumber",
         i.article as "article",
         i.brand as "brand",
         i.shk as "shk",
         s.updated_at as "updatedAt"
       from wb_summary s
       left join wb_inbound_items i on i.id = s.inbound_item_id
       ${whereSql}
       order by s.updated_at desc, s.box_id
       limit $${dataParams.length - 1}
       offset $${dataParams.length}`,
      dataParams,
    );

    return res.status(200).json({
      page,
      limit,
      total,
      items: rowsRes.rows,
      request_id: ctx.requestId,
    });
  } catch (error) {
    logError(ctx, "wb_summary_list_failed", error);
    return res.status(500).json({ error: "Ошибка загрузки сводной таблицы", request_id: ctx.requestId });
  }
}


import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import { pgIlikeContainsPattern, pgTableExists, resolveWbAccess } from "../_wb.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "wb_returned_list");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  try {
    const pool = getPool();
    const access = await resolveWbAccess(req, pool, "read");
    if (!access) return res.status(401).json({ error: "Нет доступа", request_id: ctx.requestId });

    if (!(await pgTableExists(pool, "wb_returned_items"))) {
      return res.status(200).json({
        page: 1,
        limit: Math.min(500, Math.max(1, Number(req.query.limit ?? 50) || 50)),
        total: 0,
        items: [],
        request_id: ctx.requestId,
      });
    }

    const limitRaw = Number(req.query.limit ?? 50);
    const pageRaw = Number(req.query.page ?? 1);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.trunc(limitRaw))) : 50;
    const page = Number.isFinite(pageRaw) ? Math.max(1, Math.trunc(pageRaw)) : 1;
    const offset = (page - 1) * limit;

    const dateFrom = String(req.query.dateFrom ?? "").trim();
    const dateTo = String(req.query.dateTo ?? "").trim();
    const boxId = String(req.query.boxId ?? "").trim();
    const cargoNumber = String(req.query.cargoNumber ?? "").trim();
    const q = String(req.query.q ?? "").trim();
    const hasShkRaw = String(req.query.hasShk ?? "").trim().toLowerCase();

    const where: string[] = [];
    const params: unknown[] = [];
    if (dateFrom) {
      params.push(dateFrom);
      where.push(`coalesce(r.document_date, r.created_at::date) >= $${params.length}::date`);
    }
    if (dateTo) {
      params.push(dateTo);
      where.push(`coalesce(r.document_date, r.created_at::date) <= $${params.length}::date`);
    }
    if (boxId) {
      params.push(pgIlikeContainsPattern(boxId));
      where.push(`r.box_id ilike $${params.length} escape '\\'`);
    }
    if (cargoNumber) {
      params.push(cargoNumber);
      where.push(`coalesce(r.cargo_number, '') ilike $${params.length}`);
    }
    if (hasShkRaw === "true" || hasShkRaw === "false") {
      params.push(hasShkRaw === "true");
      where.push(`r.has_shk = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      where.push(`(
        r.box_id ilike $${params.length}
        or coalesce(r.cargo_number, '') ilike $${params.length}
        or coalesce(r.description, '') ilike $${params.length}
        or coalesce(r.document_number, '') ilike $${params.length}
      )`);
    }

    const whereSql = where.length ? `where ${where.join(" and ")}` : "";
    const totalRes = await pool.query<{ total: number }>(
      `select count(*)::int as total from wb_returned_items r ${whereSql}`,
      params,
    );
    const total = totalRes.rows[0]?.total ?? 0;

    const dataParams = [...params, limit, offset];
    const rowsRes = await pool.query(
      `select
         r.id,
         r.source,
         r.box_id as "boxId",
         r.cargo_number as "cargoNumber",
         r.description,
         r.has_shk as "hasShk",
         r.document_number as "documentNumber",
         r.document_date as "documentDate",
         r.amount_rub as "amountRub",
         r.source_row_number as "rowNumber",
         r.created_at as "createdAt"
       from wb_returned_items r
       ${whereSql}
       order by r.created_at desc
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
    logError(ctx, "wb_returned_list_failed", error);
    return res.status(500).json({ error: "Ошибка загрузки возвращенного груза", request_id: ctx.requestId });
  }
}


import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import { resolveWbAccess } from "../_wb.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "wb_claims_list");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  try {
    const pool = getPool();
    const access = await resolveWbAccess(req, pool, "read");
    if (!access) return res.status(401).json({ error: "Нет доступа", request_id: ctx.requestId });

    const includeHistory = String(req.query.history ?? "false").trim().toLowerCase() === "true";
    const requestedRevisionId = Number(req.query.revisionId ?? 0);
    const limitRaw = Number(req.query.limit ?? 50);
    const pageRaw = Number(req.query.page ?? 1);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.trunc(limitRaw))) : 50;
    const page = Number.isFinite(pageRaw) ? Math.max(1, Math.trunc(pageRaw)) : 1;
    const offset = (page - 1) * limit;
    const dateFrom = String(req.query.dateFrom ?? "").trim();
    const dateTo = String(req.query.dateTo ?? "").trim();
    const boxId = String(req.query.boxId ?? "").trim();
    const article = String(req.query.article ?? "").trim();
    const brand = String(req.query.brand ?? "").trim();
    const q = String(req.query.q ?? "").trim();

    const revisionsRes = await pool.query<{
      id: number;
      revision_number: number;
      source_filename: string | null;
      uploaded_by_login: string | null;
      uploaded_at: string;
      is_active: boolean;
    }>(
      `select id, revision_number, source_filename, uploaded_by_login, uploaded_at, is_active
       from wb_claims_revisions
       order by revision_number desc`,
    );
    const revisions = revisionsRes.rows;
    const activeRevisionId =
      Number.isFinite(requestedRevisionId) && requestedRevisionId > 0
        ? requestedRevisionId
        : (revisions.find((r) => r.is_active)?.id ?? null);
    if (!activeRevisionId) {
      return res.status(200).json({ page: 1, limit, total: 0, revisionId: null, revisions: includeHistory ? revisions : [], items: [], request_id: ctx.requestId });
    }

    const where: string[] = ["c.revision_id = $1"];
    const params: unknown[] = [activeRevisionId];
    if (dateFrom) {
      params.push(dateFrom);
      where.push(`c.doc_date >= $${params.length}::date`);
    }
    if (dateTo) {
      params.push(dateTo);
      where.push(`c.doc_date <= $${params.length}::date`);
    }
    if (boxId) {
      params.push(boxId);
      where.push(`coalesce(c.box_id, '') = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      where.push(`(
        coalesce(c.claim_number, '') ilike $${params.length}
        or coalesce(c.box_id, '') ilike $${params.length}
        or coalesce(c.doc_number, '') ilike $${params.length}
        or coalesce(c.description, '') ilike $${params.length}
        or c.all_columns::text ilike $${params.length}
      )`);
    }
    if (article) {
      params.push(article.toLowerCase());
      where.push(`lower(coalesce(c.all_columns->>'Артикул', c.all_columns->>'артикул', '')) like '%' || $${params.length} || '%'`);
    }
    if (brand) {
      params.push(brand.toLowerCase());
      where.push(`lower(coalesce(c.all_columns->>'Бренд', c.all_columns->>'бренд', '')) like '%' || $${params.length} || '%'`);
    }

    const whereSql = `where ${where.join(" and ")}`;
    const countRes = await pool.query<{ total: number }>(
      `select count(*)::int as total from wb_claims_items c ${whereSql}`,
      params,
    );
    const total = countRes.rows[0]?.total ?? 0;
    const dataParams = [...params, limit, offset];
    const rowsRes = await pool.query(
      `select
         c.id,
         c.revision_id as "revisionId",
         c.row_number as "rowNumber",
         c.claim_number as "claimNumber",
         c.box_id as "boxId",
         c.doc_number as "docNumber",
         c.doc_date as "docDate",
         c.description,
         c.amount_rub as "amountRub",
         c.all_columns as "allColumns",
         c.created_at as "createdAt"
       from wb_claims_items c
       ${whereSql}
       order by c.id desc
       limit $${dataParams.length - 1}
       offset $${dataParams.length}`,
      dataParams,
    );

    return res.status(200).json({
      page,
      limit,
      total,
      revisionId: activeRevisionId,
      revisions: includeHistory ? revisions : [],
      items: rowsRes.rows,
      request_id: ctx.requestId,
    });
  } catch (error) {
    logError(ctx, "wb_claims_list_failed", error);
    return res.status(500).json({ error: "Ошибка загрузки удержаний", request_id: ctx.requestId });
  }
}


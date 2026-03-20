import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import { pgIlikeContainsPattern, pgTableExists, resolveWbAccess } from "../_wb.js";

const GROUP_DOC_EXPR = `coalesce(nullif(trim(r.document_number), ''), '')`;

/** Совпадение wb_inbound_items с wb_returned_items.box_id (коробка / ШК / баркод / стикер). */
const INBOUND_MATCH_RETURNED_BOX = `trim(coalesce(i.box_number, '')) = trim(coalesce(r.box_id, ''))
  or trim(coalesce(i.shk, '')) = trim(coalesce(r.box_id, ''))
  or trim(coalesce(i.barcode, '')) = trim(coalesce(r.box_id, ''))
  or trim(coalesce(i.sticker, '')) = trim(coalesce(r.box_id, ''))`;

const INBOUND_SORT_MATCH = `case
      when trim(coalesce(i.box_number, '')) = trim(coalesce(r.box_id, '')) then 0
      when trim(coalesce(i.shk, '')) = trim(coalesce(r.box_id, '')) then 1
      when trim(coalesce(i.barcode, '')) = trim(coalesce(r.box_id, '')) then 2
      else 3
    end`;

/** Цена из опися для строки возврата r, если в возврате нет суммы (NULL или 0 — импорт одним столбцом писал 0). */
const INBOUND_PRICE_SCALAR_SUBQUERY = `(
  select i.price_rub
  from wb_inbound_items i
  where ${INBOUND_MATCH_RETURNED_BOX}
  order by ${INBOUND_SORT_MATCH}, i.inventory_created_at desc nulls last, i.id desc
  limit 1
)`;

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
        view: "summary",
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
    const viewRaw = String(req.query.view ?? "summary").trim().toLowerCase();
    const view = viewRaw === "detail" ? "detail" : "summary";

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

    if (view === "detail") {
      const gDoc = String(req.query.gDoc ?? "").trim();
      const gBatchStr = String(req.query.gBatch ?? "").trim();
      const gBatchId =
        gBatchStr === "" || gBatchStr.toLowerCase() === "null" ? null : Number(gBatchStr);
      if (gBatchId !== null && !Number.isFinite(gBatchId)) {
        return res.status(400).json({ error: "Некорректный gBatch", request_id: ctx.requestId });
      }

      /** Те же фильтры, что у сводки — иначе в раскрытии показывались все строки группы. */
      const dWhere: string[] = [
        `${GROUP_DOC_EXPR} = $1::text`,
        `r.batch_id is not distinct from $2::bigint`,
      ];
      const detailParams: unknown[] = [gDoc, gBatchId];
      if (dateFrom) {
        detailParams.push(dateFrom);
        dWhere.push(`coalesce(r.document_date, r.created_at::date) >= $${detailParams.length}::date`);
      }
      if (dateTo) {
        detailParams.push(dateTo);
        dWhere.push(`coalesce(r.document_date, r.created_at::date) <= $${detailParams.length}::date`);
      }
      if (boxId) {
        detailParams.push(pgIlikeContainsPattern(boxId));
        dWhere.push(`r.box_id ilike $${detailParams.length} escape '\\'`);
      }
      if (cargoNumber) {
        detailParams.push(cargoNumber);
        dWhere.push(`coalesce(r.cargo_number, '') ilike $${detailParams.length}`);
      }
      if (hasShkRaw === "true" || hasShkRaw === "false") {
        detailParams.push(hasShkRaw === "true");
        dWhere.push(`r.has_shk = $${detailParams.length}`);
      }
      if (q) {
        detailParams.push(`%${q}%`);
        dWhere.push(`(
          r.box_id ilike $${detailParams.length}
          or coalesce(r.cargo_number, '') ilike $${detailParams.length}
          or coalesce(r.description, '') ilike $${detailParams.length}
          or coalesce(r.document_number, '') ilike $${detailParams.length}
        )`);
      }
      const detailWhere = `where ${dWhere.join(" and ")}`;

      const hasInbound = await pgTableExists(pool, "wb_inbound_items");
      const inboundLateral = hasInbound
        ? `left join lateral (
             select
               i.inventory_number,
               i.row_number,
               nullif(trim(coalesce(i.description, '')), '') as description,
               nullif(trim(coalesce(i.nomenclature, '')), '') as nomenclature,
               i.price_rub
             from wb_inbound_items i
             where ${INBOUND_MATCH_RETURNED_BOX}
             order by ${INBOUND_SORT_MATCH}, i.inventory_created_at desc nulls last, i.id desc
             limit 1
           ) inv on true`
        : "";

      const invSelect = hasInbound
        ? `inv.inventory_number as "inboundInventoryNumber",
           inv.row_number as "inboundRowNumber",
           case
             when inv.description is not null and inv.description <> '' then inv.description
             when inv.nomenclature is not null and inv.nomenclature <> '' then inv.nomenclature
             else null
           end as "inboundTitle",
           inv.price_rub as "inboundPriceRub"`
        : `null::text as "inboundInventoryNumber",
           null::int as "inboundRowNumber",
           null::text as "inboundTitle",
           null::numeric as "inboundPriceRub"`;

      const rowsRes = await pool.query(
        `select
           r.id,
           r.box_id as "boxId",
           ${invSelect}
         from wb_returned_items r
         ${inboundLateral}
         ${detailWhere}
         order by r.source_row_number nulls last, r.id asc
         limit 8000`,
        detailParams,
      );

      const countRes = await pool.query<{ total: number }>(
        `select count(*)::int as total from wb_returned_items r ${detailWhere}`,
        detailParams,
      );

      return res.status(200).json({
        page: 1,
        limit: rowsRes.rows.length,
        total: countRes.rows[0]?.total ?? 0,
        view: "detail",
        items: rowsRes.rows,
        request_id: ctx.requestId,
      });
    }

    const countRes = await pool.query<{ total: number }>(
      `select count(*)::int as total from (
         select 1
         from wb_returned_items r
         ${whereSql}
         group by ${GROUP_DOC_EXPR}, r.batch_id
       ) t`,
      params,
    );
    const total = countRes.rows[0]?.total ?? 0;

    const hasInboundForSummary = await pgTableExists(pool, "wb_inbound_items");
    /** Сумма по группе: amount_rub; если NULL или 0 — цена из опися (та же логика сопоставления, что в детализации). */
    const totalAmountExpr = hasInboundForSummary
      ? `coalesce(sum(coalesce(nullif(r.amount_rub, 0), ${INBOUND_PRICE_SCALAR_SUBQUERY})), 0)::numeric`
      : `coalesce(sum(r.amount_rub), 0)::numeric`;

    /** Сколько строк возврата в группе нашли совпадение в «Описи» (коробка / ШК / баркод / стикер). */
    const matchedCountExpr = hasInboundForSummary
      ? `count(*) filter (
           where exists (
             select 1 from wb_inbound_items i
             where ${INBOUND_MATCH_RETURNED_BOX}
           )
         )::int`
      : `0::int`;

    const dataParams = [...params, limit, offset];
    const rowsRes = await pool.query(
      `select
         max(r.document_number) as "documentNumber",
         r.batch_id as "batchId",
         max(r.created_at) as "uploadedAt",
         count(*)::int as "boxCount",
         ${matchedCountExpr} as "matchedCount",
         ${totalAmountExpr} as "totalAmountRub"
       from wb_returned_items r
       ${whereSql}
       group by ${GROUP_DOC_EXPR}, r.batch_id
       order by max(r.created_at) desc
       limit $${dataParams.length - 1}
       offset $${dataParams.length}`,
      dataParams,
    );

    return res.status(200).json({
      page,
      limit,
      total,
      view: "summary",
      items: rowsRes.rows,
      request_id: ctx.requestId,
    });
  } catch (error) {
    logError(ctx, "wb_returned_list_failed", error);
    return res.status(500).json({ error: "Ошибка загрузки возвращенного груза", request_id: ctx.requestId });
  }
}

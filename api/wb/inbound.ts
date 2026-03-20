import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import { pgIlikeContainsPattern, pgTableExists, resolveWbAccess } from "../_wb.js";

/** Пагинация сводки «Описи». */
const INBOUND_SUMMARY_MAX_LIMIT = 500;
/** Строк одной ведомости при раскрытии (иначе обрезка на 500). */
const INBOUND_DETAIL_SINGLE_INV_MAX_LIMIT = 15000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "wb_inbound_list");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  try {
    const pool = getPool();
    const access = await resolveWbAccess(req, pool, "read");
    if (!access) return res.status(401).json({ error: "Нет доступа", request_id: ctx.requestId });

    if (!(await pgTableExists(pool, "wb_inbound_items"))) {
      return res.status(200).json({
        page: 1,
        limit: Math.min(
          INBOUND_SUMMARY_MAX_LIMIT,
          Math.max(1, Number(req.query.limit ?? 50) || 50),
        ),
        total: 0,
        view: String(req.query.view ?? "").trim().toLowerCase() === "summary" ? "summary" : "detail",
        items: [],
        request_id: ctx.requestId,
      });
    }

    const limitRaw = Number(req.query.limit ?? 50);
    const pageRaw = Number(req.query.page ?? 1);
    const page = Number.isFinite(pageRaw) ? Math.max(1, Math.trunc(pageRaw)) : 1;

    const dateFrom = String(req.query.dateFrom ?? "").trim();
    const dateTo = String(req.query.dateTo ?? "").trim();
    const inventoryNumber = String(req.query.inventoryNumber ?? "").trim();
    const boxId = String(req.query.boxId ?? "").trim();
    const article = String(req.query.article ?? "").trim();
    const brand = String(req.query.brand ?? "").trim();
    const q = String(req.query.q ?? "").trim();
    const view = String(req.query.view ?? "").trim().toLowerCase();

    const maxLimit =
      view === "summary"
        ? INBOUND_SUMMARY_MAX_LIMIT
        : inventoryNumber
          ? INBOUND_DETAIL_SINGLE_INV_MAX_LIMIT
          : INBOUND_SUMMARY_MAX_LIMIT;
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(maxLimit, Math.trunc(limitRaw))) : 50;
    const offset = (page - 1) * limit;

    const sortByRaw = String(req.query.sortBy ?? "").trim();
    const sortDirRaw = String(req.query.sortDir ?? "").trim().toLowerCase();
    const orderDir = sortDirRaw === "asc" ? "asc" : "desc";
    const nullsClause = orderDir === "asc" ? "nulls first" : "nulls last";

    const where: string[] = [];
    const params: unknown[] = [];

    if (dateFrom) {
      params.push(dateFrom);
      where.push(`i.inventory_created_at >= $${params.length}::date`);
    }
    if (dateTo) {
      params.push(dateTo);
      where.push(`i.inventory_created_at <= $${params.length}::date`);
    }
    if (inventoryNumber) {
      params.push(inventoryNumber);
      where.push(`i.inventory_number = $${params.length}`);
    }
    if (boxId) {
      params.push(pgIlikeContainsPattern(boxId));
      where.push(`i.box_number ilike $${params.length} escape '\\'`);
    }
    if (article) {
      params.push(`%${article}%`);
      where.push(`coalesce(i.article, '') ilike $${params.length}`);
    }
    if (brand) {
      params.push(`%${brand}%`);
      where.push(`coalesce(i.brand, '') ilike $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      where.push(`(
        i.box_number ilike $${params.length}
        or i.shk ilike $${params.length}
        or coalesce(i.sticker, '') ilike $${params.length}
        or coalesce(i.barcode, '') ilike $${params.length}
        or coalesce(i.phone, '') ilike $${params.length}
        or coalesce(i.article, '') ilike $${params.length}
        or coalesce(i.brand, '') ilike $${params.length}
        or coalesce(i.description, '') ilike $${params.length}
        or coalesce(i.nomenclature, '') ilike $${params.length}
        or i.inventory_number ilike $${params.length}
        or coalesce(i.box_shk, '') ilike $${params.length}
      )`);
    }

    const whereSql = where.length ? `where ${where.join(" and ")}` : "";

    if (view === "summary") {
      const claimsReady =
        (await pgTableExists(pool, "wb_claims_items")) &&
        (await pgTableExists(pool, "wb_claims_revisions"));
      /** Совпадение номера короба в строке описи с активной претензией. */
      const hasClaimSql = claimsReady
        ? `bool_or(
            exists (
              select 1 from wb_claims_items ci
              where ci.revision_id = (
                select r.id from wb_claims_revisions r
                where r.is_active = true
                order by r.uploaded_at desc
                limit 1
              )
              and nullif(trim(b.box_number), '') is not null
              and nullif(trim(ci.box_id), '') is not null
              and trim(b.box_number) = trim(ci.box_id)
            )
          )`
        : `false`;

      const countSql = `
        select count(*)::int as total from (
          select i.inventory_number
          from wb_inbound_items i
          ${whereSql}
          group by i.inventory_number
        ) t
      `;
      const countRes = await pool.query<{ total: number }>(countSql, params);
      const total = countRes.rows[0]?.total ?? 0;

      const sortKey =
        sortByRaw === "inventoryNumber" ||
        sortByRaw === "inventoryCreatedAt" ||
        sortByRaw === "boxCount" ||
        sortByRaw === "totalPriceRub"
          ? sortByRaw
          : "inventoryCreatedAt";
      /** Только whitelist — в ORDER BY не подставляем произвольный ввод. */
      const ORDER_EXPR: Record<string, string> = {
        inventoryNumber: "b.inventory_number",
        inventoryCreatedAt: "max(b.inventory_created_at)",
        boxCount: "count(distinct b.box_number)",
        totalPriceRub: "coalesce(sum(b.price_rub), 0)",
      };
      const orderExpr = ORDER_EXPR[sortKey] ?? ORDER_EXPR.inventoryCreatedAt;

      const dataParams = [...params, limit, offset];
      const rowsSql = `
        with base as (
          select i.*
          from wb_inbound_items i
          ${whereSql}
        )
        select
          b.inventory_number as "inventoryNumber",
          max(b.inventory_created_at)::date as "inventoryCreatedAt",
          count(distinct b.box_number)::int as "boxCount",
          coalesce(sum(b.price_rub), 0)::numeric as "totalPriceRub",
          count(*)::int as "lineCount",
          ${hasClaimSql} as "hasClaim"
        from base b
        group by b.inventory_number
        order by ${orderExpr} ${orderDir} ${nullsClause}, b.inventory_number desc
        limit $${dataParams.length - 1}
        offset $${dataParams.length}
      `;
      const dataRes = await pool.query(rowsSql, dataParams);

      return res.status(200).json({
        page,
        limit,
        total,
        view: "summary",
        items: dataRes.rows,
        request_id: ctx.requestId,
      });
    }

    const countSql = `select count(*)::int as total from wb_inbound_items i ${whereSql}`;
    const countRes = await pool.query<{ total: number }>(countSql, params);
    const total = countRes.rows[0]?.total ?? 0;

    const hasReturned = await pgTableExists(pool, "wb_returned_items");
    const dataParams = [...params, limit, offset];
    /** Возврат: в файле возврата box_id обычно = ШК строки описи (как в api/wb/returned.ts, api/_wb.ts). */
    const returnJoinSql = hasReturned
      ? `left join lateral (
          select r.id as ret_id, r.amount_rub as ret_amount_rub
          from wb_returned_items r
          where nullif(trim(coalesce(i.shk, '')), '') is not null
            and trim(coalesce(i.shk, '')) = trim(coalesce(r.box_id, ''))
          order by r.created_at desc nulls last, r.id desc
          limit 1
        ) ret on true`
      : "";
    const returnSelectSql = hasReturned
      ? `case
          when nullif(trim(coalesce(i.shk, '')), '') is null then ''
          when ret.ret_id is not null then 'Да'
          else 'Нет'
        end as "isReturned",
        case
          when nullif(trim(coalesce(i.shk, '')), '') is null then coalesce(i.price_rub, 0)
          when ret.ret_id is null then coalesce(i.price_rub, 0)
          else greatest(
            0::numeric,
            coalesce(i.price_rub, 0) - coalesce(nullif(ret.ret_amount_rub, 0), coalesce(i.price_rub, 0))
          )
        end as "priceRubAfterReturn",`
      : `'' as "isReturned",
        coalesce(i.price_rub, 0) as "priceRubAfterReturn",`;

    const rowsSql = `
      select
        i.id,
        i.inventory_number as "inventoryNumber",
        i.inventory_created_at as "inventoryCreatedAt",
        i.row_number as "rowNumber",
        i.box_number as "boxNumber",
        i.box_shk as "boxShk",
        i.shk,
        i.sticker,
        i.barcode,
        i.phone,
        i.receiver_full_name as "receiverFullName",
        i.article,
        i.brand,
        i.nomenclature,
        i.size,
        i.description,
        i.kit,
        i.price_rub as "priceRub",
        ${returnSelectSql}
        i.tnv_ed as "tnvEd",
        i.mass_kg as "massKg",
        i.created_at as "createdAt"
      from wb_inbound_items i
      ${returnJoinSql}
      ${whereSql}
      order by i.inventory_created_at desc nulls last, i.id desc
      limit $${dataParams.length - 1}
      offset $${dataParams.length}
    `;
    const dataRes = await pool.query(rowsSql, dataParams);

    return res.status(200).json({
      page,
      limit,
      total,
      view: "detail",
      items: dataRes.rows,
      request_id: ctx.requestId,
    });
  } catch (error) {
    logError(ctx, "wb_inbound_list_failed", error);
    return res.status(500).json({ error: "Ошибка загрузки принятых грузов", request_id: ctx.requestId });
  }
}


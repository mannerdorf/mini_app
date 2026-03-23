import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import { pgIlikeContainsPattern, pgTableExists, resolveWbAccess } from "../_wb.js";
import { resolveWb1cForBoxShk, type Wb1cShkLookupRow } from "../lib/wb1cShkResolve.js";

/** Vercel: query-параметр может быть string | string[] */
function qsOne(req: VercelRequest, key: string): string {
  const v = req.query[key];
  if (v === undefined || v === null) return "";
  if (Array.isArray(v)) return String(v[0] ?? "").trim();
  return String(v).trim();
}

const SUMMARY_MAX_LIMIT = 1000;

/** Значение filterLogisticsStatus: только строки без last_status в wb_postb_posilka_cache (или пустой). */
const WB_SUMMARY_FILTER_POSTB_EMPTY = "__postb_empty__";
/** Значение filterLogisticsStatus: пусто, «не передавал*», «получена информация». */
const WB_SUMMARY_FILTER_POSTB_NOT_SENT = "__postb_not_sent__";
/** В сводке считаем «нет в описях», когда в строке нет номера описи. */
const WB_SUMMARY_NO_INBOUND_EXPR = `coalesce(nullif(trim(i.inventory_number), ''), '') = ''`;

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

    if (!(await pgTableExists(pool, "wb_summary"))) {
      return res.status(200).json({
        page: 1,
        limit: Math.min(SUMMARY_MAX_LIMIT, Math.max(1, Number(qsOne(req, "limit") || 50) || 50)),
        total: 0,
        items: [],
        summaryHeader: {
          formedAt: null,
          placeCount: 0,
          totalClaimRub: 0,
          totalInboundRub: 0,
          totalNotInInboundClaimRub: 0,
          rowCountNotInInbound: 0,
          totalInboundRubPostbBlank: 0,
          rowCountPostbBlank: 0,
          inboundByPostbStatus: [],
        },
        request_id: ctx.requestId,
      });
    }

    const hasLogisticsParcel = await pgTableExists(pool, "wb_logistics_parcel");
    const hasPostbCache = await pgTableExists(pool, "wb_postb_posilka_cache");
    const postbParcelKeyExpr = `lower(trim(nullif(coalesce(nullif(trim(i.box_shk), ''), nullif(trim(s.shk), ''), nullif(trim(c.shk), ''), ''), '')))`;
    const postbJoinSql = hasPostbCache
      ? `left join wb_postb_posilka_cache ppc on ppc.posilka_code_norm = ${postbParcelKeyExpr}`
      : "";

    const limitRaw = Number(qsOne(req, "limit") || 50);
    const pageRaw = Number(qsOne(req, "page") || 1);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(SUMMARY_MAX_LIMIT, Math.trunc(limitRaw))) : 50;
    const page = Number.isFinite(pageRaw) ? Math.max(1, Math.trunc(pageRaw)) : 1;
    const offset = (page - 1) * limit;

    const boxId = String(req.query.boxId ?? "").trim();
    const claimNumber = String(req.query.claimNumber ?? "").trim();
    const dateFrom = String(req.query.dateFrom ?? "").trim();
    const dateTo = String(req.query.dateTo ?? "").trim();
    const article = String(req.query.article ?? "").trim();
    const brand = String(req.query.brand ?? "").trim();
    const q = String(req.query.q ?? "").trim();
    const onlyNotInInbound = qsOne(req, "onlyNotInInbound").toLowerCase() === "true";
    const filterLogisticsStatus = qsOne(req, "filterLogisticsStatus");
    const filterBoxExact = qsOne(req, "filterBoxExact");
    const filterInventoryExact = qsOne(req, "filterInventoryExact");

    const sortByRaw = qsOne(req, "sortBy");
    const sortDirRaw = qsOne(req, "sortDir").toLowerCase();
    const orderDir = sortDirRaw === "asc" ? "asc" : "desc";
    const nullsClause = orderDir === "asc" ? "nulls first" : "nulls last";

    const where: string[] = ["s.declared = true"];
    const params: unknown[] = [];
    if (boxId) {
      params.push(pgIlikeContainsPattern(boxId));
      where.push(
        `(s.box_id ilike $${params.length} escape '\\' or coalesce(s.shk, '') ilike $${params.length} escape '\\')`,
      );
    }
    if (claimNumber) {
      params.push(`%${claimNumber}%`);
      where.push(`coalesce(s.claim_number, '') ilike $${params.length}`);
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
    if (filterBoxExact) {
      params.push(filterBoxExact);
      where.push(`nullif(trim(s.box_id), '') = $${params.length}`);
    }
    if (filterInventoryExact) {
      params.push(filterInventoryExact);
      where.push(`nullif(trim(i.inventory_number), '') = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      const qp = params.length;
      const lpSearch = hasLogisticsParcel
        ? `
        or coalesce(lp.perevozka_nasha, '') ilike $${qp}
        or coalesce(lp.otchet_dostavki, '') ilike $${qp}
        or coalesce(lp.otpavka_ap, '') ilike $${qp}
        or coalesce(lp.logistics_status, '') ilike $${qp}
        or coalesce(lp.data_info_received, '') ilike $${qp}
        or coalesce(lp.data_packed, '') ilike $${qp}
        or coalesce(lp.data_consolidated, '') ilike $${qp}
        or coalesce(lp.data_departed, '') ilike $${qp}
        or coalesce(lp.data_to_hand, '') ilike $${qp}
        or coalesce(lp.data_delivered, '') ilike $${qp}`
        : "";
      where.push(`(
        s.box_id ilike $${qp}
        or coalesce(s.shk, '') ilike $${qp}
        or coalesce(s.claim_number, '') ilike $${qp}
        or coalesce(s.source_document_number, '') ilike $${qp}
        or coalesce(s.description, '') ilike $${qp}
        or coalesce(c.description, '') ilike $${qp}
        or coalesce(c.all_columns::text, '') ilike $${qp}
        or coalesce(i.inventory_number, '') ilike $${qp}
        or coalesce(i.shk, '') ilike $${qp}
        or coalesce(i.nomenclature, '') ilike $${qp}
        or coalesce(i.description, '') ilike $${qp}
        or coalesce(i.box_shk, '') ilike $${qp}
        ${lpSearch}
      )`);
    }

    /** Без фильтра по статусу PostB — для разбивки сумм по статусам. */
    const paramsBeforeStatus = [...params];
    const whereBeforeStatus = [...where];

    if (filterLogisticsStatus && hasPostbCache) {
      if (filterLogisticsStatus === WB_SUMMARY_FILTER_POSTB_EMPTY) {
        where.push(`coalesce(nullif(trim(ppc.last_status), ''), '') = ''`);
      } else if (filterLogisticsStatus === WB_SUMMARY_FILTER_POSTB_NOT_SENT) {
        where.push(`(
          coalesce(nullif(trim(ppc.last_status), ''), '') = ''
          or lower(coalesce(nullif(trim(ppc.last_status), ''), '')) like 'не передава%'
          or replace(lower(coalesce(nullif(trim(ppc.last_status), ''), '')), ' ', '') = 'полученаинформация'
        )`);
      } else {
        params.push(filterLogisticsStatus);
        where.push(`coalesce(nullif(trim(ppc.last_status), ''), '') = $${params.length}`);
      }
    }

    const whereBaseSql = `where ${where.join(" and ")}`;
    const whereFullParts = onlyNotInInbound ? [...where, WB_SUMMARY_NO_INBOUND_EXPR] : where;
    const whereFullSql = `where ${whereFullParts.join(" and ")}`;

    const fromJoins = hasLogisticsParcel
      ? `
       from wb_summary s
       left join wb_claims_items c on c.id = s.claim_item_id
       left join wb_inbound_items i on i.id = s.inbound_item_id
       left join wb_logistics_parcel lp on lower(trim(lp.parcel_key)) = ${postbParcelKeyExpr}
       ${postbJoinSql}`
      : `
       from wb_summary s
       left join wb_claims_items c on c.id = s.claim_item_id
       left join wb_inbound_items i on i.id = s.inbound_item_id
       ${postbJoinSql}`;

    const logisticsSelect = hasLogisticsParcel
      ? `
         lp.perevozka_nasha as "lvPerevozkaNasha",
         lp.otchet_dostavki as "lvOtchetDostavki",
         lp.otpavka_ap as "lvOtpavkaAp",
         lp.logistics_status as "lvLogisticsStatus",
         lp.data_info_received as "lvDataInfo",
         lp.data_packed as "lvDataUpakovano",
         lp.data_consolidated as "lvDataKonsolidirovano",
         lp.data_departed as "lvDataUletelo",
         lp.data_to_hand as "lvDataKVrucheniyu",
         lp.data_delivered as "lvDataDostavleno"`
      : `
         null::text as "lvPerevozkaNasha",
         null::text as "lvOtchetDostavki",
         null::text as "lvOtpavkaAp",
         null::text as "lvLogisticsStatus",
         null::text as "lvDataInfo",
         null::text as "lvDataUpakovano",
         null::text as "lvDataKonsolidirovano",
         null::text as "lvDataUletelo",
         null::text as "lvDataKVrucheniyu",
         null::text as "lvDataDostavleno"`;

    const postbSelect = hasPostbCache
      ? `
         coalesce(nullif(trim(ppc.last_status), ''), '') as "postbLastStatus",
         coalesce(nullif(trim(ppc.perevozka), ''), '') as "postbPerevozka",
         coalesce(ppc.posilka_steps, '[]'::jsonb) as "postbPosilkaSteps"`
      : `
         ''::text as "postbLastStatus",
         ''::text as "postbPerevozka",
         '[]'::jsonb as "postbPosilkaSteps"`;

    const formedRes = await pool.query<{ formed_at: string | null }>(
      `select max(s.updated_at) as formed_at from wb_summary s where s.declared = true`,
    );
    const formedAt = formedRes.rows[0]?.formed_at ?? null;

    /** Сумма по претензии по строкам без описи — без учёта тумблера (только фильтры дат/поиска). */
    const notInInboundRes = await pool.query<{ v: string; row_count: number }>(
      `select
         coalesce(
           sum(c.amount_rub) filter (where c.id is not null and ${WB_SUMMARY_NO_INBOUND_EXPR}),
           0
         )::numeric as v,
         count(*) filter (where ${WB_SUMMARY_NO_INBOUND_EXPR})::int as row_count
       ${fromJoins}
       ${whereBaseSql}`,
      params,
    );
    const totalNotInInboundClaimRub = notInInboundRes.rows[0]?.v ?? "0";
    const rowCountNotInInbound = Number(notInInboundRes.rows[0]?.row_count ?? 0);

    const countSelectPostbBlank = hasPostbCache
      ? `,
         coalesce(sum(i.price_rub) filter (
           where i.id is not null
             and coalesce(nullif(trim(ppc.last_status), ''), '') = ''
         ), 0)::numeric as total_inbound_rub_postb_blank,
         count(*) filter (where coalesce(nullif(trim(ppc.last_status), ''), '') = '')::int as row_count_postb_blank`
      : `,
         0::numeric as total_inbound_rub_postb_blank,
         0::int as row_count_postb_blank`;

    const countRes = await pool.query<{
      total: number;
      total_claim_rub: string;
      total_inbound_rub: string;
      total_inbound_rub_postb_blank: string;
      row_count_postb_blank: number;
    }>(
      `select
         count(*)::int as total,
         coalesce(sum(c.amount_rub) filter (where c.id is not null), 0)::numeric as total_claim_rub,
         coalesce(sum(i.price_rub) filter (where i.id is not null), 0)::numeric as total_inbound_rub
         ${countSelectPostbBlank}
       ${fromJoins}
       ${whereFullSql}`,
      params,
    );
    const total = countRes.rows[0]?.total ?? 0;
    const totalClaimRub = countRes.rows[0]?.total_claim_rub ?? "0";
    const totalInboundRub = countRes.rows[0]?.total_inbound_rub ?? "0";
    const totalInboundRubPostbBlank = countRes.rows[0]?.total_inbound_rub_postb_blank ?? "0";
    const rowCountPostbBlank = countRes.rows[0]?.row_count_postb_blank ?? 0;

    type StatusAggRow = {
      postb_status: string;
      row_count: number;
      total_claim_rub: string;
      total_inbound_rub: string;
    };
    let inboundByPostbStatus: {
      status: string;
      rowCount: number;
      totalClaimRub: string;
      totalInboundRub: string;
    }[] = [];
    if (hasPostbCache) {
      const whereBreakdownParts = onlyNotInInbound
        ? [...whereBeforeStatus, WB_SUMMARY_NO_INBOUND_EXPR]
        : whereBeforeStatus;
      const whereBreakdownSql = `where ${whereBreakdownParts.join(" and ")}`;
      const br = await pool.query<StatusAggRow>(
        `select
           coalesce(nullif(trim(ppc.last_status), ''), '') as postb_status,
           count(*)::int as row_count,
           coalesce(sum(c.amount_rub) filter (where c.id is not null), 0)::numeric as total_claim_rub,
           coalesce(sum(i.price_rub) filter (where i.id is not null), 0)::numeric as total_inbound_rub
         ${fromJoins}
         ${whereBreakdownSql}
         group by 1
         order by
           (case when min(coalesce(nullif(trim(ppc.last_status), ''), '')) = '' then 1 else 0 end),
           coalesce(sum(i.price_rub) filter (where i.id is not null), 0) desc nulls last`,
        paramsBeforeStatus,
      );
      inboundByPostbStatus = br.rows.map((r) => ({
        status: String(r.postb_status ?? ""),
        rowCount: Number(r.row_count ?? 0),
        totalClaimRub: String(r.total_claim_rub ?? "0"),
        totalInboundRub: String(r.total_inbound_rub ?? "0"),
      }));
    }

    const ORDER_EXPR: Record<string, string> = {
      shk: `coalesce(nullif(trim(c.shk), ''), nullif(trim(s.shk), ''), nullif(trim(i.shk), ''))`,
      boxId: `s.box_id`,
      inboundBoxShk: `i.box_shk`,
      isReturned: `((coalesce(s.is_returned, false)) or (s.returned_item_id is not null))`,
      claimRowNumber: `(c.row_number)::bigint`,
      /** Явно numeric — иначе при некоторых планах/типах сортировка могла вести себя нестабильно */
      claimPriceRub: `(c.amount_rub)::numeric`,
      inventoryNumber: `i.inventory_number`,
      inboundRowNumber: `(i.row_number)::bigint`,
      inboundTitle: `coalesce(nullif(trim(i.description), ''), nullif(trim(i.nomenclature), ''))`,
      inboundPriceRub: `(i.price_rub)::numeric`,
    };
    const sortKey = Object.prototype.hasOwnProperty.call(ORDER_EXPR, sortByRaw) ? sortByRaw : "";
    const orderTail = `coalesce(c.row_number, 0), coalesce(s.shk, s.box_id, '')`;
    const orderSql = sortKey
      ? `order by ${ORDER_EXPR[sortKey]} ${orderDir} ${nullsClause}, ${orderTail}`
      : `order by ${orderTail}`;

    const dataParams = [...params, limit, offset];
    const rowsRes = await pool.query(
      `select
         coalesce(
           nullif(trim(c.shk), ''),
           nullif(trim(s.shk), ''),
           nullif(trim(i.shk), '')
         ) as "shk",
         s.box_id as "boxId",
         c.row_number as "claimRowNumber",
         c.amount_rub as "claimPriceRub",
         (s.inbound_item_id is not null) as "hasInbound",
         ((coalesce(s.is_returned, false)) or (s.returned_item_id is not null)) as "isReturned",
         i.inventory_number as "inventoryNumber",
         i.row_number as "inboundRowNumber",
         i.shk as "inboundShk",
         i.box_number as "inboundBoxNumber",
         nullif(trim(coalesce(i.box_shk, '')), '') as "inboundBoxShk",
         nullif(trim(coalesce(nullif(trim(i.description), ''), nullif(trim(i.nomenclature), ''))), '') as "inboundTitle",
         i.price_rub as "inboundPriceRub",
         ${logisticsSelect},
         ${postbSelect}
       ${fromJoins}
       ${whereFullSql}
       ${orderSql}
       limit $${dataParams.length - 1}
       offset $${dataParams.length}`,
      dataParams,
    );

    type Row = Record<string, unknown>;
    let items: Row[] = rowsRes.rows as Row[];
    if (await pgTableExists(pool, "wb_1c_shk_status")) {
      try {
        const r1c = await pool.query<{
          shk: string;
          status_1c: string;
          cargo_number: string;
        }>("select shk, status_1c, cargo_number from wb_1c_shk_status");
        const lookup: Wb1cShkLookupRow[] = r1c.rows.map((row) => ({
          shk: String(row.shk ?? ""),
          status1c: String(row.status_1c ?? ""),
          cargoNumber: String(row.cargo_number ?? ""),
        }));
        items = items.map((row) => {
          const resolved = resolveWb1cForBoxShk(row.inboundBoxShk as string | null | undefined, lookup);
          return { ...row, status1c: resolved.status1c, appCargoNumber: resolved.appCargoNumber };
        });
      } catch {
        items = items.map((row) => ({
          ...row,
          status1c: "",
          appCargoNumber: "",
        }));
      }
    } else {
      items = items.map((row) => ({
        ...row,
        status1c: "",
        appCargoNumber: "",
      }));
    }

    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    return res.status(200).json({
      page,
      limit,
      total,
      summaryHeader: {
        formedAt,
        placeCount: total,
        totalClaimRub,
        totalInboundRub,
        totalNotInInboundClaimRub,
        rowCountNotInInbound,
        totalInboundRubPostbBlank,
        rowCountPostbBlank,
        inboundByPostbStatus,
      },
      items,
      request_id: ctx.requestId,
    });
  } catch (error) {
    logError(ctx, "wb_summary_list_failed", error);
    return res.status(500).json({ error: "Ошибка загрузки сводной таблицы", request_id: ctx.requestId });
  }
}

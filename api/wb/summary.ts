import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import { pgIlikeContainsPattern, pgTableExists, resolveWbAccess } from "../_wb.js";
import { resolveWb1cForBoxShk, type Wb1cShkLookupRow } from "../lib/wb1cShkResolve.js";

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
        limit: Number(req.query.limit ?? 50),
        total: 0,
        items: [],
        summaryHeader: { formedAt: null, placeCount: 0, totalClaimRub: 0, totalInboundRub: 0 },
        request_id: ctx.requestId,
      });
    }

    const limitRaw = Number(req.query.limit ?? 50);
    const pageRaw = Number(req.query.page ?? 1);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.trunc(limitRaw))) : 50;
    const page = Number.isFinite(pageRaw) ? Math.max(1, Math.trunc(pageRaw)) : 1;
    const offset = (page - 1) * limit;

    const boxId = String(req.query.boxId ?? "").trim();
    const claimNumber = String(req.query.claimNumber ?? "").trim();
    const dateFrom = String(req.query.dateFrom ?? "").trim();
    const dateTo = String(req.query.dateTo ?? "").trim();
    const article = String(req.query.article ?? "").trim();
    const brand = String(req.query.brand ?? "").trim();
    const q = String(req.query.q ?? "").trim();

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
    if (q) {
      params.push(`%${q}%`);
      where.push(`(
        s.box_id ilike $${params.length}
        or coalesce(s.shk, '') ilike $${params.length}
        or coalesce(s.claim_number, '') ilike $${params.length}
        or coalesce(s.source_document_number, '') ilike $${params.length}
        or coalesce(s.description, '') ilike $${params.length}
        or coalesce(c.description, '') ilike $${params.length}
        or coalesce(c.all_columns::text, '') ilike $${params.length}
        or coalesce(i.inventory_number, '') ilike $${params.length}
        or coalesce(i.shk, '') ilike $${params.length}
        or coalesce(i.nomenclature, '') ilike $${params.length}
        or coalesce(i.description, '') ilike $${params.length}
        or coalesce(i.box_shk, '') ilike $${params.length}
      )`);
    }

    const whereSql = `where ${where.join(" and ")}`;
    const fromJoins = `
       from wb_summary s
       left join wb_claims_items c on c.id = s.claim_item_id
       left join wb_inbound_items i on i.id = s.inbound_item_id`;

    const formedRes = await pool.query<{ formed_at: string | null }>(
      `select max(s.updated_at) as formed_at from wb_summary s where s.declared = true`,
    );
    const formedAt = formedRes.rows[0]?.formed_at ?? null;

    const countRes = await pool.query<{ total: number; total_claim_rub: string; total_inbound_rub: string }>(
      `select
         count(*)::int as total,
         coalesce(sum(c.amount_rub) filter (where c.id is not null), 0)::numeric as total_claim_rub,
         coalesce(sum(i.price_rub) filter (where i.id is not null), 0)::numeric as total_inbound_rub
       ${fromJoins}
       ${whereSql}`,
      params,
    );
    const total = countRes.rows[0]?.total ?? 0;
    const totalClaimRub = countRes.rows[0]?.total_claim_rub ?? "0";
    const totalInboundRub = countRes.rows[0]?.total_inbound_rub ?? "0";

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
         nullif(trim(coalesce(nullif(trim(i.description), ''), nullif(trim(i.nomenclature), ''))), '') as "inboundTitle",
         i.price_rub as "inboundPriceRub",
         nullif(trim(coalesce(i.box_shk, '')), '') as "boxShkFor1c"
       ${fromJoins}
       ${whereSql}
       order by coalesce(c.row_number, 0), coalesce(s.shk, s.box_id, '')
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
          const { boxShkFor1c, ...rest } = row;
          const resolved = resolveWb1cForBoxShk(boxShkFor1c as string | null | undefined, lookup);
          return { ...rest, status1c: resolved.status1c, appCargoNumber: resolved.appCargoNumber };
        });
      } catch {
        items = items.map(({ boxShkFor1c: _b, ...rest }) => ({
          ...rest,
          status1c: "",
          appCargoNumber: "",
        }));
      }
    } else {
      items = items.map(({ boxShkFor1c: _b, ...rest }) => ({
        ...rest,
        status1c: "",
        appCargoNumber: "",
      }));
    }

    return res.status(200).json({
      page,
      limit,
      total,
      summaryHeader: {
        formedAt,
        placeCount: total,
        totalClaimRub,
        totalInboundRub,
      },
      items,
      request_id: ctx.requestId,
    });
  } catch (error) {
    logError(ctx, "wb_summary_list_failed", error);
    return res.status(500).json({ error: "Ошибка загрузки сводной таблицы", request_id: ctx.requestId });
  }
}

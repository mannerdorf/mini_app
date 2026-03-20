import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import { pgIlikeContainsPattern, pgTableExists, resolveWbAccess } from "../_wb.js";

function buildClaimsItemFilter(startParam: number, opts: {
  dateFrom: string;
  dateTo: string;
  boxId: string;
  article: string;
  brand: string;
  q: string;
}): { sql: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  let n = startParam;

  if (opts.dateFrom) {
    params.push(opts.dateFrom);
    parts.push(`c.doc_date >= $${n}::date`);
    n++;
  }
  if (opts.dateTo) {
    params.push(opts.dateTo);
    parts.push(`c.doc_date <= $${n}::date`);
    n++;
  }
  if (opts.boxId) {
    params.push(pgIlikeContainsPattern(opts.boxId));
    parts.push(`coalesce(c.box_id, '') ilike $${n} escape '\\'`);
    n++;
  }
  if (opts.q) {
    params.push(`%${opts.q}%`);
    parts.push(`(
      coalesce(c.claim_number, '') ilike $${n}
      or coalesce(c.box_id, '') ilike $${n}
      or coalesce(c.doc_number, '') ilike $${n}
      or coalesce(c.description, '') ilike $${n}
      or c.all_columns::text ilike $${n}
    )`);
    n++;
  }
  if (opts.article) {
    params.push(opts.article.toLowerCase());
    parts.push(
      `lower(coalesce(c.all_columns->>'Артикул', c.all_columns->>'артикул', '')) like '%' || $${n} || '%'`,
    );
    n++;
  }
  if (opts.brand) {
    params.push(opts.brand.toLowerCase());
    parts.push(`lower(coalesce(c.all_columns->>'Бренд', c.all_columns->>'бренд', '')) like '%' || $${n} || '%'`);
    n++;
  }

  return { sql: parts.length ? parts.join(" and ") : "true", params };
}

/**
 * Совпадает с импортом претензий: «Подтверждено» (ё/е).
 * Нет ключей «статус»/«status»/«состояние» в all_columns — строка считается подтверждённой (старые файлы без колонки).
 */
const CLAIMS_ROW_STATUS_CONFIRMED_SQL = `(
  not exists (
    select 1
    from jsonb_each_text(c.all_columns) e(k, v)
    where lower(trim(both from k)) in ('статус', 'status', 'состояние')
  )
  or regexp_replace(
    lower(trim(coalesce(
      (
        select trim(both from v)
        from jsonb_each_text(c.all_columns) e(k, v)
        where lower(trim(both from k)) in ('статус', 'status', 'состояние')
        limit 1
      ),
      ''
    ))),
    'ё',
    'е',
    'g'
  ) = 'подтверждено'
)`;

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
    const viewRaw = String(req.query.view ?? "summary").trim().toLowerCase();
    const view = viewRaw === "detail" ? "detail" : "summary";
    const detailRevisionId = Number(req.query.revisionId ?? 0);

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

    const filterOpts = { dateFrom, dateTo, boxId, article, brand, q };

    if (!(await pgTableExists(pool, "wb_claims_revisions"))) {
      return res.status(200).json({
        page: 1,
        limit,
        total: 0,
        view: "summary",
        revisionId: null,
        revisions: [],
        items: [],
        request_id: ctx.requestId,
      });
    }

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
    const activeRevisionId = revisions.find((r) => r.is_active)?.id ?? null;

    if (!(await pgTableExists(pool, "wb_claims_items"))) {
      return res.status(200).json({
        page: 1,
        limit,
        total: 0,
        view,
        revisionId: activeRevisionId,
        revisions: includeHistory ? revisions : [],
        items: [],
        request_id: ctx.requestId,
      });
    }

    if (view === "detail") {
      if (!Number.isFinite(detailRevisionId) || detailRevisionId <= 0) {
        return res.status(400).json({ error: "Укажите revisionId для просмотра строк", request_id: ctx.requestId });
      }

      const f = buildClaimsItemFilter(2, filterOpts);
      const whereSql = `where c.revision_id = $1 and (${f.sql})`;
      const params: unknown[] = [detailRevisionId, ...f.params];

      const countRes = await pool.query<{ total: number }>(
        `select count(*)::int as total from wb_claims_items c ${whereSql}`,
        params,
      );
      const total = countRes.rows[0]?.total ?? 0;

      const detailLimit = 8000;
      const dataParams = [...params, detailLimit];
      const rowsRes = await pool.query(
        `select
           c.id,
           c.revision_id as "revisionId",
           c.row_number as "rowNumber",
           c.claim_number as "claimNumber",
           c.box_id as "boxId",
           c.shk as "shk",
           c.doc_number as "docNumber",
           c.doc_date as "docDate",
           c.description,
           c.amount_rub as "amountRub",
           c.all_columns as "allColumns",
           c.created_at as "createdAt"
         from wb_claims_items c
         ${whereSql}
         order by c.row_number nulls last, c.id asc
         limit $${dataParams.length}`,
        dataParams,
      );

      return res.status(200).json({
        page: 1,
        limit: rowsRes.rows.length,
        total,
        view: "detail",
        revisionId: activeRevisionId,
        revisions: includeHistory ? revisions : [],
        items: rowsRes.rows,
        request_id: ctx.requestId,
      });
    }

    const f = buildClaimsItemFilter(1, filterOpts);
    const countRes = await pool.query<{ total: number }>(
      `select count(*)::int as total from (
         select r.id
         from wb_claims_revisions r
         inner join wb_claims_items c on c.revision_id = r.id
         where ${f.sql}
         group by r.id
       ) t`,
      f.params,
    );
    const total = countRes.rows[0]?.total ?? 0;

    const dataParams = [...f.params, limit, offset];
    const rowsRes = await pool.query(
      `select
         r.id as "revisionId",
         r.revision_number as "revisionNumber",
         r.uploaded_at as "uploadedAt",
         r.source_filename as "sourceFilename",
         r.is_active as "isActive",
         count(c.id)::int as "itemCount",
         coalesce(
           sum(c.amount_rub) filter (where ${CLAIMS_ROW_STATUS_CONFIRMED_SQL}),
           0
         )::numeric as "totalAmountRub"
       from wb_claims_revisions r
       inner join wb_claims_items c on c.revision_id = r.id
       where ${f.sql}
       group by r.id, r.revision_number, r.uploaded_at, r.source_filename, r.is_active
       order by r.uploaded_at desc
       limit $${dataParams.length - 1}
       offset $${dataParams.length}`,
      dataParams,
    );

    return res.status(200).json({
      page,
      limit,
      total,
      view: "summary",
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

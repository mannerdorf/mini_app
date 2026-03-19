import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import { pgIlikeContainsPattern, pgTableExists, resolveWbAccess } from "../_wb.js";
import { searchSimilar } from "../../lib/rag.js";

type SearchRow = {
  source: "summary" | "inbound" | "returned" | "claims";
  id: string;
  boxId: string | null;
  title: string;
  snippet: string;
  score: number;
  payload: Record<string, unknown>;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "wildberries_search");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  try {
    const pool = getPool();
    const access = await resolveWbAccess(req, pool, "read");
    if (!access) return res.status(401).json({ error: "Нет доступа", request_id: ctx.requestId });

    const q = String(req.query.q ?? "").trim();
    if (!q) return res.status(400).json({ error: "q обязателен", request_id: ctx.requestId });

    if (!(await pgTableExists(pool, "wb_summary"))) {
      return res.status(200).json({ q, total: 0, items: [], request_id: ctx.requestId });
    }

    const dateFrom = String(req.query.dateFrom ?? "").trim();
    const dateTo = String(req.query.dateTo ?? "").trim();
    const boxId = String(req.query.boxId ?? "").trim();
    const article = String(req.query.article ?? "").trim().toLowerCase();
    const brand = String(req.query.brand ?? "").trim().toLowerCase();
    const limitRaw = Number(req.query.limit ?? 25);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.trunc(limitRaw))) : 25;

    const params: unknown[] = [`%${q}%`];
    const filters: string[] = [];
    if (dateFrom) {
      params.push(dateFrom);
      filters.push(`s.source_document_date >= $${params.length}::date`);
    }
    if (dateTo) {
      params.push(dateTo);
      filters.push(`s.source_document_date <= $${params.length}::date`);
    }
    if (boxId) {
      params.push(pgIlikeContainsPattern(boxId));
      filters.push(`s.box_id ilike $${params.length} escape '\\'`);
    }
    if (article) {
      params.push(article);
      filters.push(`lower(coalesce(i.article,'')) like '%' || $${params.length} || '%'`);
    }
    if (brand) {
      params.push(brand);
      filters.push(`lower(coalesce(i.brand,'')) like '%' || $${params.length} || '%'`);
    }

    const exactSql = `
      select
        'summary'::text as source,
        s.box_id as id,
        s.box_id as "boxId",
        coalesce(s.claim_number, s.box_id, 'WB summary') as title,
        left(coalesce(s.description, ''), 350) as snippet,
        1.0::float as score,
        jsonb_build_object(
          'boxId', s.box_id,
          'claimNumber', s.claim_number,
          'declared', s.declared,
          'documentNumber', s.source_document_number,
          'documentDate', s.source_document_date,
          'rowNumber', s.source_row_number,
          'description', s.description,
          'costRub', s.cost_rub,
          'article', i.article,
          'brand', i.brand
        ) as payload
      from wb_summary s
      left join wb_inbound_items i on i.id = s.inbound_item_id
      where (
        s.box_id ilike $1
        or coalesce(s.claim_number, '') ilike $1
        or coalesce(s.source_document_number, '') ilike $1
        or coalesce(s.description, '') ilike $1
        or coalesce(i.article, '') ilike $1
        or coalesce(i.brand, '') ilike $1
      )
      ${filters.length ? `and ${filters.join(" and ")}` : ""}
      order by s.updated_at desc
      limit ${Math.max(50, limit * 2)}
    `;
    const exactRes = await pool.query<SearchRow>(exactSql, params);
    const exactRows = exactRes.rows ?? [];

    let semanticRows: SearchRow[] = [];
    try {
      const rag = await searchSimilar(q, {
        topK: Math.max(limit * 2, 30),
        minScore: 0.25,
        sourceTypes: ["wb_inbound", "wb_returned", "wb_claims"],
      });
      semanticRows = rag.map((row) => {
        const metadata = row.metadata ?? {};
        const src = row.sourceType === "wb_inbound" ? "inbound" : row.sourceType === "wb_returned" ? "returned" : "claims";
        const id = `${row.sourceType}:${row.sourceId}`;
        return {
          source: src,
          id,
          boxId: (metadata.boxId as string | undefined) ?? null,
          title: row.title || id,
          snippet: row.content,
          score: Number(row.score ?? 0),
          payload: {
            sourceType: row.sourceType,
            sourceId: row.sourceId,
            metadata,
          },
        };
      });
    } catch {
      // best-effort: search must still work via SQL
    }

    const merged = new Map<string, SearchRow>();
    for (const row of exactRows) merged.set(`${row.source}:${row.id}`, { ...row, score: Math.max(row.score, 1.2) });
    for (const row of semanticRows) {
      const key = `${row.source}:${row.id}`;
      if (!merged.has(key)) merged.set(key, row);
      else {
        const prev = merged.get(key)!;
        merged.set(key, { ...prev, score: Math.max(prev.score, row.score + 0.25) });
      }
    }

    const items = [...merged.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return res.status(200).json({
      q,
      total: items.length,
      items,
      request_id: ctx.requestId,
    });
  } catch (error) {
    logError(ctx, "wildberries_search_failed", error);
    return res.status(500).json({ error: "Ошибка поиска WB", request_id: ctx.requestId });
  }
}


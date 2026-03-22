import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../../_db.js";
import { initRequestContext, logError } from "../../_lib/observability.js";
import { pgTableExists, resolveWbAccess } from "../../_wb.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "wb_summary_filter_options");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  try {
    const pool = getPool();
    const access = await resolveWbAccess(req, pool, "read");
    if (!access) return res.status(401).json({ error: "Нет доступа", request_id: ctx.requestId });

    if (!(await pgTableExists(pool, "wb_summary"))) {
      return res.status(200).json({ statuses: [], boxes: [], inventories: [], request_id: ctx.requestId });
    }

    const hasLp = await pgTableExists(pool, "wb_logistics_parcel");
    const hasPostbCache = await pgTableExists(pool, "wb_postb_posilka_cache");
    const postbParcelKeyExpr = `lower(trim(nullif(coalesce(nullif(trim(i.box_shk), ''), nullif(trim(s.shk), ''), nullif(trim(c.shk), ''), ''), '')))`;
    const postbJoinSql = hasPostbCache
      ? `left join wb_postb_posilka_cache ppc on ppc.posilka_code_norm = ${postbParcelKeyExpr}`
      : "";
    const fromJoins = hasLp
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

    const baseWhere = "where s.declared = true";

    const statuses = hasPostbCache
      ? (
          await pool.query<{ v: string }>(
            `select distinct nullif(trim(ppc.last_status), '') as v
             ${fromJoins}
             ${baseWhere}
               and nullif(trim(ppc.last_status), '') is not null
             order by 1
             limit 500`,
          )
        ).rows
          .map((r) => r.v)
          .filter(Boolean)
      : [];

    const boxes = (
      await pool.query<{ v: string }>(
        `select distinct nullif(trim(s.box_id), '') as v
         ${fromJoins}
         ${baseWhere}
           and nullif(trim(s.box_id), '') is not null
         order by 1
         limit 2000`,
      )
    ).rows
      .map((r) => r.v)
      .filter(Boolean);

    const inventories = (
      await pool.query<{ v: string }>(
        `select distinct nullif(trim(i.inventory_number), '') as v
         ${fromJoins}
         ${baseWhere}
           and nullif(trim(i.inventory_number), '') is not null
         order by 1
         limit 500`,
      )
    ).rows
      .map((r) => r.v)
      .filter(Boolean);

    res.setHeader("Cache-Control", "private, max-age=30");
    return res.status(200).json({
      statuses,
      boxes,
      inventories,
      request_id: ctx.requestId,
    });
  } catch (error) {
    logError(ctx, "wb_summary_filter_options_failed", error);
    return res.status(500).json({ error: "Ошибка загрузки фильтров", request_id: ctx.requestId });
  }
}

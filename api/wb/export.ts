import type { VercelRequest, VercelResponse } from "@vercel/node";
import * as XLSX from "xlsx";
import { getPool } from "../_db.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import { pgTableExists, resolveWbAccess } from "../_wb.js";
import { resolveWb1cForBoxShk, type Wb1cShkLookupRow } from "../lib/wb1cShkResolve.js";

function toCsv(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0] || {});
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [headers.map(esc).join(",")];
  for (const row of rows) lines.push(headers.map((h) => esc(row[h])).join(","));
  return lines.join("\n");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "wb_export");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  try {
    const pool = getPool();
    const access = await resolveWbAccess(req, pool, "read");
    if (!access) return res.status(401).json({ error: "Нет доступа", request_id: ctx.requestId });

    const block = String(req.query.block ?? "summary").trim().toLowerCase();
    const format = String(req.query.format ?? "csv").trim().toLowerCase() === "xlsx" ? "xlsx" : "csv";
    const q = String(req.query.q ?? "").trim();
    const filterLogisticsStatus = String(req.query.filterLogisticsStatus ?? "").trim();
    const filterBoxExact = String(req.query.filterBoxExact ?? "").trim();
    const filterInventoryExact = String(req.query.filterInventoryExact ?? "").trim();
    const params: unknown[] = [];
    const whereQ = q
      ? (() => {
          params.push(`%${q}%`);
          return params.length;
        })()
      : null;

    let rows: Record<string, unknown>[] = [];
    if (block === "inbound") {
      if (await pgTableExists(pool, "wb_inbound_items")) {
        rows = (
          await pool.query(
            `select inventory_number, inventory_created_at, box_number, box_shk, shk, sticker, barcode, article, brand, nomenclature, description, kit, price_rub, mass_kg
             from wb_inbound_items
             ${whereQ ? `where box_number ilike $${whereQ} or coalesce(box_shk,'') ilike $${whereQ} or shk ilike $${whereQ} or coalesce(article,'') ilike $${whereQ} or coalesce(brand,'') ilike $${whereQ} or coalesce(description,'') ilike $${whereQ}` : ""}
             order by id desc
             limit 10000`,
            params,
          )
        ).rows;
      }
    } else if (block === "returned") {
      if (await pgTableExists(pool, "wb_returned_items")) {
        rows = (
          await pool.query(
            `select * from (
               select
                 box_id,
                 cargo_number,
                 description,
                 has_shk,
                 document_number,
                 document_date,
                 amount_rub,
                 source_row_number,
                 source,
                 created_at,
                 row_number() over (
                   partition by
                     coalesce(nullif(trim(document_number), ''), ''),
                     coalesce(batch_id::text, '0')
                   order by source_row_number nulls last, id asc
                 )::int as document_line_number
               from wb_returned_items
               ${whereQ ? `where box_id ilike $${whereQ} or coalesce(cargo_number,'') ilike $${whereQ} or coalesce(description,'') ilike $${whereQ}` : ""}
             ) sub
             order by created_at desc
             limit 10000`,
            params,
          )
        ).rows;
      }
    } else if (block === "claims") {
      if (
        (await pgTableExists(pool, "wb_claims_items")) &&
        (await pgTableExists(pool, "wb_claims_revisions"))
      ) {
        rows = (
          await pool.query(
            `select c.claim_number, c.box_id, c.shk, c.doc_number, c.doc_date, c.description, c.amount_rub, c.row_number, r.revision_number, r.uploaded_at
             from wb_claims_items c
             join wb_claims_revisions r on r.id = c.revision_id
             where r.is_active = true
             ${whereQ ? `and (coalesce(c.claim_number,'') ilike $${whereQ} or coalesce(c.box_id,'') ilike $${whereQ} or coalesce(c.shk,'') ilike $${whereQ} or coalesce(c.description,'') ilike $${whereQ} or c.all_columns::text ilike $${whereQ})` : ""}
             order by c.id desc
             limit 10000`,
            params,
          )
        ).rows;
      }
    } else {
      if (await pgTableExists(pool, "wb_summary")) {
        const hasLp = await pgTableExists(pool, "wb_logistics_parcel");
        const hasPostbCache = await pgTableExists(pool, "wb_postb_posilka_cache");
        const postbParcelKeyExpr = `lower(trim(nullif(coalesce(nullif(trim(i.box_shk), ''), nullif(trim(s.shk), ''), nullif(trim(c.shk), ''), ''), '')))`;
        const postbJoinSql = hasPostbCache
          ? `left join wb_postb_posilka_cache ppc on ppc.posilka_code_norm = ${postbParcelKeyExpr}`
          : "";
        const fromJoins = hasLp
          ? `from wb_summary s
             left join wb_claims_items c on c.id = s.claim_item_id
             left join wb_inbound_items i on i.id = s.inbound_item_id
             left join wb_logistics_parcel lp on lower(trim(lp.parcel_key)) = ${postbParcelKeyExpr}
             ${postbJoinSql}`
          : `from wb_summary s
             left join wb_claims_items c on c.id = s.claim_item_id
             left join wb_inbound_items i on i.id = s.inbound_item_id
             ${postbJoinSql}`;
        const lvCols = hasLp
          ? `lp.perevozka_nasha as lv_perevozka_nasha,
               lp.otchet_dostavki as lv_otchet_dostavki,
               lp.otpavka_ap as lv_otpavka_ap,
               lp.logistics_status as lv_logistics_status,
               lp.data_info_received as lv_data_info,
               lp.data_packed as lv_data_upakovano,
               lp.data_consolidated as lv_data_konsolidirovano,
               lp.data_departed as lv_data_uletelo,
               lp.data_to_hand as lv_data_k_vrucheniyu,
               lp.data_delivered as lv_data_dostavleno`
          : `null::text as lv_perevozka_nasha,
               null::text as lv_otchet_dostavki,
               null::text as lv_otpavka_ap,
               null::text as lv_logistics_status,
               null::text as lv_data_info,
               null::text as lv_data_upakovano,
               null::text as lv_data_konsolidirovano,
               null::text as lv_data_uletelo,
               null::text as lv_data_k_vrucheniyu,
               null::text as lv_data_dostavleno`;

        const postbCols = hasPostbCache
          ? `coalesce(nullif(trim(ppc.last_status), ''), '') as postb_last_status,
               coalesce(nullif(trim(ppc.perevozka), ''), '') as postb_perevozka,
               coalesce(ppc.posilka_steps::text, '[]') as postb_posilka_steps`
          : `''::text as postb_last_status,
               ''::text as postb_perevozka,
               '[]'::text as postb_posilka_steps`;

        const sparams: unknown[] = [];
        const extraParts: string[] = [];
        if (filterLogisticsStatus && hasLp) {
          sparams.push(filterLogisticsStatus);
          extraParts.push(`coalesce(nullif(trim(lp.logistics_status), ''), '') = $${sparams.length}`);
        }
        if (filterBoxExact) {
          sparams.push(filterBoxExact);
          extraParts.push(`nullif(trim(s.box_id), '') = $${sparams.length}`);
        }
        if (filterInventoryExact) {
          sparams.push(filterInventoryExact);
          extraParts.push(`nullif(trim(i.inventory_number), '') = $${sparams.length}`);
        }
        let qIdx: number | null = null;
        if (q) {
          sparams.push(`%${q}%`);
          qIdx = sparams.length;
        }
        const extraSql = extraParts.length ? ` and ${extraParts.join(" and ")}` : "";
        const qFilter = qIdx
          ? hasLp
            ? `and (s.box_id ilike $${qIdx} or coalesce(s.shk,'') ilike $${qIdx} or coalesce(s.claim_number,'') ilike $${qIdx} or coalesce(s.description,'') ilike $${qIdx} or coalesce(c.description,'') ilike $${qIdx} or coalesce(i.inventory_number,'') ilike $${qIdx} or coalesce(i.shk,'') ilike $${qIdx} or coalesce(i.box_shk,'') ilike $${qIdx} or coalesce(lp.perevozka_nasha,'') ilike $${qIdx} or coalesce(lp.otchet_dostavki,'') ilike $${qIdx} or coalesce(lp.otpavka_ap,'') ilike $${qIdx} or coalesce(lp.logistics_status,'') ilike $${qIdx} or coalesce(lp.data_info_received,'') ilike $${qIdx} or coalesce(lp.data_packed,'') ilike $${qIdx} or coalesce(lp.data_consolidated,'') ilike $${qIdx} or coalesce(lp.data_departed,'') ilike $${qIdx} or coalesce(lp.data_to_hand,'') ilike $${qIdx} or coalesce(lp.data_delivered,'') ilike $${qIdx})`
            : `and (s.box_id ilike $${qIdx} or coalesce(s.shk,'') ilike $${qIdx} or coalesce(s.claim_number,'') ilike $${qIdx} or coalesce(s.description,'') ilike $${qIdx} or coalesce(c.description,'') ilike $${qIdx} or coalesce(i.inventory_number,'') ilike $${qIdx} or coalesce(i.shk,'') ilike $${qIdx} or coalesce(i.box_shk,'') ilike $${qIdx})`
          : "";
        const rawRows = (
          await pool.query(
            `select
               coalesce(nullif(trim(c.shk), ''), nullif(trim(s.shk), ''), nullif(trim(i.shk), '')) as shk,
               s.box_id as box_id,
               s.claim_number as claim_number,
               c.row_number as claim_row_number,
               c.amount_rub as claim_price_rub,
               i.inventory_number as inventory_number,
               i.row_number as inbound_row_number,
               coalesce(nullif(trim(i.description), ''), nullif(trim(i.nomenclature), '')) as inbound_title,
               i.price_rub as inbound_price_rub,
               (s.inbound_item_id is not null) as has_inbound,
               ((coalesce(s.is_returned, false)) or (s.returned_item_id is not null)) as is_returned,
               s.updated_at as updated_at,
               nullif(trim(coalesce(i.box_shk, '')), '') as inbound_box_shk,
               ${lvCols},
               ${postbCols}
             ${fromJoins}
             where s.declared = true
             ${extraSql}
             ${qFilter}
             order by coalesce(c.row_number, 0), coalesce(s.shk, s.box_id, '')
             limit 10000`,
            sparams,
          )
        ).rows as Record<string, unknown>[];

        let lookup1c: Wb1cShkLookupRow[] = [];
        if (await pgTableExists(pool, "wb_1c_shk_status")) {
          try {
            const r1c = await pool.query<{
              shk: string;
              status_1c: string;
              cargo_number: string;
            }>("select shk, status_1c, cargo_number from wb_1c_shk_status");
            lookup1c = r1c.rows.map((row) => ({
              shk: String(row.shk ?? ""),
              status1c: String(row.status_1c ?? ""),
              cargoNumber: String(row.cargo_number ?? ""),
            }));
          } catch {
            lookup1c = [];
          }
        }

        rows = rawRows.map((r) => {
          const { inbound_box_shk, ...base } = r;
          const resolved = resolveWb1cForBoxShk(String(inbound_box_shk ?? ""), lookup1c);
          return { ...base, box_shk: inbound_box_shk ?? "", status1c: resolved.status1c };
        });
      }
    }

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    if (format === "xlsx") {
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, block);
      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="wb_${block}_${stamp}.xlsx"`);
      return res.status(200).send(buffer);
    }

    const csv = toCsv(rows);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="wb_${block}_${stamp}.csv"`);
    return res.status(200).send(`\uFEFF${csv}`);
  } catch (error) {
    logError(ctx, "wb_export_failed", error);
    return res.status(500).json({ error: "Ошибка экспорта", request_id: ctx.requestId });
  }
}


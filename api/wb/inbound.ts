import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import { resolveWbAccess } from "../_wb.js";

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

    const limitRaw = Number(req.query.limit ?? 50);
    const pageRaw = Number(req.query.page ?? 1);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.trunc(limitRaw))) : 50;
    const page = Number.isFinite(pageRaw) ? Math.max(1, Math.trunc(pageRaw)) : 1;
    const offset = (page - 1) * limit;

    const dateFrom = String(req.query.dateFrom ?? "").trim();
    const dateTo = String(req.query.dateTo ?? "").trim();
    const inventoryNumber = String(req.query.inventoryNumber ?? "").trim();
    const boxId = String(req.query.boxId ?? "").trim();
    const article = String(req.query.article ?? "").trim();
    const brand = String(req.query.brand ?? "").trim();
    const q = String(req.query.q ?? "").trim();

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
      params.push(boxId);
      where.push(`i.box_number = $${params.length}`);
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
        or coalesce(i.article, '') ilike $${params.length}
        or coalesce(i.brand, '') ilike $${params.length}
        or coalesce(i.description, '') ilike $${params.length}
        or coalesce(i.nomenclature, '') ilike $${params.length}
      )`);
    }

    const whereSql = where.length ? `where ${where.join(" and ")}` : "";
    const countSql = `select count(*)::int as total from wb_inbound_items i ${whereSql}`;
    const countRes = await pool.query<{ total: number }>(countSql, params);
    const total = countRes.rows[0]?.total ?? 0;

    const dataParams = [...params, limit, offset];
    const rowsSql = `
      select
        i.id,
        i.inventory_number as "inventoryNumber",
        i.inventory_created_at as "inventoryCreatedAt",
        i.row_number as "rowNumber",
        i.box_number as "boxNumber",
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
        i.tnv_ed as "tnvEd",
        i.mass_kg as "massKg",
        i.created_at as "createdAt"
      from wb_inbound_items i
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
      items: dataRes.rows,
      request_id: ctx.requestId,
    });
  } catch (error) {
    logError(ctx, "wb_inbound_list_failed", error);
    return res.status(500).json({ error: "Ошибка загрузки принятых грузов", request_id: ctx.requestId });
  }
}


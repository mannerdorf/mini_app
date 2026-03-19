import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../../_db.js";
import { initRequestContext, logError } from "../../_lib/observability.js";
import { pgTableExists, rebuildWbSummary, resolveWbAccess } from "../../_wb.js";
import { writeAuditLog } from "../../../lib/adminAuditLog.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "wb_inbound_delete_inventory");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  try {
    const pool = getPool();
    const access = await resolveWbAccess(req, pool, "write");
    if (!access) return res.status(401).json({ error: "Доступ только для админа", request_id: ctx.requestId });

    if (!(await pgTableExists(pool, "wb_inbound_items"))) {
      return res.status(400).json({ error: "Таблица ввозных описей не найдена", request_id: ctx.requestId });
    }

    const body = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
    const inventoryNumber = String(body.inventoryNumber ?? "").trim();
    if (!inventoryNumber) {
      return res.status(400).json({ error: "Укажите номер ведомости (inventoryNumber)", request_id: ctx.requestId });
    }

    const del = await pool.query<{ id: number }>(
      `delete from wb_inbound_items where inventory_number = $1 returning id`,
      [inventoryNumber],
    );
    const deleted = del.rowCount ?? 0;

    await rebuildWbSummary(pool);

    await writeAuditLog(pool, {
      action: "wb_inbound_delete_inventory",
      target_type: "wb_inbound_inventory",
      target_id: null,
      details: { inventoryNumber, deleted, deletedBy: access.login },
    });

    return res.status(200).json({
      ok: true,
      inventoryNumber,
      deleted,
      request_id: ctx.requestId,
    });
  } catch (error) {
    logError(ctx, "wb_inbound_delete_inventory_failed", error);
    return res.status(500).json({ error: "Ошибка удаления ведомости", request_id: ctx.requestId });
  }
}

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../../_db.js";
import { initRequestContext, logError } from "../../_lib/observability.js";
import { parseBooleanFlag, parseDateOnly, parseNum, rebuildWbSummary, resolveWbAccess } from "../../_wb.js";
import { writeAuditLog } from "../../../lib/adminAuditLog.js";
import { upsertDocument } from "../../../lib/rag.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "wb_returned_manual");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  try {
    const pool = getPool();
    const access = await resolveWbAccess(req, pool, "write");
    if (!access) return res.status(401).json({ error: "Доступ только для админа", request_id: ctx.requestId });

    const body = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
    const boxId = String(body.boxId ?? "").trim();
    const cargoNumber = String(body.cargoNumber ?? "").trim();
    const description = String(body.description ?? "").trim();
    const hasShk = parseBooleanFlag(body.hasShk, false);
    const documentNumber = String(body.documentNumber ?? "").trim();
    const documentDate = parseDateOnly(body.documentDate);
    const amountRub = parseNum(body.amountRub);
    if (!boxId) return res.status(400).json({ error: "boxId обязателен", request_id: ctx.requestId });

    const result = await pool.query<{ id: number }>(
      `insert into wb_returned_items (
         source, box_id, cargo_number, description, has_shk, document_number, document_date, amount_rub, raw_row
       ) values (
         'manual', $1, $2, $3, $4, $5, $6::date, $7, $8::jsonb
       ) returning id`,
      [
        boxId,
        cargoNumber || null,
        description || null,
        hasShk,
        documentNumber || null,
        documentDate,
        amountRub || null,
        JSON.stringify(body),
      ],
    );
    const id = result.rows[0]?.id;

    await writeAuditLog(pool, {
      action: "wb_returned_manual_create",
      target_type: "wb_returned_item",
      target_id: id,
      details: { boxId, uploadedBy: access.login },
    });
    await rebuildWbSummary(pool);

    try {
      await upsertDocument({
        sourceType: "wb_returned",
        sourceId: `${boxId}:manual:${id}`,
        title: "WB returned manual",
        content: [
          `ID коробки: ${boxId}`,
          `Номер груза: ${cargoNumber || "-"}`,
          `Документ: ${documentNumber || "-"}`,
          `Дата: ${documentDate || "-"}`,
          `Описание: ${description || "-"}`,
          `Стоимость: ${amountRub || 0}`,
        ].join("\n"),
        metadata: { block: "returned", source: "manual", boxId, cargoNumber, documentNumber },
      });
    } catch {
      // best-effort
    }

    return res.status(200).json({ ok: true, id, request_id: ctx.requestId });
  } catch (error) {
    logError(ctx, "wb_returned_manual_failed", error);
    return res.status(500).json({ error: "Ошибка сохранения ручного возврата", request_id: ctx.requestId });
  }
}


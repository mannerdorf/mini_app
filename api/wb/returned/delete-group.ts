import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../../_db.js";
import { initRequestContext, logError } from "../../_lib/observability.js";
import { pgTableExists, rebuildWbSummary, resolveWbAccess } from "../../_wb.js";
import { writeAuditLog } from "../../../lib/adminAuditLog.js";

function parseBody(req: VercelRequest): Record<string, unknown> {
  if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
    return req.body as Record<string, unknown>;
  }
  return {};
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "wb_returned_delete_group");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  try {
    const pool = getPool();
    const access = await resolveWbAccess(req, pool, "write");
    if (!access) return res.status(401).json({ error: "Нет доступа", request_id: ctx.requestId });

    if (!(await pgTableExists(pool, "wb_returned_items"))) {
      return res.status(400).json({ error: "Таблица возвратов не найдена", request_id: ctx.requestId });
    }

    const body = parseBody(req);
    const documentNumber = body.documentNumber != null ? String(body.documentNumber).trim() : "";
    const batchRaw = body.batchId;
    const batchId =
      batchRaw === null || batchRaw === undefined || batchRaw === ""
        ? null
        : typeof batchRaw === "number" && Number.isFinite(batchRaw)
          ? Math.trunc(batchRaw)
          : Number(String(batchRaw).trim());

    if (batchId !== null && !Number.isFinite(batchId)) {
      return res.status(400).json({ error: "Некорректный batchId", request_id: ctx.requestId });
    }

    const docKey = documentNumber;

    const del = await pool.query<{ id: number }>(
      `delete from wb_returned_items r
       where coalesce(nullif(trim(r.document_number), ''), '') = $1
         and r.batch_id is not distinct from $2::bigint
       returning id`,
      [docKey, batchId],
    );
    const deleted = del.rowCount ?? 0;

    await rebuildWbSummary(pool);

    await writeAuditLog(pool, {
      action: "wb_returned_delete_group",
      target_type: "wb_returned_group",
      target_id: null,
      details: { documentNumber: docKey || null, batchId, deleted, deletedBy: access.login },
    });

    return res.status(200).json({
      ok: true,
      deleted,
      request_id: ctx.requestId,
    });
  } catch (error) {
    logError(ctx, "wb_returned_delete_group_failed", error);
    return res.status(500).json({ error: "Ошибка удаления группы возвратов", request_id: ctx.requestId });
  }
}

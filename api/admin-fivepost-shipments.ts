import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminTokenFromRequest, getAdminTokenPayload } from "../lib/adminAuth.js";
import { getPool } from "./_db.js";
import { initRequestContext, logError } from "./_lib/observability.js";
import { pgTableExists } from "./_haulzReturns.js";
import { listFivepostBatches, listFivepostRows } from "../lib/fivepost/importBatch.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "admin_fivepost_shipments");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const token = getAdminTokenFromRequest(req);
  const payload = getAdminTokenPayload(token);
  if (!(payload as { admin?: boolean })?.admin) {
    return res.status(401).json({ error: "Требуется авторизация админа", request_id: ctx.requestId });
  }

  const pool = getPool();
  if (!(await pgTableExists(pool, "fivepost_import_batches"))) {
    return res.status(503).json({
      error: "Выполните миграцию migrations/088_fivepost_shipments.sql",
      request_id: ctx.requestId,
    });
  }

  try {
    const batchIdRaw = String(req.query.batchId ?? "").trim();
    if (!batchIdRaw) {
      const batches = await listFivepostBatches(pool, 30);
      return res.status(200).json({ batches, request_id: ctx.requestId });
    }

    const batchId = Number(batchIdRaw);
    if (!Number.isFinite(batchId) || batchId < 1) {
      return res.status(400).json({ error: "Некорректный batchId", request_id: ctx.requestId });
    }

    const rows = await listFivepostRows(pool, batchId);
    return res.status(200).json({ batchId, rows, request_id: ctx.requestId });
  } catch (e) {
    logError(ctx, "admin_fivepost_shipments_failed", e);
    return res.status(500).json({
      error: (e as Error)?.message || "Ошибка загрузки отгрузок 5 POST",
      request_id: ctx.requestId,
    });
  }
}

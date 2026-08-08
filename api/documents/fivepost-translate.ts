import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import { pgTableExists } from "../_haulzReturns.js";
import { translateFivepostBatch } from "../../lib/fivepost/importBatch.js";
import { resolveProductNameTranslator } from "../../lib/fivepost/productNameTranslate.js";
import { parseJsonBody, resolveDocumentsOrderAccess } from "../_documentsOrder.js";
import { isFivepostCustomer } from "../../lib/fivepost/customerAccess.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "documents_fivepost_translate");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const pool = getPool();
  if (!(await pgTableExists(pool, "fivepost_import_batches"))) {
    return res.status(503).json({
      error: "Сервис перевода 5 POST временно недоступен",
      request_id: ctx.requestId,
    });
  }

  if (!resolveProductNameTranslator()) {
    return res.status(503).json({
      error: "YANDEX_TRANSLATE_API_KEY или OPENAI_API_KEY не настроен на сервере API",
      request_id: ctx.requestId,
    });
  }

  const body = parseJsonBody(req);
  const access = await resolveDocumentsOrderAccess(req, body);
  if (!access) {
    return res.status(401).json({ error: "Нет доступа", request_id: ctx.requestId });
  }
  if (!isFivepostCustomer(access.customerInn, access.customerName)) {
    return res.status(403).json({ error: "Перевод 5 POST недоступен для этого заказчика", request_id: ctx.requestId });
  }

  const batchId = Number(body.batchId ?? body.batch_id);
  if (!Number.isFinite(batchId) || batchId < 1) {
    return res.status(400).json({ error: "Некорректный batchId", request_id: ctx.requestId });
  }

  try {
    const { rows: ownerRows } = await pool.query<{ login: string }>(
      `select login from fivepost_import_batches where id = $1 limit 1`,
      [batchId],
    );
    const ownerLogin = String(ownerRows[0]?.login ?? "").trim().toLowerCase();
    if (ownerLogin && ownerLogin !== access.loginKey) {
      return res.status(403).json({ error: "Нет доступа к этому пакету", request_id: ctx.requestId });
    }

    const result = await translateFivepostBatch(pool, batchId);

    return res.status(200).json({
      batchId,
      rowCount: result.rows.length,
      translatedCount: result.translatedCount,
      needsTranslationCount: result.needsTranslationCount,
      rows: result.rows,
      request_id: ctx.requestId,
    });
  } catch (e) {
    logError(ctx, "documents_fivepost_translate_failed", e);
    return res.status(500).json({
      error: (e as Error)?.message || "Ошибка перевода 5 POST",
      request_id: ctx.requestId,
    });
  }
}

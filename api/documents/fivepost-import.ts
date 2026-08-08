import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import { pgTableExists } from "../_haulzReturns.js";
import { parseMultipart } from "../_pnl-multipart.js";
import { importFivepostShipmentXlsx } from "../../lib/fivepost/importBatch.js";
import { resolveOpenaiApiKey } from "../../lib/haulzReturns/openaiEnv.js";
import { resolveDocumentsOrderAccess } from "../_documentsOrder.js";
import { isFivepostCustomer } from "../../lib/fivepost/customerAccess.js";
import type { FivepostRoute } from "../../lib/fivepost/types.js";

export const config = { api: { bodyParser: false } };

function readRoute(value: unknown): FivepostRoute | undefined {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "mow_kgd" || raw === "kgd_mow") return raw;
  return undefined;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "documents_fivepost_import");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const pool = getPool();
  if (!(await pgTableExists(pool, "fivepost_import_batches"))) {
    return res.status(503).json({
      error: "Сервис импорта 5 POST временно недоступен",
      request_id: ctx.requestId,
    });
  }

  if (!resolveOpenaiApiKey()) {
    return res.status(503).json({
      error: "Сервис перевода временно недоступен",
      request_id: ctx.requestId,
    });
  }

  try {
    const { files, fields } = await parseMultipart(req);
    const access = await resolveDocumentsOrderAccess(req, fields);
    if (!access) {
      return res.status(401).json({ error: "Нет доступа", request_id: ctx.requestId });
    }
    if (!isFivepostCustomer(access.customerInn, access.customerName)) {
      return res.status(403).json({ error: "Импорт 5 POST недоступен для этого заказчика", request_id: ctx.requestId });
    }

    const file = files.find((f) => f.fieldName === "file");
    if (!file?.buffer?.length) {
      return res.status(400).json({ error: "Файл не передан", request_id: ctx.requestId });
    }

    const route = readRoute(fields.route);
    const translate = String(fields.translate ?? "1").trim() !== "0";

    const result = await importFivepostShipmentXlsx(pool, {
      buffer: file.buffer,
      filename: file.originalFilename || "fivepost.xlsx",
      login: access.login,
      route,
      translate,
    });

    return res.status(200).json({
      batchId: result.batchId,
      rowCount: result.rows.length,
      translatedCount: result.translatedCount,
      rows: result.rows,
      request_id: ctx.requestId,
    });
  } catch (e) {
    logError(ctx, "documents_fivepost_import_failed", e);
    return res.status(500).json({
      error: (e as Error)?.message || "Ошибка импорта 5 POST",
      request_id: ctx.requestId,
    });
  }
}

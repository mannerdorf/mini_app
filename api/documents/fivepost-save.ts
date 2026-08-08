import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import { pgTableExists } from "../_haulzReturns.js";
import { saveFivepostParsedRows } from "../../lib/fivepost/importBatch.js";
import { parseJsonBody, resolveDocumentsOrderAccess } from "../_documentsOrder.js";
import { isFivepostCustomer } from "../../lib/fivepost/customerAccess.js";
import type { FivepostParsedRow, FivepostRoute } from "../../lib/fivepost/types.js";

function readRoute(value: unknown): FivepostRoute | undefined {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "mow_kgd" || raw === "kgd_mow") return raw;
  return undefined;
}

function parseParsedRows(raw: unknown): FivepostParsedRow[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw
    .filter((row) => row && typeof row === "object")
    .map((row) => {
      const o = row as Record<string, unknown>;
      const num = (v: unknown) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      };
      return {
        clientOrderNo: String(o.clientOrderNo ?? o.client_order_no ?? "").trim(),
        partnerOrderNo: String(o.partnerOrderNo ?? o.partner_order_no ?? "").trim(),
        teBarcode: String(o.teBarcode ?? o.te_barcode ?? "").trim(),
        placesCount: Math.max(1, Math.round(Number(o.placesCount ?? o.places_count) || 1)),
        omniBarcode: String(o.omniBarcode ?? o.omni_barcode ?? "").trim(),
        itemName: String(o.itemName ?? o.item_name ?? "").trim(),
        unitCost: num(o.unitCost ?? o.unit_cost),
        totalCost: num(o.totalCost ?? o.total_cost),
        weightG: num(o.weightG ?? o.weight_g),
        lengthMm: num(o.lengthMm ?? o.length_mm),
        widthMm: num(o.widthMm ?? o.width_mm),
        heightMm: num(o.heightMm ?? o.height_mm),
      };
    })
    .filter((row) => row.itemName || row.clientOrderNo || row.partnerOrderNo);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "documents_fivepost_save");
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

  const body = parseJsonBody(req);
  const access = await resolveDocumentsOrderAccess(req, body);
  if (!access) {
    return res.status(401).json({ error: "Нет доступа", request_id: ctx.requestId });
  }
  if (!isFivepostCustomer(access.customerInn, access.customerName)) {
    return res.status(403).json({ error: "Импорт 5 POST недоступен для этого заказчика", request_id: ctx.requestId });
  }

  const rows = parseParsedRows(body.rows);
  if (!rows.length) {
    return res.status(400).json({ error: "Нет строк для сохранения", request_id: ctx.requestId });
  }

  const filename = String(body.filename ?? body.file_name ?? "fivepost.xlsx").trim() || "fivepost.xlsx";
  const route = readRoute(body.route);

  try {
    const result = await saveFivepostParsedRows(pool, {
      login: access.login,
      filename,
      route,
      rows,
    });

    return res.status(200).json({
      batchId: result.batchId,
      rowCount: result.rows.length,
      translatedCount: result.translatedCount,
      needsTranslationCount: result.needsTranslationCount,
      rows: result.rows,
      request_id: ctx.requestId,
    });
  } catch (e) {
    logError(ctx, "documents_fivepost_save_failed", e);
    return res.status(500).json({
      error: (e as Error)?.message || "Ошибка сохранения 5 POST",
      request_id: ctx.requestId,
    });
  }
}

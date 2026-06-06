import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import { pgTableExists } from "../_haulzReturns.js";
import { getClientIp, isRateLimited, HAULZ_CALC_QUOTE_LIMIT } from "../../lib/rateLimit.js";
import { buildQuote } from "../../lib/haulzCalculator/quoteEngine.js";
import {
  buildQuoteRequestFromBody,
  parseJsonBody,
  resolveDocumentsOrderAccess,
} from "../_documentsOrder.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "documents_order_quote");
  if (isRateLimited("documents_order_quote", getClientIp(req), HAULZ_CALC_QUOTE_LIMIT)) {
    return res.status(429).json({ error: "Слишком много запросов расчёта", request_id: ctx.requestId });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const body = parseJsonBody(req);
  const access = await resolveDocumentsOrderAccess(req, body);
  if (!access) {
    return res.status(401).json({ error: "Нет доступа", request_id: ctx.requestId });
  }

  const pool = getPool();
  if (!(await pgTableExists(pool, "haulz_calc_tariff_sets"))) {
    return res.status(503).json({
      error: "Выполните миграцию migrations/083_haulz_calculator.sql",
      request_id: ctx.requestId,
    });
  }

  const parsed = buildQuoteRequestFromBody(body, access.customerInn);
  if ("error" in parsed) {
    return res.status(400).json({ error: parsed.error, request_id: ctx.requestId });
  }

  try {
    const quote = await buildQuote(pool, parsed.quoteReq);
    return res.status(200).json({ quote, request_id: ctx.requestId });
  } catch (e) {
    logError(ctx, "documents_order_quote_failed", e);
    return res.status(500).json({
      error: (e as Error)?.message || "Ошибка расчёта",
      request_id: ctx.requestId,
    });
  }
}

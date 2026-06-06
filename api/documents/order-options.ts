import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import { pgTableExists } from "../_haulzReturns.js";
import { loadCalculatorOptions } from "../../lib/haulzCalculator/calculatorOptions.js";
import type { Direction } from "../../lib/haulzCalculator/types.js";
import { parseJsonBody, resolveDocumentsOrderAccess } from "../_documentsOrder.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "documents_order_options");
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const body = req.method === "POST" ? parseJsonBody(req) : {};
  const access = await resolveDocumentsOrderAccess(req, {
    ...body,
    login: req.query.login ?? body.login,
    password: req.query.password ?? body.password,
    inn: req.query.inn ?? body.inn,
    customerInn: req.query.customerInn ?? body.customerInn,
  });
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

  const dirRaw = String(req.query.direction ?? body.direction ?? "mow_kgd").toLowerCase();
  const direction: Direction = dirRaw === "kgd_mow" ? "kgd_mow" : "mow_kgd";
  const chargeable = Math.max(0, Number(req.query.chargeable_kg ?? body.chargeableKg ?? body.chargeable_kg) || 1);

  try {
    const options = await loadCalculatorOptions(pool, direction, chargeable);
    return res.status(200).json({ options, request_id: ctx.requestId });
  } catch (e) {
    logError(ctx, "documents_order_options_failed", e);
    return res.status(500).json({
      error: (e as Error)?.message || "Ошибка",
      request_id: ctx.requestId,
    });
  }
}

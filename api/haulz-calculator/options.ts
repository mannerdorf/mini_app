import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import { pgTableExists } from "../_haulzReturns.js";
import { resolveHaulzCalculatorAccess } from "../_haulzCalculator.js";
import { loadCalculatorOptions } from "../../lib/haulzCalculator/calculatorOptions.js";
import type { Direction } from "../../lib/haulzCalculator/types.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "haulz_calculator_options");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const access = await resolveHaulzCalculatorAccess(req);
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

  const dirRaw = String(req.query.direction ?? "mow_kgd").toLowerCase();
  const direction: Direction = dirRaw === "kgd_mow" ? "kgd_mow" : "mow_kgd";
  const chargeable = Math.max(0, Number(req.query.chargeable_kg) || 1);

  try {
    const options = await loadCalculatorOptions(pool, direction, chargeable);
    return res.status(200).json({ options, request_id: ctx.requestId });
  } catch (e) {
    logError(ctx, "haulz_calculator_options_failed", e);
    return res.status(500).json({
      error: (e as Error)?.message || "Ошибка",
      request_id: ctx.requestId,
    });
  }
}

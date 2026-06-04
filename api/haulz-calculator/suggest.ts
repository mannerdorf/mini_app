import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import { pgTableExists } from "../_haulzReturns.js";
import { resolveHaulzCalculatorAccess } from "../_haulzCalculator.js";
import { getClientIp, isRateLimited, HAULZ_CALC_SUGGEST_LIMIT } from "../../lib/rateLimit.js";
import { suggestAddresses } from "../../lib/haulzCalculator/addressSuggest.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "haulz_calculator_suggest");
  if (isRateLimited("haulz_calc_suggest", getClientIp(req), HAULZ_CALC_SUGGEST_LIMIT)) {
    return res.status(429).json({ error: "Слишком много запросов подсказок", request_id: ctx.requestId });
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const access = await resolveHaulzCalculatorAccess(req);
  if (!access) {
    return res.status(401).json({ error: "Нет доступа", request_id: ctx.requestId });
  }

  const pool = getPool();
  if (!(await pgTableExists(pool, "haulz_calc_api_cache"))) {
    return res.status(503).json({
      error: "Выполните миграцию migrations/083_haulz_calculator.sql",
      request_id: ctx.requestId,
    });
  }

  const q = String(req.query.q ?? "").trim();
  const cityRaw = String(req.query.city ?? "").trim().toLowerCase();
  const city = cityRaw === "moscow" || cityRaw === "kaliningrad" ? cityRaw : undefined;

  if (q.length < 2) {
    return res.status(200).json({ items: [], request_id: ctx.requestId });
  }

  try {
    const items = await suggestAddresses(q, { city }, pool);
    return res.status(200).json({ items, request_id: ctx.requestId });
  } catch (e) {
    logError(ctx, "haulz_calculator_suggest_failed", e);
    return res.status(500).json({
      error: (e as Error)?.message || "Ошибка подсказок адреса",
      request_id: ctx.requestId,
    });
  }
}

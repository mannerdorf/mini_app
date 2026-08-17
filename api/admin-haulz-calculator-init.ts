import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest } from "../lib/adminAuth.js";
import { writeAuditLog } from "../lib/adminAuditLog.js";
import { initRequestContext, logError } from "./_lib/observability.js";
import { bootstrapHaulzCalculatorTariffs, ensureAirMainlineTariffSets } from "../lib/haulzCalculator/bootstrapTariffs.js";
import { pgTableExists } from "./_haulzReturns.js";

function parseIsoDateOnly(value: unknown): string | null {
  const s = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "admin-haulz-calculator-init");
  if (!verifyAdminToken(getAdminTokenFromRequest(req))) {
    return res.status(401).json({ error: "Требуется авторизация админа", request_id: ctx.requestId });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const pool = getPool();
  if (!(await pgTableExists(pool, "haulz_calc_tariff_sets"))) {
    return res.status(503).json({
      error: "Выполните миграцию migrations/083_haulz_calculator.sql",
      request_id: ctx.requestId,
    });
  }

  let body: Record<string, unknown> = {};
  if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
    body = req.body as Record<string, unknown>;
  } else if (typeof req.body === "string") {
    try {
      body = JSON.parse(req.body) as Record<string, unknown>;
    } catch {
      body = {};
    }
  }

  const effectiveFrom =
    parseIsoDateOnly(body.effective_from) ||
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(new Date());

  try {
    const result = await bootstrapHaulzCalculatorTariffs(pool, { effectiveFrom });
    await ensureAirMainlineTariffSets(pool, { effectiveFrom });
    await writeAuditLog(pool, {
      action: "haulz_calc_bootstrap",
      target_type: "haulz_calc_tariff_sets",
      details: { effective_from: effectiveFrom, sets: result.sets },
    });
    return res.status(200).json({ ok: true, ...result, effective_from: effectiveFrom, request_id: ctx.requestId });
  } catch (e) {
    logError(ctx, "admin_haulz_calculator_init_failed", e);
    return res.status(500).json({
      error: (e as Error)?.message || "Ошибка инициализации",
      request_id: ctx.requestId,
    });
  }
}

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { initRequestContext, logError } from "./_lib/observability.js";
import {
  getPnL,
  getCogsByStage,
  getUnitEconomics,
  type FilterParams,
} from "./_pnl-calc.js";

const THRESHOLDS = {
  marginPerKgMin: 5,
  mainlineCogsPercent: 60,
  overheadPercentMax: 15,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "pnl_alerts");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  try {
    const pool = getPool();
    const params: FilterParams = {
      from: (req.query.from as string) || undefined,
      to: (req.query.to as string) || undefined,
      direction: (req.query.direction as string) || undefined,
      transportType: (req.query.transportType as string) || undefined,
    };

    const [pnl, cogsByStage, unitEcon] = await Promise.all([
      getPnL(pool, params),
      getCogsByStage(pool, params),
      getUnitEconomics(pool, params),
    ]);

    const alerts: { type: string; message: string; severity: "warning" | "error" }[] = [];

    if (unitEcon && unitEcon.weightKg > 0) {
      if (unitEcon.marginPerKg < THRESHOLDS.marginPerKgMin && unitEcon.marginPerKg > 0) {
        alerts.push({
          type: "margin_per_kg",
          message: `Маржа / кг (${unitEcon.marginPerKg.toFixed(1)} ₽) ниже порога ${THRESHOLDS.marginPerKgMin} ₽`,
          severity: "warning",
        });
      }
    }

    const totalCogs = cogsByStage.reduce((s, x) => s + x.amount, 0);
    const mainlineCogs = cogsByStage.find((x) => x.stage === "MAINLINE")?.amount ?? 0;
    if (totalCogs > 0 && (mainlineCogs / totalCogs) * 100 > THRESHOLDS.mainlineCogsPercent) {
      alerts.push({
        type: "mainline_cogs",
        message: `Магистраль (${((mainlineCogs / totalCogs) * 100).toFixed(0)}%) > ${THRESHOLDS.mainlineCogsPercent}% COGS`,
        severity: "warning",
      });
    }

    if (pnl.revenue > 0 && (pnl.opex / pnl.revenue) * 100 > THRESHOLDS.overheadPercentMax) {
      alerts.push({
        type: "overhead",
        message: `Overhead (${((pnl.opex / pnl.revenue) * 100).toFixed(0)}%) > ${THRESHOLDS.overheadPercentMax}% выручки`,
        severity: "warning",
      });
    }

    return res.json({ alerts });
  } catch (error) {
    logError(ctx, "pnl_alerts_failed", error);
    const message = error instanceof Error ? error.message : "Ошибка загрузки алертов P&L";
    return res.status(500).json({ error: message, request_id: ctx.requestId });
  }
}

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { ensurePnlTransportColumns } from "./_pnl-ensure.js";
import { getMonthlyMarginPerKg, type FilterParams } from "./_pnl-calc.js";
import { initRequestContext, logError } from "./_lib/observability.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "pnl_charts_monthly_margin");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  try {
    const pool = getPool();
    await ensurePnlTransportColumns(pool);
    const params: FilterParams = {
      from: (req.query.from as string) || undefined,
      to: (req.query.to as string) || undefined,
      direction: (req.query.direction as string) || undefined,
      transportType: (req.query.transportType as string) || undefined,
    };

    const data = await getMonthlyMarginPerKg(pool, params);
    return res.json(data);
  } catch (e) {
    logError(ctx, "pnl_charts_monthly_margin_failed", e);
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ error: msg || "Ошибка загрузки маржи по месяцам", request_id: ctx.requestId });
  }
}

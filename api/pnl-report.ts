import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { ensurePnlTransportColumns } from "./_pnl-ensure.js";
import {
  getPnL,
  getCogsByStage,
  getOpexByDepartment,
  getRevenueByDirection,
  type FilterParams,
} from "./_pnl-calc.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
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

    const [pnl, cogsByStage, opexByDept, revenueByDir] = await Promise.all([
      getPnL(pool, params),
      getCogsByStage(pool, params),
      getOpexByDepartment(pool, params),
      getRevenueByDirection(pool, params),
    ]);

    return res.json({ pnl, cogsByStage, opexByDept, revenueByDir });
  } catch (e) {
    console.error("pnl-report:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ error: msg || "Ошибка загрузки P&L" });
  }
}

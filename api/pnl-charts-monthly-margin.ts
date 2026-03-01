import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { getMonthlyMarginPerKg, type FilterParams } from "./_pnl-calc.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const pool = getPool();
  const params: FilterParams = {
    from: (req.query.from as string) || undefined,
    to: (req.query.to as string) || undefined,
    direction: (req.query.direction as string) || undefined,
    transportType: (req.query.transportType as string) || undefined,
  };

  const data = await getMonthlyMarginPerKg(pool, params);
  return res.json(data);
}

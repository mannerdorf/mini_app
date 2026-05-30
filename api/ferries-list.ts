import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { initRequestContext, logError } from "./_lib/observability.js";
import { withApiHandler } from "./_lib/withApiHandler.js";

/**
 * GET /api/ferries-list
 * Публичный список паромов (name, mmsi) для выпадающего меню в AIS.
 */
export default withApiHandler({ methods: "GET" }, async (req, res) => {
  const ctx = initRequestContext(req, res, "ferries_list");

  try {
    const pool = getPool();
    const { rows } = await pool.query<{ id: number; name: string; mmsi: string }>(
      "SELECT id, name, mmsi FROM ferries ORDER BY name"
    );
    return res.status(200).json({ ferries: rows, request_id: ctx.requestId });
  } catch (e) {
    logError(ctx, "ferries_list_failed", e);
    return res.status(500).json({ error: (e as Error)?.message || "Ошибка загрузки", request_id: ctx.requestId });
  }
});

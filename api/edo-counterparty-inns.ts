import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { initRequestContext, logError } from "./_lib/observability.js";
import { EDO_MY_COUNTERPARTY_STATUS } from "../lib/kontragentEdoStatus.js";

/**
 * GET /api/edo-counterparty-inns
 * ИНН контрагентов со статусом IsMyCounteragent (работа по ЭДО) из cache_suppliers.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "edo-counterparty-inns");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  try {
    const pool = getPool();
    const { rows } = await pool.query<{ inn: string }>(
      `SELECT inn
       FROM cache_suppliers
       WHERE lower(trim(counterparty_status)) = lower(trim($1::text))`,
      [EDO_MY_COUNTERPARTY_STATUS]
    );
    const inns = rows.map((r) => String(r.inn ?? "").trim()).filter(Boolean);
    return res.status(200).json({ inns, request_id: ctx.requestId });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    logError(ctx, "edo_counterparty_inns_failed", e, { message });
    return res.status(500).json({ error: "Ошибка загрузки контрагентов ЭДО", request_id: ctx.requestId });
  }
}

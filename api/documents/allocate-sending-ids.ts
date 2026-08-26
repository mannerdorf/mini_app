import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import { respondCorsPreflight } from "../_lib/cors.js";
import { parseJsonBody, resolveDocumentsOrderAccess } from "../_documentsOrder.js";
import { allocateZayavkaSendingIds } from "../../lib/zayavkaSendingIdAllocator.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (respondCorsPreflight(req, res)) return;
  const ctx = initRequestContext(req, res, "documents_allocate_sending_ids");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const body = parseJsonBody(req);
  const access = await resolveDocumentsOrderAccess(req, body);
  if (!access) {
    return res.status(401).json({ error: "Нет доступа", request_id: ctx.requestId });
  }

  const count = Math.max(1, Math.min(500, Math.floor(Number(body.count) || 0)));
  const nomerZayavki = String(body.nomerZayavki ?? body.nomer_zayavki ?? "").trim() || null;

  try {
    const pool = getPool();
    const ids = await allocateZayavkaSendingIds(pool, access.customerInn, count, { nomerZayavki });
    return res.status(200).json({ ok: true, ids, request_id: ctx.requestId });
  } catch (e: unknown) {
    logError(ctx, "documents_allocate_sending_ids_failed", e);
    return res.status(500).json({
      error: (e as Error)?.message || "Ошибка генерации ИДОтправления",
      request_id: ctx.requestId,
    });
  }
}

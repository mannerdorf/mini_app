import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import { deletePendingOrderForUser } from "../../lib/pendingOrderRequests.js";
import { parseJsonBody, resolveDocumentsOrderAccess } from "../_documentsOrder.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "documents_order_delete");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const body = parseJsonBody(req);
  const access = await resolveDocumentsOrderAccess(req, body);
  if (!access) {
    return res.status(401).json({ error: "Нет доступа", request_id: ctx.requestId });
  }

  const pendingOrderId = Number(body.pendingOrderId ?? body.pending_order_id);
  if (!Number.isFinite(pendingOrderId) || pendingOrderId < 1) {
    return res.status(400).json({ error: "pendingOrderId обязателен", request_id: ctx.requestId });
  }

  try {
    const pool = getPool();
    const deleted = await deletePendingOrderForUser(pool, access.loginKey, pendingOrderId);
    if (!deleted) {
      return res.status(404).json({ error: "Заявка не найдена или уже удалена", request_id: ctx.requestId });
    }
    return res.status(200).json({ ok: true, request_id: ctx.requestId });
  } catch (e: unknown) {
    const err = e as Error;
    logError(ctx, "documents_order_delete_failed", err);
    return res.status(500).json({ error: err?.message || "Ошибка удаления", request_id: ctx.requestId });
  }
}

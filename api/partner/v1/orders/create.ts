import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initRequestContext, logError } from "../../_lib/observability.js";
import { withErrorLog } from "../../../lib/requestErrorLog.js";
import { resolvePartnerOrUserApiAuth } from "../../../lib/partnerOrUserApiAuth.js";
import { assertBodyInnAllowedForApiKey, canonInnForApiKey } from "../../../lib/userApiKeyInnFilter.js";
import { readPartnerJsonBody } from "../../../lib/partnerV1PostRoute.js";
import {
  normalizeZayavkaUploadPayload,
  uploadZayavkaTo1c,
} from "../../../lib/post1cZayavkaUpload.js";

/**
 * POST /api/partner/v1/orders/create — загрузка заявки в 1С.
 * Scope: orders:write. Тело — JSON заявки (см. normalizeZayavkaUploadPayload).
 */
async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "partner-v1-orders-create");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const auth = await resolvePartnerOrUserApiAuth(req, res, ctx.requestId, "orders:write");
  if (!auth.ok) return;

  const body = readPartnerJsonBody(req);
  const normalized = normalizeZayavkaUploadPayload(body);
  if (!normalized.ok) {
    return res.status(400).json({ error: normalized.error, request_id: ctx.requestId });
  }

  const innErr = assertBodyInnAllowedForApiKey(normalized.payload.ЗаказчикИНН, auth.keyAllowedInnsCanon);
  if (innErr) {
    return res.status(403).json({ error: innErr, request_id: ctx.requestId });
  }

  const upload = await uploadZayavkaTo1c(normalized.payload);
  if (!upload.ok) {
    logError(ctx, "partner_orders_create_1c_failed", new Error(upload.error), {
      login: auth.login,
      customerInn: canonInnForApiKey(normalized.payload.ЗаказчикИНН),
    });
    return res.status(upload.status && upload.status >= 400 ? upload.status : 502).json({
      ok: false,
      error: upload.error,
      upstream: upload.raw ?? upload.responseText,
      request_id: ctx.requestId,
    });
  }

  return res.status(200).json({
    ok: true,
    nomerZayavki: upload.nomerZayavki ?? null,
    customerInn: normalized.payload.ЗаказчикИНН,
    clientRequestNumber: normalized.payload.НомерЗаявкиКлиента || null,
    upstream: upload.raw,
    request_id: ctx.requestId,
  });
}

export default withErrorLog(handler);

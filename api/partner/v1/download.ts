import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initRequestContext } from "../../_lib/observability.js";
import { withErrorLog } from "../../../lib/requestErrorLog.js";
import { resolvePartnerOrUserApiAuth } from "../../../lib/partnerOrUserApiAuth.js";
import { assertBodyInnAllowedForApiKey } from "../../../lib/userApiKeyInnFilter.js";
import { readPartnerJsonBody } from "../../../lib/partnerV1PostRoute.js";
import { validateGetFileParams, proxyGetFileDownload } from "../../../lib/getFileProxy.js";
import { assertPartnerDownloadCargoAccess, assertPartnerDownloadInvoiceAccess } from "../../../lib/partnerDownloadAccess.js";
import { getPool } from "../../_db.js";

/**
 * Partner API v1: скачать документ (GetFile через прокси).
 * Authorization: Bearer haulz_… (scope documents:read).
 * Тело: metod (ЭР | АПП | Счет | Акт | РеестрКсчету), number, inn (опционально), dateDoc (для реестра).
 * Ответ POST: JSON { data: base64, name } — как у /api/download.
 */
async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "partner-v1-download");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const auth = await resolvePartnerOrUserApiAuth(req, res, ctx.requestId, "documents:read");
  if (!auth.ok) return;

  const body = readPartnerJsonBody(req);
  const validated = validateGetFileParams({
    metod: body.metod != null ? String(body.metod) : undefined,
    number: body.number != null ? String(body.number) : undefined,
    dateDoc: body.dateDoc != null ? String(body.dateDoc) : undefined,
    dateDog: body.dateDog != null ? String(body.dateDog) : undefined,
    inn: body.inn != null ? String(body.inn) : undefined,
  });
  if (validated.ok === false) {
    return res.status(validated.status).json({ error: validated.error, request_id: ctx.requestId });
  }

  const allowedMetods = new Set(["ЭР", "АПП", "Счет", "Счёт", "Акт", "РеестрКсчету"]);
  if (!allowedMetods.has(validated.params.metod)) {
    return res.status(400).json({
      error: "Unsupported metod for Partner API. Allowed: ЭР, АПП, Счет, Акт, РеестрКсчету",
      request_id: ctx.requestId,
    });
  }

  const innErr = assertBodyInnAllowedForApiKey(body.inn, auth.keyAllowedInnsCanon);
  if (innErr) {
    return res.status(403).json({ error: innErr, request_id: ctx.requestId });
  }

  const pool = getPool();
  const access =
    validated.params.metod === "РеестрКсчету"
      ? await assertPartnerDownloadInvoiceAccess(
          pool,
          auth.verified,
          auth.keyAllowedInnsCanon,
          auth.login,
          validated.params.number,
          body.inn,
        )
      : await assertPartnerDownloadCargoAccess(
          pool,
          auth.verified,
          auth.keyAllowedInnsCanon,
          auth.login,
          validated.params.metod,
          validated.params.number,
          body.inn,
        );
  if (access.ok === false) {
    return res.status(access.status).json({ error: access.error, request_id: ctx.requestId });
  }

  await proxyGetFileDownload(req, res, ctx.requestId, validated.params);
}

export default withErrorLog(handler);

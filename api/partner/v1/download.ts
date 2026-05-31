import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initRequestContext } from "../../_lib/observability.js";
import { withErrorLog } from "../../../lib/requestErrorLog.js";
import { resolvePartnerOrUserApiAuth } from "../../../lib/partnerOrUserApiAuth.js";
import { assertBodyInnAllowedForApiKey } from "../../../lib/userApiKeyInnFilter.js";
import { readPartnerJsonBody } from "../../../lib/partnerV1PostRoute.js";
import { validateGetFileParams, proxyGetFileDownload } from "../../../lib/getFileProxy.js";
import { assertPartnerDownloadCargoAccess } from "../../../lib/partnerDownloadAccess.js";
import { getPool } from "../../_db.js";

/**
 * Partner API v1: скачать документ (GetFile через прокси).
 * Authorization: Bearer haulz_… (scope documents:read).
 * Тело: metod (ЭР | АПП | Счет | Акт), number, inn (опционально).
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
    metod: body.metod,
    number: body.number,
    dateDoc: body.dateDoc,
    dateDog: body.dateDog,
    inn: body.inn,
  });
  if (!validated.ok) {
    return res.status(validated.status).json({ error: validated.error, request_id: ctx.requestId });
  }

  const allowedMetods = new Set(["ЭР", "АПП", "Счет", "Счёт", "Акт"]);
  if (!allowedMetods.has(validated.params.metod)) {
    return res.status(400).json({
      error: "Unsupported metod for Partner API. Allowed: ЭР, АПП, Счет, Акт",
      request_id: ctx.requestId,
    });
  }

  const innErr = assertBodyInnAllowedForApiKey(body.inn, auth.keyAllowedInnsCanon);
  if (innErr) {
    return res.status(403).json({ error: innErr, request_id: ctx.requestId });
  }

  const pool = getPool();
  const access = await assertPartnerDownloadCargoAccess(
    pool,
    auth.verified,
    auth.keyAllowedInnsCanon,
    validated.params.metod,
    validated.params.number,
    body.inn,
  );
  if (!access.ok) {
    return res.status(access.status).json({ error: access.error, request_id: ctx.requestId });
  }

  await proxyGetFileDownload(req, res, ctx.requestId, validated.params);
}

export default withErrorLog(handler);

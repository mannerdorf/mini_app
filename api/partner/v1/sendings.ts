import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initRequestContext } from "../../_lib/observability.js";
import { withErrorLog } from "../../../lib/requestErrorLog.js";
import { resolvePartnerOrUserApiAuth } from "../../../lib/partnerOrUserApiAuth.js";
import { assertBodyInnAllowedForApiKey, filterRowsByApiKeyInns } from "../../../lib/userApiKeyInnFilter.js";
import { getPool } from "../../_db.js";
import { readRegisteredSendingsFromCache, sendingsPickInnForRow } from "../../sendings.js";

function readJsonBody(req: VercelRequest): Record<string, unknown> {
  let body: any = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body && typeof body === "object" ? body : {};
}

/**
 * Внешний API v1: отправки (тело и ответ — как у кэша `/api/sendings`).
 * Авторизация: только полный ключ `haulz_…` из профиля (scope `sendings:read`).
 */
async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "partner-v1-sendings");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const auth = await resolvePartnerOrUserApiAuth(req, res, ctx.requestId, "sendings:read");
  if (!auth.ok) return;

  const body = readJsonBody(req);
  const dateFrom = String(body.dateFrom ?? "2024-01-01");
  const dateTo = String(body.dateTo ?? new Date().toISOString().split("T")[0]);
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(dateFrom) || !dateRe.test(dateTo)) {
    return res.status(400).json({ error: "Invalid date format (YYYY-MM-DD required)", request_id: ctx.requestId });
  }

  const innErr = assertBodyInnAllowedForApiKey(body.inn, auth.keyAllowedInnsCanon);
  if (innErr) {
    return res.status(403).json({ error: innErr, request_id: ctx.requestId });
  }

  const pool = getPool();
  const rows = await readRegisteredSendingsFromCache(
    pool,
    auth.verified,
    auth.login,
    dateFrom,
    dateTo,
    body.inn,
    body.serviceMode,
  );
  const out = filterRowsByApiKeyInns(rows, auth.keyAllowedInnsCanon, sendingsPickInnForRow);
  return res.status(200).json(out);
}

export default withErrorLog(handler);

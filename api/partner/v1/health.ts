import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initRequestContext } from "../../_lib/observability.js";
import { getBearerPartnerToken } from "../../../lib/partnerApi.js";
import { parseUserApiBearerToken } from "../../../lib/userApiKeyCrypto.js";
import { getPartnerWebhookSecret, getPartnerWebhookUrls } from "../../../lib/partnerWebhook.js";
import { withErrorLog } from "../../../lib/requestErrorLog.js";

async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "partner-v1-health");
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const token = getBearerPartnerToken(req);
  const parsed = token ? parseUserApiBearerToken(token) : null;
  const webhookUrls = getPartnerWebhookUrls();
  const out = {
    ok: true,
    version: "1",
    partner_api: {
      auth: "profile_api_key_bearer",
      bearer_present: Boolean(token),
      /** Полный формат haulz_<12hex>_<64hex> (без проверки секрета в БД). */
      bearer_full_key_format: parsed !== null,
    },
    partner_webhooks: {
      outbound_configured: webhookUrls.length > 0 && Boolean(getPartnerWebhookSecret()),
      urls_count: webhookUrls.length,
    },
    request_id: ctx.requestId,
  };

  if (req.method === "HEAD") {
    res.status(200).end();
    return;
  }
  return res.status(200).json(out);
}

export default withErrorLog(handler);

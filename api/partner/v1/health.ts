import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initRequestContext } from "../../_lib/observability.js";
import { getBearerPartnerToken, getConfiguredPartnerKeys, verifyPartnerApiKey } from "../../../lib/partnerApi.js";
import { getPartnerWebhookSecret, getPartnerWebhookUrls } from "../../../lib/partnerWebhook.js";
import { withErrorLog } from "../../../lib/requestErrorLog.js";

async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "partner-v1-health");
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const keys = getConfiguredPartnerKeys();
  const token = getBearerPartnerToken(req);
  const authOk = keys.length > 0 && token ? verifyPartnerApiKey(token) : false;
  const webhookUrls = getPartnerWebhookUrls();
  const out = {
    ok: true,
    version: "1",
    partner_api: {
      configured: keys.length > 0,
      keys_count: keys.length,
      bearer_ok: authOk,
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

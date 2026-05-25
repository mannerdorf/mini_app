import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withErrorLog } from "../lib/requestErrorLog.js";
import { initRequestContext } from "./_lib/observability.js";
import { handleHaulzSummarySandboxRequest } from "../lib/haulzSummarySandboxApi.js";

async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "admin-weekly-summary");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }
  await handleHaulzSummarySandboxRequest(req, res, ctx.requestId);
}

export default withErrorLog(handler);

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { requireCronAuth } from "../_lib/cronAuth.js";
import { initRequestContext, logError, logInfo } from "../_lib/observability.js";
import { runPartnerSummaryCron } from "../../lib/haulzSummaryCron.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "cron-weekly-partner-summary");
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const authErr = requireCronAuth(req);
  if (authErr) {
    return res.status(authErr.status).json({ error: authErr.error, request_id: ctx.requestId });
  }

  try {
    const pool = getPool();
    const result = await runPartnerSummaryCron(pool, { force: false });
    logInfo(ctx, "weekly_partner_summary_done", {
      skipped: !!result.skipped,
      sent: result.sent,
      failed: result.failed,
      recipients: result.recipients,
    });
    return res.status(200).json({ ...result, request_id: ctx.requestId });
  } catch (e: unknown) {
    logError(ctx, "weekly_partner_summary_failed", e);
    return res.status(500).json({ error: (e as Error)?.message || "Cron failed", request_id: ctx.requestId });
  }
}

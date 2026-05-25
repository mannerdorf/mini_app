import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { initRequestContext, logError } from "./_lib/observability.js";
import { getTrackingGifBuffer, recordSummaryEmailOpen } from "../lib/haulzSummaryEmailTrack.js";

/** GET: пиксель трекинга открытия письма «Отчёт» (?id=message_id). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "haulz-summary-email-open");
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).send("Method not allowed");
  }

  const messageId = String(req.query?.id ?? "").trim();
  if (messageId && req.method === "GET") {
    try {
      await recordSummaryEmailOpen(getPool(), messageId, req);
    } catch (e: unknown) {
      logError(ctx, "summary_email_open_track_failed", e);
    }
  }

  res.setHeader("Content-Type", "image/gif");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  if (req.method === "HEAD") return res.status(200).end();
  return res.status(200).send(getTrackingGifBuffer());
}

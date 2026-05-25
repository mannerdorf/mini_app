import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { initRequestContext, logError } from "./_lib/observability.js";
import { recordSummaryEmailClick } from "../lib/haulzSummaryEmailTrack.js";

function decodeDestination(raw: string): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  try {
    const url = Buffer.from(s, "base64url").toString("utf8").trim();
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
  } catch {
    /* ignore */
  }
  try {
    const url = decodeURIComponent(s);
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
  } catch {
    /* ignore */
  }
  return null;
}

/** GET: редирект по клику в письме «Отчёт» (?id=message_id&u=base64url). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "haulz-summary-email-click");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).send("Method not allowed");
  }

  const messageId = String(req.query?.id ?? "").trim();
  const dest = decodeDestination(String(req.query?.u ?? ""));
  if (!dest) {
    return res.status(400).send("Invalid link");
  }

  try {
    await recordSummaryEmailClick(getPool(), messageId, dest, req);
  } catch (e: unknown) {
    logError(ctx, "summary_email_click_track_failed", e);
  }

  res.setHeader("Cache-Control", "no-store");
  return res.redirect(302, dest);
}

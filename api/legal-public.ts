import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { initRequestContext, logError } from "./_lib/observability.js";
import { ensureLegalDocumentsSeeded, getCurrentLegalVersions } from "../lib/legalDocuments.js";

/** GET — текущие редакции оферты и согласия (без авторизации). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "legal-public");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  try {
    const pool = getPool();
    await ensureLegalDocumentsSeeded(pool);
    const current = await getCurrentLegalVersions(pool);
    return res.status(200).json({
      offer: current.offer
        ? {
            id: current.offer.id,
            version_label: current.offer.version_label,
            body_text: current.offer.body_text,
            published_at: current.offer.published_at,
          }
        : null,
      consent: current.consent
        ? {
            id: current.consent.id,
            version_label: current.consent.version_label,
            body_text: current.consent.body_text,
            published_at: current.consent.published_at,
          }
        : null,
      request_id: ctx.requestId,
    });
  } catch (e: unknown) {
    const err = e as Error;
    logError(ctx, "legal_public_failed", err);
    return res.status(500).json({ error: err?.message || "Ошибка", request_id: ctx.requestId });
  }
}

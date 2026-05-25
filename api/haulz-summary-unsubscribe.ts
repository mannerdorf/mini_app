import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { initRequestContext, logError } from "./_lib/observability.js";
import {
  renderUnsubscribeResultHtml,
  unsubscribeSummaryEmail,
  verifySummaryUnsubscribeToken,
} from "../lib/haulzSummaryUnsubscribe.js";

/** GET: отписка от партнёрской рассылки по ссылке из письма (?token=…). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "haulz-summary-unsubscribe");
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).send("Method not allowed");
  }

  const token = String(req.query?.token ?? "").trim();
  if (!token) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(400).send(renderUnsubscribeResultHtml(false, "Ссылка отписки недействительна."));
  }

  const email = verifySummaryUnsubscribeToken(token);
  if (!email) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(400).send(renderUnsubscribeResultHtml(false, "Ссылка отписки недействительна или устарела."));
  }

  try {
    const pool = getPool();
    await unsubscribeSummaryEmail(pool, email);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res
      .status(200)
      .send(
        renderUnsubscribeResultHtml(
          true,
          `Адрес ${email} больше не будет получать автоматическую еженедельную сводку HAULZ.`,
        ),
      );
  } catch (e: unknown) {
    logError(ctx, "summary_unsubscribe_failed", e);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(500).send(renderUnsubscribeResultHtml(false, "Не удалось сохранить отписку. Попробуйте позже."));
  }
}

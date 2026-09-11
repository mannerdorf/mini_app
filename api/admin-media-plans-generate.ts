import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest } from "../lib/adminAuth.js";
import { initRequestContext, logError } from "./_lib/observability.js";
import { parseChannels } from "../lib/mediaMarketing/channels.js";
import { generateMediaArticle } from "../lib/mediaMarketing/generateArticle.js";

function parseBody(req: VercelRequest): Record<string, unknown> {
  let body: unknown = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "admin_media_plans_generate");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const token = getAdminTokenFromRequest(req);
  if (!verifyAdminToken(token)) {
    return res.status(401).json({ error: "Требуется авторизация админа", request_id: ctx.requestId });
  }

  const body = parseBody(req);
  const planId = Number(body.plan_id ?? body.planId);

  try {
    const pool = getPool();

    let title = String(body.title ?? "").trim();
    let brief = String(body.brief ?? body.description ?? "").trim();
    let plannedDate = String(body.planned_date ?? body.plannedDate ?? "").trim();
    let targetKeywords = String(body.target_keywords ?? body.targetKeywords ?? "").trim();
    let channels = parseChannels(body.channels);

    if (Number.isFinite(planId)) {
      const { rows } = await pool.query(`select * from media_content_plans where id = $1`, [planId]);
      const plan = rows[0];
      if (!plan) return res.status(404).json({ error: "План не найден", request_id: ctx.requestId });
      title = title || String(plan.title);
      brief = brief || String(plan.brief);
      plannedDate = plannedDate || String(plan.planned_date).slice(0, 10);
      targetKeywords = targetKeywords || String(plan.target_keywords ?? "");
      if (channels.length === 0) channels = parseChannels(plan.channels);
    }

    if (!title || !brief || !plannedDate) {
      return res.status(400).json({
        error: "Нужны title, brief, planned_date (или plan_id существующего плана)",
        request_id: ctx.requestId,
      });
    }

    const generated = await generateMediaArticle({
      title,
      brief,
      plannedDate,
      targetKeywords,
      channels: channels.length > 0 ? channels : ["site", "telegram", "email"],
    });

    if (Number.isFinite(planId)) {
      await pool.query(
        `update media_content_plans set
           article_slug = $2,
           article_title = $3,
           meta_description = $4,
           body_markdown = $5,
           telegram_teaser = $6,
           email_subject = $7,
           email_teaser = $8,
           gpt_model = $9,
           generated_at = now(),
           status = 'draft',
           updated_at = now()
         where id = $1`,
        [
          planId,
          generated.article_slug,
          generated.article_title,
          generated.meta_description,
          generated.body_markdown,
          generated.telegram_teaser,
          generated.email_subject,
          generated.email_teaser,
          generated.gpt_model,
        ],
      );
    }

    return res.status(200).json({ generated, plan_id: Number.isFinite(planId) ? planId : null, request_id: ctx.requestId });
  } catch (e) {
    logError(ctx, "admin_media_plans_generate_failed", e);
    const msg = (e as Error)?.message || "Ошибка генерации";
    const status = msg.includes("OPENAI_API_KEY") ? 503 : 500;
    return res.status(status).json({ error: msg, request_id: ctx.requestId });
  }
}

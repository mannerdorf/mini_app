import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest, getAdminTokenPayload } from "../lib/adminAuth.js";
import { initRequestContext, logError } from "./_lib/observability.js";
import { parseChannels } from "../lib/mediaMarketing/channels.js";

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

function rowToPlan(row: Record<string, unknown>) {
  return {
    id: row.id,
    planned_date: row.planned_date,
    title: row.title,
    brief: row.brief,
    target_keywords: row.target_keywords,
    channels: row.channels,
    status: row.status,
    article_slug: row.article_slug,
    article_title: row.article_title,
    meta_description: row.meta_description,
    body_markdown: row.body_markdown,
    telegram_teaser: row.telegram_teaser,
    email_subject: row.email_subject,
    email_teaser: row.email_teaser,
    gpt_model: row.gpt_model,
    generated_at: row.generated_at,
    published_at: row.published_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.created_by,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "admin_media_plans");
  const token = getAdminTokenFromRequest(req);
  if (!verifyAdminToken(token)) {
    return res.status(401).json({ error: "Требуется авторизация админа", request_id: ctx.requestId });
  }
  const login = getAdminTokenPayload(token)?.login ?? "admin";

  try {
    const pool = getPool();

    if (req.method === "GET") {
      const id = req.query.id ? Number(req.query.id) : null;
      if (id) {
        const { rows } = await pool.query(`select * from media_content_plans where id = $1`, [id]);
        if (!rows[0]) return res.status(404).json({ error: "Не найдено", request_id: ctx.requestId });
        return res.status(200).json({ plan: rowToPlan(rows[0]), request_id: ctx.requestId });
      }
      const { rows } = await pool.query(
        `select id, planned_date, title, brief, target_keywords, channels, status,
                article_slug, article_title, generated_at, published_at, created_at, updated_at
         from media_content_plans
         order by planned_date desc, id desc
         limit 200`,
      );
      return res.status(200).json({ plans: rows, request_id: ctx.requestId });
    }

    if (req.method === "POST") {
      const body = parseBody(req);
      const plannedDate = String(body.planned_date ?? body.plannedDate ?? "").trim();
      const title = String(body.title ?? "").trim();
      const brief = String(body.brief ?? body.description ?? "").trim();
      if (!plannedDate || !title) {
        return res.status(400).json({ error: "planned_date и title обязательны", request_id: ctx.requestId });
      }
      const channels = parseChannels(body.channels);
      const { rows } = await pool.query(
        `insert into media_content_plans
           (planned_date, title, brief, target_keywords, channels, status, created_by)
         values ($1::date, $2, $3, $4, $5::jsonb, 'planned', $6)
         returning *`,
        [
          plannedDate,
          title,
          brief,
          String(body.target_keywords ?? body.targetKeywords ?? "").trim() || null,
          JSON.stringify(channels),
          login,
        ],
      );
      return res.status(201).json({ plan: rowToPlan(rows[0]), request_id: ctx.requestId });
    }

    if (req.method === "PATCH") {
      const body = parseBody(req);
      const id = Number(body.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ error: "id обязателен", request_id: ctx.requestId });
      }
      const fields: string[] = [];
      const params: unknown[] = [id];
      let idx = 2;

      const setField = (col: string, val: unknown) => {
        fields.push(`${col} = $${idx}`);
        params.push(val);
        idx += 1;
      };

      if (body.planned_date != null || body.plannedDate != null) {
        setField("planned_date", String(body.planned_date ?? body.plannedDate).trim());
      }
      if (body.title != null) setField("title", String(body.title).trim());
      if (body.brief != null || body.description != null) {
        setField("brief", String(body.brief ?? body.description).trim());
      }
      if (body.target_keywords != null || body.targetKeywords != null) {
        setField("target_keywords", String(body.target_keywords ?? body.targetKeywords).trim() || null);
      }
      if (body.channels != null) setField("channels", JSON.stringify(parseChannels(body.channels)));
      if (body.status != null) setField("status", String(body.status).trim());
      if (body.article_slug != null) setField("article_slug", String(body.article_slug).trim() || null);
      if (body.article_title != null) setField("article_title", String(body.article_title).trim() || null);
      if (body.meta_description != null) setField("meta_description", String(body.meta_description).trim() || null);
      if (body.body_markdown != null) setField("body_markdown", String(body.body_markdown));
      if (body.telegram_teaser != null) setField("telegram_teaser", String(body.telegram_teaser).trim() || null);
      if (body.email_subject != null) setField("email_subject", String(body.email_subject).trim() || null);
      if (body.email_teaser != null) setField("email_teaser", String(body.email_teaser).trim() || null);
      if (body.published_at === "now" || body.mark_published === true) {
        setField("published_at", new Date().toISOString());
        setField("status", "published");
      }

      if (fields.length === 0) {
        return res.status(400).json({ error: "Нет полей для обновления", request_id: ctx.requestId });
      }
      fields.push(`updated_at = now()`);
      const { rows } = await pool.query(
        `update media_content_plans set ${fields.join(", ")} where id = $1 returning *`,
        params,
      );
      if (!rows[0]) return res.status(404).json({ error: "Не найдено", request_id: ctx.requestId });
      return res.status(200).json({ plan: rowToPlan(rows[0]), request_id: ctx.requestId });
    }

    if (req.method === "DELETE") {
      const id = Number(req.query.id ?? parseBody(req).id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ error: "id обязателен", request_id: ctx.requestId });
      }
      await pool.query(`delete from media_content_plans where id = $1`, [id]);
      return res.status(200).json({ ok: true, request_id: ctx.requestId });
    }

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  } catch (e) {
    logError(ctx, "admin_media_plans_failed", e);
    return res.status(500).json({ error: (e as Error)?.message || "Ошибка", request_id: ctx.requestId });
  }
}

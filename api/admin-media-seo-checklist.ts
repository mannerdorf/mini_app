import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest, getAdminTokenPayload } from "../lib/adminAuth.js";
import { initRequestContext, logError } from "./_lib/observability.js";
import { ensureMediaSeoChecklistSeeded } from "../lib/mediaMarketing/seoChecklistSeed.js";

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
  const ctx = initRequestContext(req, res, "admin_media_seo_checklist");
  const token = getAdminTokenFromRequest(req);
  if (!verifyAdminToken(token)) {
    return res.status(401).json({ error: "Требуется авторизация админа", request_id: ctx.requestId });
  }
  const login = getAdminTokenPayload(token)?.login ?? "admin";

  try {
    const pool = getPool();
    await ensureMediaSeoChecklistSeeded(pool);

    if (req.method === "GET") {
      const { rows } = await pool.query(
        `select c.id, c.category, c.title, c.description, c.owner_action, c.doc_link, c.sort_order,
                coalesce(s.is_done, false) as is_done,
                s.notes,
                s.updated_at::text as state_updated_at,
                s.updated_by as state_updated_by
         from media_seo_checklist c
         left join media_seo_checklist_state s on s.checklist_id = c.id
         order by c.sort_order, c.id`,
      );
      const pending = rows.filter((r) => !r.is_done);
      return res.status(200).json({
        items: rows,
        summary: {
          total: rows.length,
          done: rows.length - pending.length,
          pending: pending.length,
          pending_owner_actions: pending.map((r) => ({
            id: r.id,
            title: r.title,
            owner_action: r.owner_action,
          })),
        },
        request_id: ctx.requestId,
      });
    }

    if (req.method === "PATCH") {
      const body = parseBody(req);
      const checklistId = Number(body.checklist_id ?? body.checklistId);
      if (!Number.isFinite(checklistId)) {
        return res.status(400).json({ error: "checklist_id обязателен", request_id: ctx.requestId });
      }
      const isDone = body.is_done === true || body.isDone === true;
      const notes = typeof body.notes === "string" ? body.notes.trim() : null;
      await pool.query(
        `insert into media_seo_checklist_state (checklist_id, is_done, notes, updated_by, updated_at)
         values ($1, $2, $3, $4, now())
         on conflict (checklist_id) do update set
           is_done = excluded.is_done,
           notes = excluded.notes,
           updated_by = excluded.updated_by,
           updated_at = now()`,
        [checklistId, isDone, notes, login],
      );
      return res.status(200).json({ ok: true, request_id: ctx.requestId });
    }

    res.setHeader("Allow", "GET, PATCH");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  } catch (e) {
    logError(ctx, "admin_media_seo_checklist_failed", e);
    return res.status(500).json({ error: (e as Error)?.message || "Ошибка", request_id: ctx.requestId });
  }
}

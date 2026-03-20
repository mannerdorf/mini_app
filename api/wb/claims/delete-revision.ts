import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../../_db.js";
import { initRequestContext, logError } from "../../_lib/observability.js";
import { pgTableExists, rebuildWbSummary, resolveWbAccess } from "../../_wb.js";
import { writeAuditLog } from "../../../lib/adminAuditLog.js";

function parseBody(req: VercelRequest): Record<string, unknown> {
  if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
    return req.body as Record<string, unknown>;
  }
  return {};
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "wb_claims_delete_revision");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  try {
    const pool = getPool();
    const access = await resolveWbAccess(req, pool, "write");
    if (!access) return res.status(401).json({ error: "Нет доступа", request_id: ctx.requestId });

    if (!(await pgTableExists(pool, "wb_claims_revisions"))) {
      return res.status(400).json({ error: "Таблица ревизий претензий не найдена", request_id: ctx.requestId });
    }

    const body = parseBody(req);
    const revisionId = Number(body.revisionId ?? 0);
    if (!Number.isFinite(revisionId) || revisionId <= 0) {
      return res.status(400).json({ error: "Укажите revisionId", request_id: ctx.requestId });
    }

    const client = await pool.connect();
    try {
      await client.query("begin");

      const cur = await client.query<{ is_active: boolean; revision_number: number; source_filename: string | null }>(
        `select is_active, revision_number, source_filename from wb_claims_revisions where id = $1`,
        [revisionId],
      );
      const row = cur.rows[0];
      if (!row) {
        await client.query("rollback");
        return res.status(404).json({ error: "Ревизия не найдена", request_id: ctx.requestId });
      }

      const wasActive = row.is_active === true;

      await client.query(`delete from wb_claims_revisions where id = $1`, [revisionId]);

      if (wasActive) {
        await client.query(
          `update wb_claims_revisions r
           set is_active = true
           where r.id = (
             select id from wb_claims_revisions
             order by revision_number desc
             limit 1
           )
           and not exists (select 1 from wb_claims_revisions where is_active = true)`,
        );
      }

      await client.query("commit");
    } catch (e) {
      await client.query("rollback").catch(() => {});
      throw e;
    } finally {
      client.release();
    }

    await rebuildWbSummary(pool);

    await writeAuditLog(pool, {
      action: "wb_claims_delete_revision",
      target_type: "wb_claims_revision",
      target_id: revisionId,
      details: { revisionId, deletedBy: access.login },
    });

    return res.status(200).json({ ok: true, revisionId, request_id: ctx.requestId });
  } catch (error) {
    logError(ctx, "wb_claims_delete_revision_failed", error);
    return res.status(500).json({ error: "Ошибка удаления ревизии", request_id: ctx.requestId });
  }
}

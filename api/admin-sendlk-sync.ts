import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest, getAdminTokenPayload } from "../lib/adminAuth.js";
import { writeAuditLog } from "../lib/adminAuditLog.js";
import { sendLkAddTo1c } from "../lib/sendLkTo1c.js";
import { withErrorLog } from "../lib/requestErrorLog.js";
import { initRequestContext } from "./_lib/observability.js";

function parseJsonBody(req: VercelRequest): any {
  let body: any = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body || {};
}

async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "admin-sendlk-sync");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }
  const token = getAdminTokenFromRequest(req);
  if (!verifyAdminToken(token)) return res.status(401).json({ error: "Требуется авторизация админа", request_id: ctx.requestId });
  if (!getAdminTokenPayload(token)?.superAdmin) return res.status(403).json({ error: "Доступ только для супер-администратора", request_id: ctx.requestId });

  const body = parseJsonBody(req);
  const limitRaw = Number(body?.limit);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(5000, Math.floor(limitRaw))) : 500;
  const dryRun = body?.dryRun === true;

  const pool = getPool();
  const usersRes = await pool.query<{ id: number; login: string; inn: string | null }>(
    `SELECT id, login, inn
     FROM registered_users
     WHERE active = true
       AND coalesce(trim(login), '') <> ''
       AND coalesce(trim(inn), '') <> ''
     ORDER BY id ASC
     LIMIT $1`,
    [limit]
  );

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const failures: Array<{ id: number; login: string; inn: string; error: string }> = [];

  for (const row of usersRes.rows) {
    const email = String(row.login || "").trim();
    const inn = String(row.inn || "").trim();
    if (!email || !inn) {
      skipped += 1;
      continue;
    }
    if (dryRun) {
      skipped += 1;
      continue;
    }
    const result = await sendLkAddTo1c({ inn, email });
    if (result.ok) {
      sent += 1;
      await writeAuditLog(pool, {
        action: "integration_sendlk_sent",
        target_type: "user",
        target_id: row.id,
        details: { login: email, inn, email, source: "bulk_sync", status: result.status ?? null },
      });
    } else {
      failed += 1;
      const errorText = result.error || result.responseText || "unknown_error";
      failures.push({ id: row.id, login: email, inn, error: errorText });
      await writeAuditLog(pool, {
        action: "integration_sendlk_failed",
        target_type: "user",
        target_id: row.id,
        details: { login: email, inn, email, source: "bulk_sync", status: result.status ?? null, error: errorText },
      });
    }
  }

  await writeAuditLog(pool, {
    action: "integration_sendlk_bulk_run",
    target_type: "integration",
    details: {
      dryRun,
      selected: usersRes.rows.length,
      sent,
      failed,
      skipped,
      limit,
    },
  });

  return res.status(200).json({
    ok: true,
    dryRun,
    selected: usersRes.rows.length,
    sent,
    failed,
    skipped,
    failures: failures.slice(0, 50),
    request_id: ctx.requestId,
  });
}

export default withErrorLog(handler);


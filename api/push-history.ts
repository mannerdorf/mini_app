import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { initRequestContext, logError } from "./_lib/observability.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/** GET ?login=&limit= — история push-доставок (FCM) для пользователя. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "push-history");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const login = String(req.query.login || "")
    .trim()
    .toLowerCase();
  if (!login) {
    return res.status(400).json({ error: "login is required", request_id: ctx.requestId });
  }

  const rawLimit = Number(req.query.limit);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(rawLimit)))
    : DEFAULT_LIMIT;

  let pool: Awaited<ReturnType<typeof getPool>>;
  try {
    pool = getPool();
  } catch {
    return res.status(503).json({ error: "Database not configured", request_id: ctx.requestId });
  }

  try {
    const { rows } = await pool.query<{
      id: string;
      inn: string;
      cargo_number: string;
      event: string;
      sent_at: string;
      success: boolean;
      error_message: string | null;
    }>(
      `select id, inn, cargo_number, event, sent_at, success, error_message
       from notification_deliveries
       where lower(trim(login)) = $1 and channel = 'push'
       order by sent_at desc
       limit $2`,
      [login, limit],
    );

    return res.status(200).json({
      ok: true,
      items: rows.map((row) => ({
        id: row.id,
        inn: row.inn,
        cargoNumber: row.cargo_number,
        event: row.event,
        sentAt: row.sent_at,
        success: row.success,
        errorMessage: row.error_message,
      })),
      request_id: ctx.requestId,
    });
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === "42P01") {
      return res.status(200).json({ ok: true, items: [], request_id: ctx.requestId });
    }
    logError(ctx, "push_history_failed", e);
    return res.status(500).json({ error: "Failed to load push history", request_id: ctx.requestId });
  }
}

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { initRequestContext, logError } from "./_lib/observability.js";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  const ctx = initRequestContext(req, res, "companies-save");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  let body: any = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON body", request_id: ctx.requestId });
    }
  }

  const { login, customers } = body || {};
  if (!login || typeof login !== "string" || !Array.isArray(customers)) {
    return res
      .status(400)
      .json({ error: "login (string) and customers (array) are required", request_id: ctx.requestId });
  }

  const normalized = customers
    .map((c: any) => ({
      name: String(c?.name ?? c?.Name ?? "").trim() || "",
      inn: String(c?.inn ?? c?.INN ?? c?.Inn ?? "").trim(),
    }))
    .filter((c: { name: string; inn: string }) => c.name.length > 0 || c.inn.length > 0);

  // Контроль дублирования по ИНН: один заказчик на один ИНН для данного login
  const byInn = new Map<string, { name: string; inn: string }>();
  for (const c of normalized) {
    const key = c.inn.length > 0 ? c.inn : `__empty_${c.name}`;
    if (!byInn.has(key)) {
      byInn.set(key, c);
    } else {
      const existing = byInn.get(key)!;
      if (c.name.length > (existing.name?.length ?? 0)) {
        byInn.set(key, c);
      }
    }
  }
  const deduped = Array.from(byInn.values());

  if (deduped.length === 0) {
    return res.status(200).json({ ok: true, saved: 0, request_id: ctx.requestId });
  }

  try {
    let pool;
    try {
      pool = getPool();
    } catch (dbInitErr: any) {
      logError(ctx, "companies_save_db_not_configured", dbInitErr);
      return res.status(200).json({ ok: true, saved: 0, warning: "DATABASE_URL not set", request_id: ctx.requestId });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "DELETE FROM account_companies WHERE login = $1",
        [login.trim().toLowerCase()]
      );
      for (const c of deduped) {
        await client.query(
          `INSERT INTO account_companies (login, inn, name) VALUES ($1, $2, $3)
           ON CONFLICT (login, inn) DO UPDATE SET name = EXCLUDED.name`,
          [login.trim().toLowerCase(), c.inn, c.name]
        );
      }
      await client.query("COMMIT");
      return res.status(200).json({ ok: true, saved: deduped.length, request_id: ctx.requestId });
    } finally {
      client.release();
    }
  } catch (e: any) {
    logError(ctx, "companies_save_failed", e);
    return res
      .status(500)
      .json({ error: "Database error", details: e?.message || String(e), request_id: ctx.requestId });
  }
}


import { CompanyAccessError, resolveCompanyAccess } from "../lib/companyAccess.js";
import { respondCorsPreflight } from "./_lib/cors.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { initRequestContext, logError } from "./_lib/observability.js";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (respondCorsPreflight(req, res)) return;
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

  try {
    const pool = getPool();
    const access = await resolveCompanyAccess(pool, body?.login, body?.password);
    // Registered-user bindings are managed in admin, never through login-time synchronization.
    if (access.registered) return res.status(200).json({ ok: true, saved: 0, source: "admin", request_id: ctx.requestId });
    const login = access.login;
    const deduped = [...new Map(access.customers.map(customer => [customer.inn, customer])).values()];
    const client = await pool.connect();
    let discardError: Error | undefined;
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
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        // A connection whose transaction could not be rolled back must not be reused.
        discardError = rollbackError instanceof Error ? rollbackError : new Error("Rollback failed");
      }
      throw error;
    } finally {
      client.release(discardError);
    }
  } catch (e: any) {
    if (e instanceof CompanyAccessError) return res.status(e.status).json({ error: e.message, request_id: ctx.requestId });
    logError(ctx, "companies_save_failed", e);
    return res
      .status(500)
      .json({ error: "Database error", details: e?.message || String(e), request_id: ctx.requestId });
  }
}


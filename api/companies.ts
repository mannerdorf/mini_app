import { CompanyAccessError, resolveCompanyAccess } from "../lib/companyAccess.js";
import { respondCorsPreflight } from "./_lib/cors.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { initRequestContext, logError } from "./_lib/observability.js";
import {
  assertHaulzSummarySandboxAccess,
  loadHaulzSummaryDirectories,
} from "../lib/haulzSummarySandboxApi.js";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (respondCorsPreflight(req, res)) return;
  const ctx = initRequestContext(req, res, "companies");
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  if (req.query.sandbox === "1") {
    const login = String(req.headers["x-login"] ?? req.query.login ?? "").trim();
    const password = String(req.headers["x-password"] ?? req.query.password ?? "").trim();
    const auth = await assertHaulzSummarySandboxAccess(req, { login, password });
    if (auth.ok === false) {
      return res.status(auth.status).json({ error: auth.error, request_id: ctx.requestId });
    }
    try {
      const pool = getPool();
      const { users, customers, defaultPeriod } = await loadHaulzSummaryDirectories(pool);
      return res.status(200).json({ users, customers, defaultPeriod, request_id: ctx.requestId });
    } catch (e: unknown) {
      const err = e as Error;
      logError(ctx, "companies_sandbox_directory_failed", err);
      return res.status(500).json({ error: err?.message || "Ошибка загрузки справочников", request_id: ctx.requestId });
    }
  }

  let body: any = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); }
    catch { return res.status(400).json({ error: "Invalid JSON body", request_id: ctx.requestId }); }
  }
  const credentials = req.method === "GET"
    ? [{ login: req.headers["x-login"], password: req.headers["x-password"] }]
    : Array.isArray(body?.accounts) ? body.accounts : [body];
  if (!credentials.length || credentials.length > 20) return res.status(400).json({ error: "Допустимо от 1 до 20 аккаунтов", request_id: ctx.requestId });
  try {
    const pool = getPool();
    const all: { login: string; inn: string; name: string }[] = [];
    for (const credential of credentials) {
      const access = await resolveCompanyAccess(pool, credential?.login, credential?.password);
      if (req.method === "GET" && req.query.login && req.query.login !== access.login) {
        return res.status(403).json({ error: "Чужой аккаунт недоступен", request_id: ctx.requestId });
      }
      all.push(...access.customers.map(customer => ({ ...customer, login: access.login })));
    }
    return res.status(200).json({ companies: all, request_id: ctx.requestId });
  } catch (e) {
    if (e instanceof CompanyAccessError) return res.status(e.status).json({ error: e.message, request_id: ctx.requestId });
    logError(ctx, "companies_list_failed", e);
    return res.status(500).json({ error: "Не удалось загрузить компании", request_id: ctx.requestId });
  }
}

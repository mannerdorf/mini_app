import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyRegisteredUser } from "../lib/verifyRegisteredUser.js";
import { fetchCustomerSubcontoFrom1C } from "../lib/getcustomersSubconto1c.js";
import { initRequestContext, logError } from "./_lib/observability.js";
import { respondCorsPreflight } from "./_lib/cors.js";

async function assertRegisteredInnAccess(
  login: string,
  password: string,
  inn: string,
): Promise<{ ok: true; serviceLogin: string; servicePassword: string } | { ok: false; status: number; error: string }> {
  const serviceLogin = process.env.PEREVOZKI_SERVICE_LOGIN?.trim();
  const servicePassword = process.env.PEREVOZKI_SERVICE_PASSWORD?.trim();
  if (!serviceLogin || !servicePassword) {
    return { ok: false, status: 503, error: "Service credentials are not configured" };
  }
  const pool = getPool();
  const verified = await verifyRegisteredUser(pool, login, password);
  if (!verified) {
    return { ok: false, status: 401, error: "Неверный email или пароль" };
  }
  const innNorm = inn.replace(/\D/g, "") || inn.trim();
  if (!verified.accessAllInns) {
    const { rows } = await pool.query<{ inn: string }>(
      "SELECT inn FROM account_companies WHERE login = $1",
      [String(login).trim().toLowerCase()],
    );
    const allowed = new Set<string>(rows.map((r) => String(r.inn ?? "").trim()).filter(Boolean));
    if (verified.inn?.trim()) allowed.add(verified.inn.trim());
    if (!allowed.has(innNorm) && !allowed.has(inn.trim())) {
      return { ok: false, status: 403, error: "Нет доступа к этому заказчику" };
    }
  }
  return { ok: true, serviceLogin, servicePassword };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (respondCorsPreflight(req, res)) return;
  const ctx = initRequestContext(req, res, "getcustomer");
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

  const { login, password, inn, isRegisteredUser } = body || {};
  const innStr = String(inn ?? "").trim();
  if (!login || !password || !innStr) {
    return res.status(400).json({
      error: "login, password and inn are required",
      request_id: ctx.requestId,
    });
  }

  let authLogin = String(login);
  let authPassword = String(password);

  if (isRegisteredUser) {
    try {
      const access = await assertRegisteredInnAccess(authLogin, authPassword, innStr);
      if (!access.ok) {
        return res.status(access.status).json({ error: access.error, request_id: ctx.requestId });
      } else {
        authLogin = access.serviceLogin;
        authPassword = access.servicePassword;
      }
    } catch (e: unknown) {
      logError(ctx, "getcustomer_registered_user_failed", e);
      return res.status(500).json({
        error: "Database error",
        details: e instanceof Error ? e.message : String(e),
        request_id: ctx.requestId,
      });
    }
  }

  try {
    const { parsed, error } = await fetchCustomerSubcontoFrom1C(authLogin, authPassword, innStr);
    if (!parsed) {
      return res.status(502).json({
        error: error ?? "Unexpected Getcustomers response",
        request_id: ctx.requestId,
      });
    }

    return res.status(200).json({ customer: parsed, source: "1c_getcustomers", request_id: ctx.requestId });
  } catch (e: unknown) {
    logError(ctx, "getcustomer_proxy_failed", e);
    return res.status(500).json({
      error: "Proxy error",
      details: e instanceof Error ? e.message : String(e),
      request_id: ctx.requestId,
    });
  }
}

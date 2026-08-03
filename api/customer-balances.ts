import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyRegisteredUser } from "../lib/verifyRegisteredUser.js";
import { fetchCustomerSubcontoFrom1C } from "../lib/getcustomersSubconto1c.js";
import { initRequestContext, logError } from "./_lib/observability.js";
import { respondCorsPreflight } from "./_lib/cors.js";

const MAX_INNS = 40;

type BalanceRow = {
  inn: string;
  name: string;
  balance: number;
  debtsCount: number;
  error?: string;
};

async function resolveInns(
  login: string,
  password: string,
  isRegisteredUser: boolean,
  requestedInns: string[],
): Promise<{ inns: string[]; authLogin: string; authPassword: string } | { error: string; status: number }> {
  const unique = [...new Set(requestedInns.map((x) => String(x ?? "").trim()).filter(Boolean))].slice(0, MAX_INNS);
  if (unique.length === 0) {
    return { error: "No INNs to fetch", status: 400 };
  }

  if (!isRegisteredUser) {
    return { inns: unique, authLogin: login, authPassword: password };
  }

  const serviceLogin = process.env.PEREVOZKI_SERVICE_LOGIN?.trim();
  const servicePassword = process.env.PEREVOZKI_SERVICE_PASSWORD?.trim();
  if (!serviceLogin || !servicePassword) {
    return { error: "Service credentials are not configured", status: 503 };
  }

  const pool = getPool();
  const verified = await verifyRegisteredUser(pool, login, password);
  if (!verified) {
    return { error: "Неверный email или пароль", status: 401 };
  }

  if (verified.accessAllInns) {
    return { inns: unique, authLogin: serviceLogin, authPassword: servicePassword };
  }

  const { rows } = await pool.query<{ inn: string }>(
    "SELECT inn FROM account_companies WHERE login = $1",
    [String(login).trim().toLowerCase()],
  );
  const allowed = new Set(rows.map((r) => String(r.inn ?? "").trim()).filter(Boolean));
  if (verified.inn?.trim()) allowed.add(verified.inn.trim());

  const filtered = unique.filter((inn) => allowed.has(inn) || allowed.has(inn.replace(/\D/g, "")));
  if (filtered.length === 0) {
    return { error: "Нет доступа к указанным заказчикам", status: 403 };
  }
  return { inns: filtered, authLogin: serviceLogin, authPassword: servicePassword };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (respondCorsPreflight(req, res)) return;
  const ctx = initRequestContext(req, res, "customer-balances");
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

  const { login, password, isRegisteredUser, inns, namesByInn } = body || {};
  if (!login || !password) {
    return res.status(400).json({ error: "login and password are required", request_id: ctx.requestId });
  }

  const requestedInns: string[] = Array.isArray(inns)
    ? inns.map((x) => String(x ?? "").trim()).filter(Boolean)
    : [];

  const nameMap: Record<string, string> = {};
  if (namesByInn && typeof namesByInn === "object" && !Array.isArray(namesByInn)) {
    for (const [k, v] of Object.entries(namesByInn as Record<string, unknown>)) {
      const key = String(k).trim();
      const val = String(v ?? "").trim();
      if (key && val) nameMap[key] = val;
    }
  }

  try {
    const resolved = await resolveInns(
      String(login),
      String(password),
      !!isRegisteredUser,
      requestedInns,
    );
    if ("error" in resolved) {
      return res.status(resolved.status).json({ error: resolved.error, request_id: ctx.requestId });
    }

    const results = await Promise.all(
      resolved.inns.map(async (inn): Promise<BalanceRow> => {
        const { parsed, error } = await fetchCustomerSubcontoFrom1C(
          resolved.authLogin,
          resolved.authPassword,
          inn,
        );
        if (!parsed) {
          return {
            inn,
            name: nameMap[inn] || inn,
            balance: 0,
            debtsCount: 0,
            error: error || "Не удалось загрузить",
          };
        }
        return {
          inn: parsed.inn,
          name: parsed.name || nameMap[inn] || inn,
          balance: parsed.balance,
          debtsCount: parsed.debtsCount,
        };
      }),
    );

    const totalBalance = Math.round(results.reduce((acc, r) => acc + r.balance, 0) * 100) / 100;

    return res.status(200).json({
      balances: results,
      totalBalance,
      request_id: ctx.requestId,
    });
  } catch (e: unknown) {
    logError(ctx, "customer_balances_failed", e);
    return res.status(500).json({
      error: "Proxy error",
      details: e instanceof Error ? e.message : String(e),
      request_id: ctx.requestId,
    });
  }
}

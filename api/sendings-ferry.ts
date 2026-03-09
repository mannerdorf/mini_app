import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyRegisteredUser } from "../lib/verifyRegisteredUser.js";
import { initRequestContext, logError } from "./_lib/observability.js";

const normalizeLogin = (value: unknown) => String(value ?? "").trim().toLowerCase();
const normalizeText = (value: unknown) => String(value ?? "").trim();

function pickCredentials(req: VercelRequest, body?: any) {
  const login =
    normalizeLogin(body?.login) ||
    normalizeLogin(req.headers["x-login"]) ||
    normalizeLogin(req.query.login);
  const password =
    normalizeText(body?.password) ||
    normalizeText(req.headers["x-password"]) ||
    normalizeText(req.query.password);
  return { login, password };
}

const keyVariants = (raw: unknown): string[] => {
  const base = normalizeText(raw);
  if (!base) return [];
  const compactDigits = base.replace(/\D+/g, "");
  return compactDigits && compactDigits !== base ? [base, compactDigits] : [base];
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "sendings-ferry");
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
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

  const { login, password } = pickCredentials(req, body);
  if (!login || !password) {
    return res.status(400).json({ error: "login and password are required", request_id: ctx.requestId });
  }

  const pool = getPool();
  const verified = await verifyRegisteredUser(pool, login, password);
  if (!verified) {
    return res.status(401).json({ error: "Неверный email или пароль", request_id: ctx.requestId });
  }

  if (req.method === "GET") {
    try {
      const { rows } = await pool.query<{ row_key: string; ferry_id: number; ferry_name: string; eta: string | null }>(
        `select sf.row_key, sf.ferry_id, f.name as ferry_name, sf.eta
           from sendings_ferry sf
           join ferries f on f.id = sf.ferry_id
          where lower(trim(sf.login)) = $1`,
        [login]
      );
      const map: Record<string, { ferry_id: number; ferry_name: string; eta: string | null }> = {};
      for (const row of rows) {
        if (!row.row_key) continue;
        const entry = { ferry_id: row.ferry_id, ferry_name: row.ferry_name, eta: row.eta };
        const keys = keyVariants(row.row_key);
        for (const key of keys) {
          map[key] = entry;
        }
      }
      return res.status(200).json({ ok: true, map, request_id: ctx.requestId });
    } catch (e: any) {
      const message = String(e?.message || "");
      logError(ctx, "sendings_ferry_get_failed", e);
      if (message.toLowerCase().includes("relation") && message.toLowerCase().includes("sendings_ferry")) {
        return res.status(500).json({ error: "Таблица sendings_ferry не найдена. Примените миграцию 050_sendings_ferry.sql", request_id: ctx.requestId });
      }
      return res.status(500).json({ error: "Failed to load ferry map", details: message, request_id: ctx.requestId });
    }
  }

  const rowKey = normalizeText(body?.rowKey);
  const ferryId = body?.ferryId != null ? Number(body.ferryId) : null;
  const eta = body?.eta != null ? String(body.eta).trim() || null : null;
  const inn = normalizeText(body?.inn) || null;

  if (!rowKey) {
    return res.status(400).json({ error: "rowKey is required", request_id: ctx.requestId });
  }

  try {
    if (ferryId == null || !Number.isInteger(ferryId) || ferryId < 1) {
      await pool.query(
        `delete from sendings_ferry
          where lower(trim(login)) = $1 and row_key = $2`,
        [login, rowKey]
      );
      return res.status(200).json({ ok: true, rowKey, ferry_id: null, eta: null, request_id: ctx.requestId });
    }

    const updated = await pool.query(
      `update sendings_ferry
          set inn = $3, ferry_id = $4, eta = $5, updated_at = now()
        where lower(trim(login)) = $1 and row_key = $2`,
      [login, rowKey, inn, ferryId, eta]
    );

    if ((updated.rowCount ?? 0) === 0) {
      await pool.query(
        `insert into sendings_ferry (login, inn, row_key, ferry_id, eta)
         values ($1, $2, $3, $4, $5)`,
        [login, inn, rowKey, ferryId, eta]
      );
    }

    return res.status(200).json({ ok: true, rowKey, ferry_id: ferryId, eta, request_id: ctx.requestId });
  } catch (e: any) {
    const message = String(e?.message || "");
    logError(ctx, "sendings_ferry_post_failed", e);
    if (message.toLowerCase().includes("relation") && message.toLowerCase().includes("sendings_ferry")) {
      return res.status(500).json({ error: "Таблица sendings_ferry не найдена. Примените миграцию 050_sendings_ferry.sql", request_id: ctx.requestId });
    }
    return res.status(500).json({ error: "Failed to save ferry", details: message, request_id: ctx.requestId });
  }
}

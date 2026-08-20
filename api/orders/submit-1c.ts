import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { verifyRegisteredUser } from "../../lib/verifyRegisteredUser.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import { respondCorsPreflight } from "../_lib/cors.js";
import { normalizeOrderInn } from "../../lib/orderCustomerScope.js";
import {
  normalizeZayavkaUploadPayload,
  uploadZayavkaTo1c,
} from "../../lib/post1cZayavkaUpload.js";

const normalizeLogin = (v: unknown) => String(v ?? "").trim().toLowerCase();

function parseJsonBody(req: VercelRequest): Record<string, unknown> {
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

async function assertUserMaySubmitInn(login: string, customerInn: string, accessAllInns: boolean): Promise<string | null> {
  if (accessAllInns) return null;
  const pool = getPool();
  const key = normalizeLogin(login);
  const inn = normalizeOrderInn(customerInn);
  if (!inn) return "ЗаказчикИНН обязателен";
  const { rows } = await pool.query<{ inn: string }>(
    "SELECT inn FROM account_companies WHERE login = $1",
    [key],
  );
  const allowed = new Set(rows.map((r) => normalizeOrderInn(r.inn)).filter(Boolean));
  const { rows: userRows } = await pool.query<{ inn: string | null }>(
    "SELECT inn FROM registered_users WHERE lower(trim(login)) = $1 LIMIT 1",
    [key],
  );
  const profileInn = normalizeOrderInn(userRows[0]?.inn);
  if (profileInn) allowed.add(profileInn);
  if (allowed.size === 0) return null;
  if (!allowed.has(inn)) return "ИНН заказчика не привязан к аккаунту";
  return null;
}

/**
 * POST /api/orders/submit-1c — загрузка заявки в 1С (JSON формат PostB).
 * Тело: заявка в корне или { order: { … } }, плюс login/password.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (respondCorsPreflight(req, res)) return;
  const ctx = initRequestContext(req, res, "orders_submit_1c");

  const method = String(req.method || "").toUpperCase();
  if (method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const body = parseJsonBody(req);
  const login = normalizeLogin(body.login ?? req.headers["x-login"]);
  const password = String(body.password ?? req.headers["x-password"] ?? "").trim();
  if (!login || !password) {
    return res.status(400).json({ error: "login and password required", request_id: ctx.requestId });
  }

  const normalized = normalizeZayavkaUploadPayload(body);
  if (!normalized.ok) {
    return res.status(400).json({ error: normalized.error, request_id: ctx.requestId });
  }

  try {
    const pool = getPool();
    const verified = await verifyRegisteredUser(pool, login, password);
    if (!verified) {
      return res.status(401).json({ error: "Неверный email или пароль", request_id: ctx.requestId });
    }

    const innErr = await assertUserMaySubmitInn(login, normalized.payload.ЗаказчикИНН, verified.accessAllInns);
    if (innErr) {
      return res.status(403).json({ error: innErr, request_id: ctx.requestId });
    }

    const upload = await uploadZayavkaTo1c(normalized.payload);
    if (!upload.ok) {
      logError(ctx, "orders_submit_1c_upstream_failed", new Error(upload.error), {
        status: upload.status,
        response: upload.responseText?.slice(0, 500),
      });
      return res.status(upload.status && upload.status >= 400 ? upload.status : 502).json({
        ok: false,
        error: upload.error,
        upstream: upload.raw ?? upload.responseText,
        request_id: ctx.requestId,
      });
    }

    return res.status(200).json({
      ok: true,
      message: "Заявка передана в 1С",
      nomerZayavki: upload.nomerZayavki ?? null,
      customerInn: normalized.payload.ЗаказчикИНН,
      clientRequestNumber: normalized.payload.НомерЗаявкиКлиента || null,
      upstream: upload.raw,
      request_id: ctx.requestId,
    });
  } catch (e) {
    logError(ctx, "orders_submit_1c_failed", e);
    return res.status(500).json({
      error: (e as Error)?.message || "Ошибка загрузки заявки",
      request_id: ctx.requestId,
    });
  }
}

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { getAdminTokenFromRequest, verifyAdminToken } from "../lib/adminAuth.js";
import { writeAuditLog } from "../lib/adminAuditLog.js";
import { withErrorLog } from "../lib/requestErrorLog.js";
import { initRequestContext, logError } from "./_lib/observability.js";

const ZVONOBOT_BASE_URL = "https://lk.zvonobot.ru";

type Action = "create" | "get" | "userInfo" | "getPhones" | "getAvailableLanguages";

function parseBody(req: VercelRequest): any {
  let body: any = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  return body && typeof body === "object" ? body : {};
}

function isPhone11(v: unknown): boolean {
  return /^\d{11}$/.test(String(v ?? "").trim());
}

function normalizePhones(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((x) => String(x ?? "").trim()).filter(Boolean);
}

function validateCreatePayload(payload: any): string | null {
  const phone = String(payload?.phone ?? "").trim();
  const phones = normalizePhones(payload?.phones);
  if (!phone && phones.length === 0) return "Укажите phone или phones";
  if (phone && !isPhone11(phone)) return "phone должен содержать 11 цифр";
  if (phones.some((p) => !isPhone11(p))) return "Все номера в phones должны содержать 11 цифр";

  const outgoingPhone = String(payload?.outgoingPhone ?? "").trim();
  const dutyPhoneRaw = payload?.dutyPhone;
  const dutyPhone = dutyPhoneRaw === 1 || dutyPhoneRaw === "1" || dutyPhoneRaw === true;
  if (!outgoingPhone && !dutyPhone) return "Укажите outgoingPhone или dutyPhone=1";
  if (outgoingPhone && !isPhone11(outgoingPhone)) return "outgoingPhone должен содержать 11 цифр";

  const record = payload?.record;
  const hasRecordId = Number.isFinite(Number(record?.id));
  const hasRecordText = String(record?.text ?? "").trim().length > 0;
  if (!hasRecordId && !hasRecordText) return "Укажите record.id или record.text";
  if (hasRecordText) {
    const gender = record?.gender;
    const okGender = gender === 0 || gender === 1 || gender === "0" || gender === "1";
    if (!okGender) return "Для record.text обязателен record.gender (0/1)";
  }
  return null;
}

function validateGetPayload(payload: any): string | null {
  const list = Array.isArray(payload?.apiCallIdList) ? payload.apiCallIdList : [];
  if (list.length === 0) return "apiCallIdList обязателен";
  if (list.length > 5000) return "apiCallIdList: максимум 5000 id";
  return null;
}

async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "admin-zvonobot-sandbox");
  const token = getAdminTokenFromRequest(req);
  if (!verifyAdminToken(token)) {
    return res.status(401).json({ error: "Требуется авторизация админа", request_id: ctx.requestId });
  }

  const apiKey = String(process.env.ZVONOBOT_API_KEY || "").trim();
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      configured: Boolean(apiKey),
      keyHint: apiKey ? `${apiKey.slice(0, 4)}***${apiKey.slice(-3)}` : "",
      baseUrl: ZVONOBOT_BASE_URL,
      request_id: ctx.requestId,
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  if (!apiKey) {
    return res.status(500).json({ error: "Не задан ZVONOBOT_API_KEY в окружении", request_id: ctx.requestId });
  }

  const body = parseBody(req);
  const action = String(body?.action || "") as Action;
  const payload = body?.payload && typeof body.payload === "object" ? body.payload : {};
  if (!action) return res.status(400).json({ error: "action обязателен", request_id: ctx.requestId });

  let endpoint = "";
  if (action === "create") endpoint = "/apiCalls/create";
  if (action === "get") endpoint = "/apiCalls/get";
  if (action === "userInfo") endpoint = "/apiCalls/userInfo";
  if (action === "getPhones") endpoint = "/apiCalls/getPhones";
  if (action === "getAvailableLanguages") endpoint = "/apiCalls/getAvailableLanguages";
  if (!endpoint) return res.status(400).json({ error: "Неподдерживаемый action", request_id: ctx.requestId });

  if (action === "create") {
    const err = validateCreatePayload(payload);
    if (err) return res.status(400).json({ error: err, request_id: ctx.requestId });
  }
  if (action === "get") {
    const err = validateGetPayload(payload);
    if (err) return res.status(400).json({ error: err, request_id: ctx.requestId });
  }

  const requestBody = {
    apiKey,
    ...payload,
  };

  try {
    const upstream = await fetch(`${ZVONOBOT_BASE_URL}${endpoint}`, {
      method: action === "getAvailableLanguages" ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: action === "getAvailableLanguages" ? undefined : JSON.stringify(requestBody),
    });
    const text = await upstream.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    try {
      const pool = getPool();
      await writeAuditLog(pool, {
        action: "integration_zvonobot_sandbox_call",
        target_type: "integration",
        details: {
          action,
          endpoint,
          status: upstream.status,
          ok: upstream.ok,
          hasPhone: Boolean(payload?.phone),
          phonesCount: Array.isArray(payload?.phones) ? payload.phones.length : 0,
        },
      });
    } catch (e) {
      logError(ctx, "admin_zvonobot_sandbox_audit_failed", e);
    }

    return res.status(upstream.ok ? 200 : upstream.status).json({
      ok: upstream.ok,
      status: upstream.status,
      action,
      endpoint,
      data,
      request_id: ctx.requestId,
    });
  } catch (e: any) {
    logError(ctx, "admin_zvonobot_sandbox_failed", e);
    return res.status(500).json({
      error: e?.message || "Ошибка запроса к Zvonobot",
      request_id: ctx.requestId,
    });
  }
}

export default withErrorLog(handler);


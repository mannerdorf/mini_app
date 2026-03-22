import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { verifyPassword } from "../../lib/passwordUtils.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import { normalizeWbPerevozkaHaulzDigits } from "../lib/wbPerevozkaDigits.js";
import {
  parseGetPosilkaResponse,
  parseJsonLoose,
  sanitizePosilkaStatusLabel,
  normalizePosilkaLastStatus,
} from "../lib/postbGetapiNormalize.js";

const POSTB_GETAPI_BASE =
  process.env.POSTB_GETAPI_BASE_URL?.replace(/\/$/, "") ||
  "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GETAPI";
const POSTB_SERVICE_AUTH = process.env.POSTB_SERVICE_AUTH || "Basic YWRtaW46anVlYmZueWU=";
const POSTB_HAULZ_AUTH = process.env.POSTB_HAULZ_AUTH || "Basic Info@haulz.pro:Y2ME42XyI_";

function qsOne(req: VercelRequest, key: string): string {
  const v = req.query[key];
  if (v === undefined || v === null) return "";
  if (Array.isArray(v)) return String(v[0] ?? "").trim();
  return String(v).trim();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "haulz_postb_posilka");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  try {
    const login = String(req.headers["x-login"] ?? "").trim().toLowerCase();
    const password = String(req.headers["x-password"] ?? "").trim();
    if (!login || !password) {
      return res.status(401).json({ error: "Требуется авторизация", request_id: ctx.requestId });
    }
    const code = qsOne(req, "code");
    if (!code) return res.status(400).json({ error: "Укажите ШК посылки", request_id: ctx.requestId });

    const pool = getPool();
    const meRes = await pool.query<{
      password_hash: string;
      permissions: Record<string, boolean> | null;
      active: boolean;
    }>(
      "SELECT password_hash, permissions, active FROM registered_users WHERE lower(trim(login)) = $1 LIMIT 1",
      [login],
    );
    const me = meRes.rows[0];
    if (!me || !me.active || !verifyPassword(password, me.password_hash)) {
      return res.status(401).json({ error: "Неверный логин или пароль", request_id: ctx.requestId });
    }
    const perms = me.permissions && typeof me.permissions === "object" ? me.permissions : {};
    const canUse =
      perms.haulz === true || perms.wb === true || perms.wb_admin === true || perms.cms_access === true;
    if (!canUse) {
      return res.status(403).json({ error: "Раздел недоступен для вашего профиля", request_id: ctx.requestId });
    }

    const sp = new URLSearchParams();
    sp.set("metod", "GetPosilka");
    sp.set("code", code);
    const url = `${POSTB_GETAPI_BASE}?${sp.toString()}`;
    const upstream = await fetch(url, {
      headers: {
        Auth: POSTB_HAULZ_AUTH,
        Authorization: POSTB_SERVICE_AUTH,
        Accept: "application/json, text/plain, */*",
      },
    });
    const text = await upstream.text();
    const parsed = parseJsonLoose(text);
    if (!upstream.ok) {
      return res.status(200).json({
        ok: false,
        httpStatus: upstream.status,
        error: text.slice(0, 500),
        request_id: ctx.requestId,
      });
    }

    const parsedPos = parseGetPosilkaResponse(parsed);
    const lastStatus = sanitizePosilkaStatusLabel(parsedPos.lastStatus || normalizePosilkaLastStatus(parsed));
    const perevozka = normalizeWbPerevozkaHaulzDigits(String(parsedPos.perevozka ?? "").trim());
    return res.status(200).json({
      ok: true,
      lastStatus,
      perevozka,
      posilkaSteps: parsedPos.posilkaSteps,
      raw: parsed,
      request_id: ctx.requestId,
    });
  } catch (error) {
    logError(ctx, "haulz_postb_posilka_failed", error);
    return res.status(500).json({ error: "Ошибка запроса к PostB", request_id: ctx.requestId });
  }
}


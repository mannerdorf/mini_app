import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initRequestContext, logError } from "../_lib/observability.js";
import { getPool } from "../_db.js";
import { resolveWbAccess } from "../_wb.js";
import {
  normalizePerevozkaSteps,
  normalizePosilkaLastStatus,
  parseGetPosilkaResponse,
  parseJsonLoose,
} from "../lib/postbGetapiNormalize.js";

/** Как в api/download.ts — GETAPI: Auth (Haulz) + Authorization (admin) */
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
  const ctx = initRequestContext(req, res, "wb_postb_getapi");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  try {
    const pool = getPool();
    const access = await resolveWbAccess(req, pool, "read");
    if (!access) return res.status(401).json({ error: "Нет доступа", request_id: ctx.requestId });

    const kind = qsOne(req, "kind").toLowerCase();
    const code = qsOne(req, "code");
    const number = qsOne(req, "number");

    const sp = new URLSearchParams();
    if (kind === "posilka") {
      if (!code) return res.status(400).json({ error: "Укажите code", request_id: ctx.requestId });
      sp.set("metod", "GetPosilka");
      sp.set("code", code);
    } else if (kind === "perevozka") {
      if (!number) return res.status(400).json({ error: "Укажите number", request_id: ctx.requestId });
      sp.set("metod", "Getperevozka");
      sp.set("Number", number);
    } else {
      return res.status(400).json({ error: "kind должен быть posilka или perevozka", request_id: ctx.requestId });
    }

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
        lastStatus: "",
        perevozka: "",
        posilkaSteps: [] as Array<{ title: string; date: string }>,
        steps: [] as Array<{ title: string; date: string }>,
        error: text.slice(0, 500),
        request_id: ctx.requestId,
      });
    }

    if (kind === "posilka") {
      const parsedPos = parseGetPosilkaResponse(parsed);
      const lastStatus = parsedPos.lastStatus || normalizePosilkaLastStatus(parsed);
      return res.status(200).json({
        ok: true,
        lastStatus,
        perevozka: parsedPos.perevozka,
        posilkaSteps: parsedPos.posilkaSteps,
        raw: parsed,
        request_id: ctx.requestId,
      });
    }

    const steps = normalizePerevozkaSteps(parsed);
    return res.status(200).json({
      ok: true,
      steps,
      raw: parsed,
      request_id: ctx.requestId,
    });
  } catch (error) {
    logError(ctx, "wb_postb_getapi_failed", error);
    return res.status(500).json({ error: "Ошибка запроса к PostB", request_id: ctx.requestId });
  }
}

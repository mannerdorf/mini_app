import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initRequestContext, logError } from "../_lib/observability.js";
import { getPool } from "../_db.js";
import { pgTableExists, resolveWbAccess } from "../_wb.js";
import {
  normalizePerevozkaSteps,
  normalizePosilkaLastStatus,
  parseGetPosilkaResponse,
  parseJsonLoose,
  sanitizePosilkaStatusLabel,
} from "../lib/postbGetapiNormalize.js";

/** Как в api/download.ts — GETAPI: Auth (Haulz) + Authorization (admin) */
const POSTB_GETAPI_BASE =
  process.env.POSTB_GETAPI_BASE_URL?.replace(/\/$/, "") ||
  "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GETAPI";
const POSTB_SERVICE_AUTH = process.env.POSTB_SERVICE_AUTH || "Basic YWRtaW46anVlYmZueWU=";
const POSTB_HAULZ_AUTH = process.env.POSTB_HAULZ_AUTH || "Basic Info@haulz.pro:Y2ME42XyI_";

/** Не опрашивать PostB чаще, чем раз в N часов (параметр ?refresh=1 — принудительно). */
const POSILKA_CACHE_TTL_MS = (Number(process.env.WB_POSILKA_CACHE_TTL_HOURS) || 24) * 3600 * 1000;

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
      const codeNorm = code.trim().toLowerCase();
      const forceRefresh = qsOne(req, "refresh") === "1";

      if (!forceRefresh && (await pgTableExists(pool, "wb_postb_posilka_cache"))) {
        const cached = await pool.query<{
          last_status: string;
          perevozka: string;
          posilka_steps: unknown;
          updated_at: Date;
        }>(
          `select last_status, perevozka, posilka_steps, updated_at
           from wb_postb_posilka_cache
           where posilka_code_norm = $1`,
          [codeNorm],
        );
        const row = cached.rows[0];
        if (row) {
          const age = Date.now() - new Date(row.updated_at).getTime();
          if (age >= 0 && age < POSILKA_CACHE_TTL_MS) {
            const steps = Array.isArray(row.posilka_steps) ? row.posilka_steps : [];
            return res.status(200).json({
              ok: true,
              lastStatus: String(row.last_status ?? "").trim(),
              perevozka: String(row.perevozka ?? "").trim(),
              posilkaSteps: steps as Array<{ title: string; date: string }>,
              cached: true,
              request_id: ctx.requestId,
            });
          }
        }
      }

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
      const codeNorm = code.trim().toLowerCase();
      const parsedPos = parseGetPosilkaResponse(parsed);
      const lastStatus = sanitizePosilkaStatusLabel(
        parsedPos.lastStatus || normalizePosilkaLastStatus(parsed),
      );
      const perevozka = String(parsedPos.perevozka ?? "").trim();
      const posilkaSteps = parsedPos.posilkaSteps;

      if (await pgTableExists(pool, "wb_postb_posilka_cache")) {
        try {
          await pool.query(
            `insert into wb_postb_posilka_cache (posilka_code, posilka_code_norm, last_status, perevozka, posilka_steps, updated_at)
             values ($1, $2, $3, $4, $5::jsonb, now())
             on conflict (posilka_code_norm) do update set
               posilka_code = excluded.posilka_code,
               last_status = excluded.last_status,
               perevozka = excluded.perevozka,
               posilka_steps = excluded.posilka_steps,
               updated_at = now()`,
            [code.trim(), codeNorm, lastStatus, perevozka, JSON.stringify(posilkaSteps)],
          );
        } catch (e) {
          logError(ctx, "wb_postb_posilka_cache_upsert_failed", e);
        }
      }

      return res.status(200).json({
        ok: true,
        lastStatus,
        perevozka,
        posilkaSteps,
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

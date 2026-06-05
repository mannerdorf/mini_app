import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import { pgTableExists } from "../_haulzReturns.js";
import { resolveHaulzCalculatorAccess } from "../_haulzCalculator.js";
import { pickHaulzCredentials } from "../_haulzReturns.js";
import { getClientIp, isRateLimited, HAULZ_CALC_SUGGEST_LIMIT } from "../../lib/rateLimit.js";
import { suggestAddresses } from "../../lib/haulzCalculator/addressSuggest.js";

function readSuggestParams(req: VercelRequest): { q: string; city?: "moscow" | "kaliningrad" } {
  let body: Record<string, unknown> = {};
  if (req.method === "POST") {
    const raw = req.body;
    if (typeof raw === "string") {
      try {
        body = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        body = {};
      }
    } else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      body = raw as Record<string, unknown>;
    }
  }
  const q = String(req.query.q ?? body.q ?? "").trim();
  const cityRaw = String(req.query.city ?? body.city ?? "")
    .trim()
    .toLowerCase();
  const city = cityRaw === "moscow" || cityRaw === "kaliningrad" ? cityRaw : undefined;
  return { q, city };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "haulz_calculator_suggest");
  if (isRateLimited("haulz_calc_suggest", getClientIp(req), HAULZ_CALC_SUGGEST_LIMIT)) {
    return res.status(429).json({ error: "Слишком много запросов подсказок", request_id: ctx.requestId });
  }
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const access = await resolveHaulzCalculatorAccess(req, req.body);
  if (!access) {
    const creds = pickHaulzCredentials(req, req.body);
    if (!creds.login || !creds.password) {
      return res.status(401).json({ error: "Нет доступа: укажите login и password", request_id: ctx.requestId });
    }
    return res.status(401).json({ error: "Нет доступа", request_id: ctx.requestId });
  }

  const pool = getPool();
  if (!(await pgTableExists(pool, "haulz_calc_api_cache"))) {
    return res.status(503).json({
      error: "Выполните миграцию migrations/083_haulz_calculator.sql",
      request_id: ctx.requestId,
    });
  }

  const { q, city } = readSuggestParams(req);

  if (q.length < 2) {
    return res.status(200).json({ items: [], request_id: ctx.requestId });
  }

  try {
    const items = await suggestAddresses(q, { city }, pool);
    return res.status(200).json({ items, request_id: ctx.requestId });
  } catch (e) {
    logError(ctx, "haulz_calculator_suggest_failed", e);
    const msg = (e as Error)?.message || "Ошибка подсказок адреса";
    const hint = msg.includes("DADATA_API_KEY")
      ? " Задайте DADATA_API_KEY на Vercel."
      : msg.includes("HAULZ_DGIS")
        ? " Задайте HAULZ_DGIS_API_KEY на Vercel."
        : "";
    return res.status(500).json({
      error: msg + hint,
      request_id: ctx.requestId,
    });
  }
}

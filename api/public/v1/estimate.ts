import type { VercelRequest, VercelResponse } from "@vercel/node";
import { publicApiPreflight } from "./_preflight.js";
import { getPool } from "../../_db.js";
import { initRequestContext, logError } from "../../_lib/observability.js";
import { applyApiCors } from "../../_lib/cors.js";
import { pgTableExists } from "../../_haulzReturns.js";
import { getClientIp, isRateLimited } from "../../../lib/rateLimit.js";
import { buildPublicEstimate } from "../../../lib/haulzCalculator/publicEstimate.js";
import { parseMainlineMode } from "../../../lib/haulzCalculator/mainlineMode.js";
import type { Direction } from "../../../lib/haulzCalculator/types.js";

const PUBLIC_ESTIMATE_LIMIT = 60;

function parseDirection(raw: unknown): Direction | null {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (v === "mow_kgd" || v === "moscow_kaliningrad" || v === "msk_kgd") return "mow_kgd";
  if (v === "kgd_mow" || v === "kaliningrad_moscow" || v === "kgd_msk") return "kgd_mow";
  return null;
}

function readEstimateParams(req: VercelRequest): {
  direction: Direction | null;
  weightKg: number;
  volumeM3?: number;
  mode: ReturnType<typeof parseMainlineMode>;
} {
  const q = req.query ?? {};
  const direction = parseDirection(q.direction ?? q.route);
  const weightKg = Number(q.weight_kg ?? q.weightKg ?? q.weight);
  const volumeRaw = q.volume_m3 ?? q.volumeM3 ?? q.volume;
  const volumeM3 = volumeRaw != null && volumeRaw !== "" ? Number(volumeRaw) : undefined;
  const mode = parseMainlineMode(q.mode ?? q.mainline_mode, "ferry");
  return { direction, weightKg, volumeM3, mode };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (publicApiPreflight(req, res)) return;
  applyApiCors(res);
  const ctx = initRequestContext(req, res, "public_v1_estimate");

  if (isRateLimited("public_estimate", getClientIp(req), PUBLIC_ESTIMATE_LIMIT)) {
    return res.status(429).json({ error: "Слишком много запросов", request_id: ctx.requestId });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const body = req.method === "POST" && req.body && typeof req.body === "object" ? req.body : {};
  const fromQuery = readEstimateParams(req);
  const direction = parseDirection((body as Record<string, unknown>).direction) ?? fromQuery.direction;
  const weightKg = Number((body as Record<string, unknown>).weight_kg ?? (body as Record<string, unknown>).weightKg) || fromQuery.weightKg;
  const volumeM3Raw = (body as Record<string, unknown>).volume_m3 ?? (body as Record<string, unknown>).volumeM3;
  const volumeM3 = volumeM3Raw != null ? Number(volumeM3Raw) : fromQuery.volumeM3;
  const mode = parseMainlineMode((body as Record<string, unknown>).mode ?? (body as Record<string, unknown>).mainline_mode, fromQuery.mode);

  if (!direction) {
    return res.status(400).json({
      error: "direction обязателен: mow_kgd | kgd_mow",
      request_id: ctx.requestId,
    });
  }
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    return res.status(400).json({
      error: "weight_kg обязателен и должен быть > 0",
      request_id: ctx.requestId,
    });
  }

  const pool = getPool();
  if (!(await pgTableExists(pool, "haulz_calc_tariff_sets"))) {
    return res.status(503).json({
      error: "Калькулятор тарифов недоступен",
      request_id: ctx.requestId,
    });
  }

  try {
    const estimate = await buildPublicEstimate(pool, {
      direction,
      weightKg,
      volumeM3: Number.isFinite(volumeM3) ? volumeM3 : undefined,
      mode,
    });
    return res.status(200).json({ estimate, request_id: ctx.requestId });
  } catch (e) {
    logError(ctx, "public_v1_estimate_failed", e);
    return res.status(500).json({
      error: (e as Error)?.message || "Ошибка расчёта",
      request_id: ctx.requestId,
    });
  }
}

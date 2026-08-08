import type { VercelRequest, VercelResponse } from "@vercel/node";
import { haulzCalculatorPreflight } from "./_preflight.js";
import { getPool } from "../_db.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import { pgTableExists } from "../_haulzReturns.js";
import { resolveHaulzCalcManagerAccess } from "../_haulzCalculator.js";
import { pickHaulzCredentials } from "../_haulzReturns.js";
import { getClientIp, isRateLimited, HAULZ_CALC_QUOTE_LIMIT } from "../../lib/rateLimit.js";
import { setDraftStatusByManager } from "../../lib/haulzCalculator/calculatorDraftAgree.js";
import { parseHaulzCalcDraftStatus } from "../../lib/haulzCalculator/draftStatus.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (haulzCalculatorPreflight(req, res)) return;
  const ctx = initRequestContext(req, res, "haulz_calculator_draft_status");
  if (isRateLimited("haulz_calc_draft_status", getClientIp(req), HAULZ_CALC_QUOTE_LIMIT)) {
    return res.status(429).json({ error: "Слишком много запросов", request_id: ctx.requestId });
  }
  if (req.method !== "PATCH" && req.method !== "POST") {
    res.setHeader("Allow", "PATCH, POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const access = await resolveHaulzCalcManagerAccess(req, req.body);
  if (!access) {
    const creds = pickHaulzCredentials(req, req.body);
    if (!creds.login || !creds.password) {
      return res.status(401).json({ error: "Нет доступа", request_id: ctx.requestId });
    }
    return res.status(403).json({ error: "Только для менеджера HAULZ", request_id: ctx.requestId });
  }

  const pool = getPool();
  if (!(await pgTableExists(pool, "haulz_calc_drafts"))) {
    return res.status(503).json({
      error: "Выполните миграцию migrations/086_haulz_calc_draft_agree.sql",
      request_id: ctx.requestId,
    });
  }

  const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
  const id = Number(body.id ?? req.query.id);
  const status = parseHaulzCalcDraftStatus(body.status);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: "Укажите id заявки", request_id: ctx.requestId });
  }
  if (status === "draft") {
    return res.status(400).json({
      error: "Нельзя установить статус «Черновик»",
      request_id: ctx.requestId,
    });
  }

  try {
    const draft = await setDraftStatusByManager(pool, id, status);
    if (!draft) {
      return res.status(404).json({
        error: "Заявка не найдена или это черновик",
        request_id: ctx.requestId,
      });
    }
    return res.status(200).json({ draft, request_id: ctx.requestId });
  } catch (e) {
    logError(ctx, "haulz_calc_draft_status_failed", e);
    return res.status(500).json({
      error: (e as Error)?.message || "Ошибка обновления статуса",
      request_id: ctx.requestId,
    });
  }
}

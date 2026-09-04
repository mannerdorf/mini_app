import type { VercelRequest, VercelResponse } from "@vercel/node";
import { haulzCalculatorPreflight } from "./_preflight.js";
import { getPool } from "../_db.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import { pgTableExists } from "../_haulzReturns.js";
import { resolveHaulzCalcManagerAccess } from "../_haulzCalculator.js";
import { pickHaulzCredentials } from "../_haulzReturns.js";
import { getClientIp, isRateLimited, HAULZ_CALC_QUOTE_LIMIT } from "../../lib/rateLimit.js";
import {
  deleteDraftByManager,
  listAllCalcDraftsForManager,
} from "../../lib/haulzCalculator/calculatorDraftAgree.js";
import { enrichManagerDraftForApi } from "../../lib/haulzCalculator/managerDraftJournalEnrich.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (haulzCalculatorPreflight(req, res)) return;
  const ctx = initRequestContext(req, res, "haulz_calculator_drafts_manager");
  if (isRateLimited("haulz_calc_drafts_mgr", getClientIp(req), HAULZ_CALC_QUOTE_LIMIT)) {
    return res.status(429).json({ error: "Слишком много запросов", request_id: ctx.requestId });
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

  if (req.method === "DELETE") {
    const id = Number(req.query.id ?? (req.body as Record<string, unknown>)?.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "Укажите id заявки", request_id: ctx.requestId });
    }
    try {
      const ok = await deleteDraftByManager(pool, id);
      if (!ok) {
        return res.status(404).json({ error: "Заявка не найдена", request_id: ctx.requestId });
      }
      return res.status(200).json({ ok: true, request_id: ctx.requestId });
    } catch (e) {
      logError(ctx, "haulz_calc_drafts_manager_delete_failed", e);
      return res.status(500).json({
        error: (e as Error)?.message || "Ошибка удаления заявки",
        request_id: ctx.requestId,
      });
    }
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, DELETE");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  try {
    const drafts = await listAllCalcDraftsForManager(pool);
    const enriched = await Promise.all(drafts.map((d) => enrichManagerDraftForApi(pool, d)));
    return res.status(200).json({ drafts: enriched, request_id: ctx.requestId });
  } catch (e) {
    logError(ctx, "haulz_calc_drafts_manager_failed", e);
    return res.status(500).json({
      error: (e as Error)?.message || "Ошибка загрузки заявок",
      request_id: ctx.requestId,
    });
  }
}

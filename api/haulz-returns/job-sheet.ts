import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import {
  assertJobOwner,
  pgTableExists,
  resolveHaulzReturnsAccess,
} from "../_haulzReturns.js";
import { deserializeWorkbook, sheetFromWorkbook } from "../../lib/haulzReturns/workbookApi.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "haulz_returns_job_sheet");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const access = await resolveHaulzReturnsAccess(req);
  if (!access) {
    return res.status(401).json({ error: "Нет доступа", request_id: ctx.requestId });
  }

  const jobId = Number(req.query.jobId);
  const sheetId = String(req.query.sheetId ?? "").trim();
  if (!Number.isFinite(jobId) || jobId <= 0 || !sheetId) {
    return res.status(400).json({ error: "Укажите jobId и sheetId", request_id: ctx.requestId });
  }

  const pool = getPool();
  if (!(await pgTableExists(pool, "haulz_returns_workbooks"))) {
    return res.status(503).json({
      error: "Выполните миграцию migrations/080_haulz_returns.sql",
      request_id: ctx.requestId,
    });
  }
  if (!(await assertJobOwner(pool, jobId, access.loginKey))) {
    return res.status(404).json({ error: "Сессия не найдена", request_id: ctx.requestId });
  }

  try {
    const { rows } = await pool.query<{ sheets: unknown; itog_control_keys: unknown }>(
      `select sheets, itog_control_keys
       from haulz_returns_workbooks
       where job_id = $1
       order by version desc
       limit 1`,
      [jobId],
    );
    const row = rows[0];
    if (!row) {
      return res.status(404).json({ error: "Workbook не найден", request_id: ctx.requestId });
    }

    const wb = deserializeWorkbook(row.sheets, row.itog_control_keys);
    const sheet = sheetFromWorkbook(wb, sheetId);
    if (!sheet) {
      return res.status(404).json({ error: "Лист не найден", request_id: ctx.requestId });
    }

    if (sheetId.startsWith("ul-")) {
      return res.status(200).json({
        sheet: { ...sheet, rows: [], ulDeferred: true },
        request_id: ctx.requestId,
      });
    }

    try {
      return res.status(200).json({ sheet, request_id: ctx.requestId });
    } catch (e) {
      logError(ctx, "haulz_returns_job_sheet_payload", e);
      return res.status(413).json({
        error: "Лист слишком большой для ответа API. Сохраните результат через «Экспорт».",
        request_id: ctx.requestId,
      });
    }
  } catch (e) {
    logError(ctx, "haulz_returns_job_sheet_failed", e);
    const msg = (e as Error)?.message || "Ошибка сервера";
    return res.status(500).json({ error: msg, request_id: ctx.requestId });
  }
}

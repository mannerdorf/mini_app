import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import {
  assertJobOwner,
  pgTableExists,
  resolveHaulzReturnsAccess,
} from "../_haulzReturns.js";
import type { HaulzWorkbook } from "../../lib/haulzReturns/types.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "haulz_returns_job_workbook");
  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const access = await resolveHaulzReturnsAccess(req, req.body);
  if (!access) {
    return res.status(401).json({ error: "Нет доступа", request_id: ctx.requestId });
  }

  const jobId = Number(req.body?.jobId);
  if (!Number.isFinite(jobId) || jobId <= 0) {
    return res.status(400).json({ error: "Укажите jobId", request_id: ctx.requestId });
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
    const bodyBytes = JSON.stringify(req.body ?? {}).length;
    // #region agent log
    console.log(
      JSON.stringify({
        sessionId: "e39252",
        location: "job-workbook.ts:handler",
        message: "patch_received",
        hypothesisId: "F",
        data: { jobId, bodyBytes },
        timestamp: Date.now(),
      }),
    );
    // #endregion
    if (bodyBytes > 4_000_000) {
      return res.status(413).json({
        error: `Тело запроса слишком большое (${Math.round(bodyBytes / 1024)} КБ). Используйте «Обработать» — сервер соберёт результат из файлов в БД.`,
        request_id: ctx.requestId,
      });
    }

    const {
      deserializeWorkbook,
      parseItogControlKeysMeta,
      WORKBOOK_META_SHEET_ID,
    } = await import("../../lib/haulzReturns/workbookApi.js");
    const { insertWorkbookVersion } = await import("../../lib/haulzReturns/workbookStorage.js");

    const raw = req.body?.workbook as HaulzWorkbook | undefined;
    if (!raw?.sheets || !Array.isArray(raw.sheets)) {
      return res.status(400).json({ error: "Передайте workbook.sheets", request_id: ctx.requestId });
    }
    const keysMeta = parseItogControlKeysMeta(raw.itogControlKeys);
    const metaSheet = raw.sheets.find((s) => String(s?.id ?? "") === WORKBOOK_META_SHEET_ID) as
      | { tdDraft?: HaulzWorkbook["tdDraft"]; tdPrepared?: HaulzWorkbook["tdPrepared"] }
      | undefined;
    const wb: HaulzWorkbook = {
      sheets: raw.sheets.filter((s) => String(s?.id ?? "") !== WORKBOOK_META_SHEET_ID),
      itogControlKeys: keysMeta.itogControlKeys,
      excludedUlNumbers: new Set([
        ...keysMeta.excludedUlNumbers,
        ...(Array.isArray(raw.excludedUlNumbers) ? raw.excludedUlNumbers.map(String) : []),
      ]),
      tdDraft: metaSheet?.tdDraft ?? raw.tdDraft,
      tdPrepared: metaSheet?.tdPrepared ?? raw.tdPrepared,
    };

    const { rows: storedRows } = await pool.query<{ sheets: unknown; itog_control_keys: unknown }>(
      `select sheets, itog_control_keys
       from haulz_returns_workbooks
       where job_id = $1
       order by version desc
       limit 1`,
      [jobId],
    );
    const stored = storedRows[0]
      ? deserializeWorkbook(storedRows[0].sheets, storedRows[0].itog_control_keys)
      : null;
    const version = await insertWorkbookVersion(pool, jobId, access.loginKey, wb, { stored });
    await pool.query(
      `update haulz_returns_jobs set status = 'ready', updated_at = now() where id = $1`,
      [jobId],
    );

    return res.status(200).json({
      ok: true,
      workbookVersion: version,
      request_id: ctx.requestId,
    });
  } catch (e) {
    logError(ctx, "haulz_returns_job_workbook_failed", e);
    const msg = (e as Error)?.message || "Ошибка сохранения";
    return res.status(500).json({ error: msg, request_id: ctx.requestId });
  }
}

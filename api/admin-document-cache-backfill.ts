import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { getAdminTokenFromRequest, verifyAdminToken } from "../lib/adminAuth.js";
import { CACHE_EARLIEST_DATE, CACHE_HISTORY_DAYS, cacheBackfillRangeStart } from "../lib/cacheHistoryDays.js";
import {
  addDaysIso,
  CACHE_BACKFILL_STEP_DAYS,
  ensureDocumentCacheTables,
  isoDate,
  minIso,
  readCacheCoverageStats,
  readCacheCoverageByMonth,
  refreshDatedKindForWindow,
  type DatedDocumentCacheKind,
} from "../lib/documentCacheRefreshCore.js";
import {
  migrateBlobToNormalizedBatch,
  NORMALIZED_DOCUMENT_KINDS,
  readNormalizedState,
  type NormalizedDocumentKind,
} from "../lib/documentCacheNormalized.js";
import { initRequestContext, logError, logInfo } from "./_lib/observability.js";

export const config = { maxDuration: 300 };

const BACKFILL_KINDS: DatedDocumentCacheKind[] = ["perevozki", "sendings", "invoices", "acts"];

const KIND_LABELS: Record<DatedDocumentCacheKind, string> = {
  perevozki: "перевозки",
  sendings: "отправки",
  invoices: "счета",
  acts: "УПД",
  orders: "заявки",
};

type BackfillStateRow = {
  range_start: string;
  range_end: string;
  next_from: string;
  step_days: number;
  kind_cursor: number;
  done: boolean;
  last_step: unknown;
  updated_at: Date;
};

async function loadBackfillState(pool: ReturnType<typeof getPool>): Promise<BackfillStateRow> {
  await ensureDocumentCacheTables(pool);
  const { rows } = await pool.query<BackfillStateRow>(
    `select range_start::text, range_end::text, next_from::text, step_days, kind_cursor, done, last_step, updated_at
     from document_cache_backfill_state where id = 1`,
  );
  if (!rows[0]) throw new Error("document_cache_backfill_state missing — нажмите «Сбросить прогресс»");
  return rows[0];
}

function serializeState(state: BackfillStateRow) {
  const kindIndex = Math.max(0, Math.min(BACKFILL_KINDS.length - 1, Number(state.kind_cursor) || 0));
  return {
    rangeStart: state.range_start,
    rangeEnd: state.range_end,
    nextFrom: state.next_from,
    stepDays: state.step_days,
    kindCursor: kindIndex,
    nextKind: BACKFILL_KINDS[kindIndex] ?? "perevozki",
    nextKindLabel: KIND_LABELS[BACKFILL_KINDS[kindIndex] ?? "perevozki"],
    done: state.done,
    lastStep: state.last_step ?? null,
    updatedAt: state.updated_at?.toISOString?.() ?? null,
  };
}

async function resetBackfillState(pool: ReturnType<typeof getPool>, historyDays: number, stepDays: number) {
  const today = isoDate(new Date());
  const rangeStart = cacheBackfillRangeStart(new Date(), historyDays);
  await pool.query(
    `update document_cache_backfill_state
     set range_start = $1::date, range_end = $2::date, next_from = $1::date, step_days = $3,
         kind_cursor = 0, done = false, last_step = null, updated_at = now()
     where id = 1`,
    [rangeStart, today, stepDays],
  );
}

async function loadCoverageByMonth(pool: ReturnType<typeof getPool>, state?: BackfillStateRow) {
  return readCacheCoverageByMonth(pool, {
    rangeStart: state?.range_start,
    rangeEnd: state?.range_end,
    nextFrom: state?.next_from,
    done: state?.done,
    earliestDate: CACHE_EARLIEST_DATE,
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "admin-document-cache-backfill");
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  if (!verifyAdminToken(getAdminTokenFromRequest(req))) {
    return res.status(401).json({ error: "Требуется авторизация админа", request_id: ctx.requestId });
  }

  const login = String(process.env.PEREVOZKI_SERVICE_LOGIN ?? "").trim();
  const password = String(process.env.PEREVOZKI_SERVICE_PASSWORD ?? "").trim();
  if (!login || !password) {
    return res.status(503).json({ error: "Не заданы PEREVOZKI_SERVICE_LOGIN / PEREVOZKI_SERVICE_PASSWORD", request_id: ctx.requestId });
  }

  let body: any = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  try {
    const pool = getPool();
    await ensureDocumentCacheTables(pool);

    if (req.method === "GET") {
      const state = await loadBackfillState(pool);
      const coverage = await readCacheCoverageStats(pool);
      const coverageByMonth = await loadCoverageByMonth(pool, state);
      const normalized = await readNormalizedState(pool);
      return res.status(200).json({
        ok: true,
        historyDays: CACHE_HISTORY_DAYS,
        cacheEarliestDate: CACHE_EARLIEST_DATE,
        stepDaysDefault: CACHE_BACKFILL_STEP_DAYS,
        state: serializeState(state),
        coverage,
        normalized,
        coverageByMonth,
        request_id: ctx.requestId,
      });
    }

    const action = String(body?.action ?? "step").trim();
    const historyDays = Math.max(30, Math.min(730, Number(body?.historyDays) || CACHE_HISTORY_DAYS));
    const stepDays = Math.max(7, Math.min(90, Number(body?.stepDays) || CACHE_BACKFILL_STEP_DAYS));
    const maxSteps = Math.max(1, Math.min(20, Number(body?.maxSteps) || 1));

    if (action === "reset") {
      await resetBackfillState(pool, historyDays, stepDays);
      const state = await loadBackfillState(pool);
      logInfo(ctx, "document_cache_backfill_reset", { historyDays, stepDays });
      return res.status(200).json({
        ok: true,
        action: "reset",
        state: serializeState(state),
        request_id: ctx.requestId,
      });
    }

    if (action === "migrate_normalized") {
      const kindRaw = String(body?.kind ?? "perevozki").trim() as NormalizedDocumentKind;
      const kind = NORMALIZED_DOCUMENT_KINDS.includes(kindRaw) ? kindRaw : "perevozki";
      const offset = Math.max(0, Number(body?.offset) || 0);
      const batchSize = Math.max(50, Math.min(2000, Number(body?.batchSize) || 500));
      const result = await migrateBlobToNormalizedBatch(pool, kind, offset, batchSize);
      const normalized = await readNormalizedState(pool);
      logInfo(ctx, "document_cache_migrate_normalized", result);
      return res.status(200).json({
        ok: true,
        action: "migrate_normalized",
        result,
        normalized,
        nextOffset: result.done ? 0 : offset + result.processed,
        request_id: ctx.requestId,
      });
    }

    let state = await loadBackfillState(pool);
    if (action === "reset_and_run") {
      await resetBackfillState(pool, historyDays, stepDays);
      state = await loadBackfillState(pool);
    }

    if (state.done) {
      const coverage = await readCacheCoverageStats(pool);
      return res.status(200).json({
        ok: true,
        done: true,
        message: "Backfill уже завершён. Для повторного прогона вызовите action=reset.",
        state: serializeState(state),
        coverage,
        request_id: ctx.requestId,
      });
    }

    const steps: Array<{
      dateFrom: string;
      dateTo: string;
      kind: string;
      fetched: number;
      cacheTotal: number;
      error?: string;
    }> = [];

    for (let i = 0; i < maxSteps && !state.done; i += 1) {
      if (state.next_from > state.range_end) {
        await pool.query(`update document_cache_backfill_state set done = true, updated_at = now() where id = 1`);
        state.done = true;
        break;
      }

      const kindIndex = Math.max(0, Math.min(BACKFILL_KINDS.length - 1, Number(state.kind_cursor) || 0));
      const kind = BACKFILL_KINDS[kindIndex];
      const dateFrom = state.next_from;
      const dateTo = minIso(addDaysIso(dateFrom, stepDays - 1), state.range_end);

      let kindResult: { kind: string; fetched: number; cacheTotal: number; error?: string };
      try {
        const r = await refreshDatedKindForWindow(pool, login, password, kind, dateFrom, dateTo, "backfill", { webPush: false });
        kindResult = { kind, fetched: r.chunkCountRows, cacheTotal: r.cacheCount };
      } catch (e: any) {
        kindResult = { kind, fetched: 0, cacheTotal: 0, error: e?.message || String(e) };
      }

      const isLastKindInWindow = kindIndex >= BACKFILL_KINDS.length - 1;
      const nextKindCursor = isLastKindInWindow ? 0 : kindIndex + 1;
      const nextFrom = isLastKindInWindow ? addDaysIso(dateTo, 1) : state.next_from;
      const done = isLastKindInWindow && nextFrom > state.range_end;
      const stepPayload = {
        dateFrom,
        dateTo,
        kind,
        ...kindResult,
        advancedWindow: isLastKindInWindow,
        done,
      };

      await pool.query(
        `update document_cache_backfill_state
         set next_from = $1::date, kind_cursor = $2, done = $3, last_step = $4::jsonb, updated_at = now()
         where id = 1`,
        [nextFrom, nextKindCursor, done, JSON.stringify(stepPayload)],
      );

      steps.push({ dateFrom, dateTo, ...kindResult });
      state = await loadBackfillState(pool);
      if (done) break;
    }

    const coverage = await readCacheCoverageStats(pool);
    const coverageByMonth = await loadCoverageByMonth(pool, state);
    logInfo(ctx, "document_cache_backfill_step", { steps: steps.length, done: state.done });

    return res.status(200).json({
      ok: true,
      action,
      steps,
      state: serializeState(state),
      coverage,
      coverageByMonth,
      request_id: ctx.requestId,
    });
  } catch (e: any) {
    logError(ctx, "admin_document_cache_backfill_failed", e);
    return res.status(500).json({ error: e?.message || "Ошибка backfill кэша", request_id: ctx.requestId });
  }
}

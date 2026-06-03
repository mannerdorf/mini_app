import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import { pgTableExists, resolveHaulzReturnsAccess } from "../_haulzReturns.js";
import { parseGlobalStopRowId } from "../../lib/haulzReturns/globalStopWords.js";
import { normalizeStopMatchMode } from "../../lib/haulzReturns/stopWords.js";
import {
  deleteGlobalStopWord,
  loadGlobalStopWords,
  pgStopWordsTableExists,
  updateGlobalStopWordMatchMode,
  upsertGlobalStopWord,
} from "../../lib/haulzReturns/stopWordsStorage.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "haulz_returns_stop_words");
  const access = await resolveHaulzReturnsAccess(req, req.body);
  if (!access) {
    return res.status(401).json({ error: "Нет доступа", request_id: ctx.requestId });
  }

  const pool = getPool();
  if (!(await pgTableExists(pool, "haulz_returns_jobs"))) {
    return res.status(503).json({
      error: "Выполните миграцию migrations/080_haulz_returns.sql",
      request_id: ctx.requestId,
    });
  }
  if (!(await pgStopWordsTableExists(pool))) {
    return res.status(503).json({
      error: "Выполните миграцию migrations/082_haulz_returns_stop_words.sql",
      request_id: ctx.requestId,
    });
  }

  try {
    if (req.method === "GET") {
      const words = await loadGlobalStopWords(pool);
      return res.status(200).json({ ok: true, words, request_id: ctx.requestId });
    }

    if (req.method === "POST") {
      const word = String(req.body?.word ?? "").trim();
      if (!word) {
        return res.status(400).json({ error: "Укажите word", request_id: ctx.requestId });
      }
      const result = String(req.body?.result ?? "STOP").trim() || "STOP";
      const matchMode = normalizeStopMatchMode(req.body?.matchMode);
      const saved = await upsertGlobalStopWord(pool, access.loginKey, word, result, matchMode);
      if (!saved) {
        return res.status(500).json({ error: "Не удалось сохранить", request_id: ctx.requestId });
      }
      return res.status(200).json({ ok: true, word: saved, request_id: ctx.requestId });
    }

    if (req.method === "PATCH") {
      const id = Number(req.body?.id ?? req.query?.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ error: "Укажите id", request_id: ctx.requestId });
      }
      const matchMode = normalizeStopMatchMode(req.body?.matchMode);
      const ok = await updateGlobalStopWordMatchMode(pool, id, matchMode);
      if (!ok) {
        return res.status(404).json({ error: "Слово не найдено", request_id: ctx.requestId });
      }
      return res.status(200).json({ ok: true, request_id: ctx.requestId });
    }

    if (req.method === "DELETE") {
      const id = Number(req.body?.id ?? req.query?.id);
      const rowId = String(req.body?.rowId ?? req.query?.rowId ?? "");
      const parsed = Number.isFinite(id) && id > 0 ? id : parseGlobalStopRowId(rowId);
      if (!parsed) {
        return res.status(400).json({ error: "Укажите id или rowId", request_id: ctx.requestId });
      }
      const ok = await deleteGlobalStopWord(pool, parsed);
      if (!ok) {
        return res.status(404).json({ error: "Слово не найдено", request_id: ctx.requestId });
      }
      return res.status(200).json({ ok: true, request_id: ctx.requestId });
    }

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  } catch (e) {
    logError(ctx, "haulz_returns_stop_words_failed", e);
    return res.status(500).json({
      error: (e as Error)?.message || "Ошибка справочника STOP",
      request_id: ctx.requestId,
    });
  }
}

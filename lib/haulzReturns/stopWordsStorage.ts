import type { Pool, PoolClient } from "pg";
import type { HaulzSheetRow, HaulzWorkbook } from "./types.js";
import {
  applyGlobalStopWords,
  extractStopWordsForPersistence,
  type GlobalStopWord,
} from "./globalStopWords.js";
import { normalizeStopMatchMode, type StopMatchMode } from "./stopWords.js";

type Db = Pool | PoolClient;

export async function pgStopWordsTableExists(pool: Db): Promise<boolean> {
  const { rows } = await pool.query<{ reg: string | null }>(
    `select to_regclass('haulz_returns_stop_words') as reg`,
  );
  return Boolean(rows[0]?.reg);
}

function rowToGlobal(row: {
  id: string | number;
  word: string;
  result: string;
  match_mode: string;
}): GlobalStopWord {
  return {
    id: Number(row.id),
    word: String(row.word ?? "").trim(),
    result: String(row.result ?? "STOP").trim() || "STOP",
    matchMode: normalizeStopMatchMode(row.match_mode),
  };
}

export async function loadGlobalStopWords(pool: Db): Promise<GlobalStopWord[]> {
  if (!(await pgStopWordsTableExists(pool))) return [];
  const { rows } = await pool.query<{
    id: string;
    word: string;
    result: string;
    match_mode: string;
  }>(
    `select id::text, word, result, match_mode
     from haulz_returns_stop_words
     order by lower(trim(word)) asc`,
  );
  return rows.map(rowToGlobal);
}

export async function upsertGlobalStopWord(
  pool: Db,
  loginKey: string,
  word: string,
  result: string,
  matchMode: StopMatchMode,
): Promise<GlobalStopWord | null> {
  const trimmed = word.trim();
  if (!trimmed || !(await pgStopWordsTableExists(pool))) return null;
  const { rows } = await pool.query<{
    id: string;
    word: string;
    result: string;
    match_mode: string;
  }>(
    `insert into haulz_returns_stop_words (word, result, match_mode, created_by_login, updated_at)
     values ($1, $2, $3, $4, now())
     on conflict ((lower(trim(word))))
     do update set
       result = excluded.result,
       match_mode = excluded.match_mode,
       updated_at = now()
     returning id::text, word, result, match_mode`,
    [trimmed, result.trim() || "STOP", matchMode, loginKey],
  );
  const row = rows[0];
  return row ? rowToGlobal(row) : null;
}

export async function updateGlobalStopWordMatchMode(
  pool: Db,
  id: number,
  matchMode: StopMatchMode,
): Promise<boolean> {
  if (!(await pgStopWordsTableExists(pool))) return false;
  const { rowCount } = await pool.query(
    `update haulz_returns_stop_words set match_mode = $2, updated_at = now() where id = $1`,
    [id, matchMode],
  );
  return (rowCount ?? 0) > 0;
}

export async function deleteGlobalStopWord(pool: Db, id: number): Promise<boolean> {
  if (!(await pgStopWordsTableExists(pool))) return false;
  const { rowCount } = await pool.query(`delete from haulz_returns_stop_words where id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

export async function syncStopSheetToGlobal(
  pool: Db,
  loginKey: string,
  stopRows: HaulzSheetRow[],
): Promise<void> {
  if (!(await pgStopWordsTableExists(pool))) return;
  const entries = extractStopWordsForPersistence(stopRows);
  for (const e of entries) {
    await upsertGlobalStopWord(pool, loginKey, e.word, e.result, e.matchMode);
  }
}

/** Подмешивает общий справочник; при открытии сессии доп. слова из листа STOP сохраняются в БД. */
export async function enrichWorkbookWithGlobalStopWords(
  pool: Db,
  loginKey: string,
  workbook: HaulzWorkbook,
): Promise<HaulzWorkbook> {
  if (!(await pgStopWordsTableExists(pool))) return workbook;
  const stopSheet = workbook.sheets.find((s) => s.id === "stop");
  if (stopSheet?.rows?.length) {
    await syncStopSheetToGlobal(pool, loginKey, stopSheet.rows);
  }
  const global = await loadGlobalStopWords(pool);
  return applyGlobalStopWords(workbook, global);
}

import type { Pool } from "pg";
import type { CargoDateField } from "./cargoDateFilter.js";
import {
  isNormalizedCacheReady,
  normalizeCargoNumberForLookup,
  readNormalizedByDateRange,
  readNormalizedByDocNumbers,
  type InnFilterColumn,
  type NormalizedDocumentKind,
} from "./documentCacheNormalized.js";

export const CACHE_FRESH_MINUTES = 15;

const BLOB_TABLE: Record<NormalizedDocumentKind, string> = {
  perevozki: "cache_perevozki",
  sendings: "cache_sendings",
  invoices: "cache_invoices",
  acts: "cache_acts",
};

export type DocumentCacheReadOptions = {
  dateField?: CargoDateField;
  inns?: Set<string> | null;
  innColumn?: InnFilterColumn;
  partyNameNorms?: Set<string> | null;
};

/** Загрузка legacy blob (fallback). */
export async function loadCacheBlob(pool: Pool, kind: NormalizedDocumentKind): Promise<any[]> {
  const table = BLOB_TABLE[kind];
  let cacheRow = await pool.query<{ data: unknown[] }>(
    `select data from ${table} where id = 1 and fetched_at > now() - interval '1 minute' * $1`,
    [CACHE_FRESH_MINUTES],
  );
  if (cacheRow.rows.length === 0) {
    cacheRow = await pool.query<{ data: unknown[] }>(`select data from ${table} where id = 1`);
  }
  if (cacheRow.rows.length === 0) return [];
  const data = cacheRow.rows[0].data;
  return Array.isArray(data) ? (data as any[]) : [];
}

export function innColumnForPerevozkiMode(mode?: unknown): InnFilterColumn {
  const m = String(mode ?? "").trim();
  if (m === "Sender") return "sender";
  if (m === "Receiver") return "receiver";
  if (m === "Customer") return "customer";
  // Без Mode — все роли контрагента (заказчик / отправитель / получатель).
  return "any";
}

/**
 * Чтение документов за период: normalized rows (индекс по doc_date) или fallback на blob.
 * INN-фильтр в SQL при normalized; при blob — вызывающий код фильтрует в памяти.
 */
export async function readDocumentsFromCacheByPeriod(
  pool: Pool,
  kind: NormalizedDocumentKind,
  dateFrom: string,
  dateTo: string,
  options: DocumentCacheReadOptions = {},
): Promise<{ items: any[]; fromNormalized: boolean }> {
  try {
    if (await isNormalizedCacheReady(pool, kind)) {
      const items = await readNormalizedByDateRange(pool, kind, dateFrom, dateTo, {
        dateField: options.dateField,
        inns: options.inns,
        innColumn: options.innColumn,
        partyNameNorms: options.partyNameNorms,
      });
      return { items, fromNormalized: true };
    }
  } catch {
    // fallback
  }

  const list = await loadCacheBlob(pool, kind);
  return { items: list, fromNormalized: false };
}

/** Поиск перевозок по номерам — normalized index или scan blob. */
export async function readPerevozkiByNumbersFromCache(pool: Pool, numbers: string[]): Promise<any[]> {
  try {
    if (await isNormalizedCacheReady(pool, "perevozki")) {
      return readNormalizedByDocNumbers(pool, "perevozki", numbers);
    }
  } catch {
    // fallback
  }

  const wanted = new Set(numbers.map((n) => normalizeCargoNumberForLookup(n)).filter(Boolean));
  if (wanted.size === 0) return [];

  const list = await loadCacheBlob(pool, "perevozki");
  return list.filter((item) => {
    const num = normalizeCargoNumberForLookup(item?.Number ?? item?.number ?? item?.НомерПеревозки ?? "");
    return wanted.has(num);
  });
}
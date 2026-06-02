import type { HaulzSheet, HaulzWorkbook } from "./types.js";
import { parseUlSheetId } from "./ulSheetOperations.js";

/** Запас под job, files и прочие поля ответа (лимит Vercel ~4.5 МБ). */
export const HAULZ_RETURNS_API_JSON_BUDGET = 3_800_000;

export type ItogControlKeysStorage = string[] | { keys: string[]; excludedUl?: string[] };

function normalizeSheetId(s: HaulzSheet): string {
  return String(s?.id ?? "");
}

export function parseItogControlKeysMeta(keys: unknown): {
  itogControlKeys: Set<string>;
  excludedUlNumbers: Set<string>;
} {
  if (Array.isArray(keys)) {
    return {
      itogControlKeys: new Set(keys.map(String)),
      excludedUlNumbers: new Set(),
    };
  }
  if (keys && typeof keys === "object") {
    const o = keys as { keys?: unknown; excludedUl?: unknown };
    return {
      itogControlKeys: new Set(Array.isArray(o.keys) ? o.keys.map(String) : []),
      excludedUlNumbers: new Set(Array.isArray(o.excludedUl) ? o.excludedUl.map(String) : []),
    };
  }
  return { itogControlKeys: new Set(), excludedUlNumbers: new Set() };
}

export function serializeItogControlKeysMeta(wb: HaulzWorkbook): ItogControlKeysStorage {
  const keys = wb.itogControlKeys ?? new Set<string>();
  const excluded = wb.excludedUlNumbers ?? new Set<string>();
  if (excluded.size === 0) return [...keys];
  return { keys: [...keys], excludedUl: [...excluded] };
}

export function deserializeWorkbook(sheets: unknown, keys: unknown): HaulzWorkbook {
  const meta = parseItogControlKeysMeta(keys);
  return {
    sheets: Array.isArray(sheets) ? (sheets as HaulzWorkbook["sheets"]) : [],
    ...meta,
  };
}

/** Убирает строки УЛ из JSON-ответа API (лимит Vercel ~4.5 МБ). */
export function workbookForApi(wb: HaulzWorkbook, opts?: { deferItog?: boolean }) {
  return {
    sheets: wb.sheets
      .filter((s): s is HaulzSheet => Boolean(s) && typeof s === "object")
      .map((s) => {
        const id = normalizeSheetId(s);
        if (id.startsWith("ul-")) {
          return { ...s, id, rows: [], ulDeferred: true };
        }
        if (opts?.deferItog && id === "itog") {
          return { ...s, id, rows: [], itogDeferred: true, itogRowCount: s.rows?.length ?? 0 };
        }
        return { ...s, id };
      }),
    itogControlKeys: serializeItogControlKeysMeta(wb),
  };
}

function estimateApiWorkbookBytes(wb: HaulzWorkbook): number {
  let bytes = 800;
  for (const s of wb.sheets) {
    if (!s || typeof s !== "object") continue;
    const id = normalizeSheetId(s);
    bytes += 200 + (s.columns?.length ?? 0) * 40;
    if (id.startsWith("ul-")) continue;
    bytes += (s.rows?.length ?? 0) * 480;
  }
  bytes += (wb.itogControlKeys?.size ?? 0) * 20;
  return bytes;
}

/** Сжимает workbook под лимит ответа; при необходимости откладывает загрузку листа «итог». */
export function workbookForApiWithinBudget(wb: HaulzWorkbook, payloadOverheadBytes = 0) {
  const estimated = estimateApiWorkbookBytes(wb) + payloadOverheadBytes;
  if (estimated > HAULZ_RETURNS_API_JSON_BUDGET) {
    return workbookForApi(wb, { deferItog: true });
  }

  const apiWb = workbookForApi(wb);
  try {
    const size = JSON.stringify(apiWb).length + payloadOverheadBytes;
    if (size <= HAULZ_RETURNS_API_JSON_BUDGET) return apiWb;
  } catch {
    // RangeError: Invalid string length — слишком большой JSON для Node/Vercel
  }
  return workbookForApi(wb, { deferItog: true });
}

export function sheetFromWorkbook(wb: HaulzWorkbook, sheetId: string): HaulzSheet | null {
  const id = String(sheetId ?? "").trim();
  if (!id) return null;
  return wb.sheets.find((s) => normalizeSheetId(s) === id) ?? null;
}

/** Для PATCH: клиент шлёт без строк УЛ, сервер подставляет из сохранённой версии. */
export function compactWorkbookForPatch(wb: HaulzWorkbook) {
  return {
    sheets: wb.sheets.map((s) => {
      const id = normalizeSheetId(s);
      return id.startsWith("ul-") ? { ...s, id, rows: [] } : { ...s, id };
    }),
    itogControlKeys: serializeItogControlKeysMeta(wb),
  };
}

export function mergeWorkbookPatch(stored: HaulzWorkbook | null, incoming: HaulzWorkbook): HaulzWorkbook {
  if (!stored) return incoming;

  const excludedUlNumbers = new Set([
    ...(stored.excludedUlNumbers ?? []),
    ...(incoming.excludedUlNumbers ?? []),
  ]);

  const storedUl = new Map(
    stored.sheets
      .filter((s) => {
        const id = normalizeSheetId(s);
        if (!id.startsWith("ul-")) return false;
        const ul = parseUlSheetId(id);
        return ul ? !excludedUlNumbers.has(ul) : true;
      })
      .map((s) => [normalizeSheetId(s), s]),
  );

  const incomingUlIds = new Set(
    incoming.sheets
      .filter((s) => normalizeSheetId(s).startsWith("ul-"))
      .map((s) => normalizeSheetId(s)),
  );

  const mergedSheets = incoming.sheets.flatMap((s) => {
    const id = normalizeSheetId(s);
    if (id.startsWith("ul-")) {
      const ul = parseUlSheetId(id);
      if (ul && excludedUlNumbers.has(ul)) return [];
      if (s.rows.length === 0 && !s.ulLocallyEdited) {
        const prev = storedUl.get(id);
        if (prev) return [prev];
      }
    }
    return [{ ...s, id }];
  });

  for (const [id, sheet] of storedUl) {
    if (incomingUlIds.has(id) && !mergedSheets.some((s) => normalizeSheetId(s) === id)) {
      mergedSheets.push(sheet);
    }
  }

  return {
    sheets: mergedSheets,
    itogControlKeys:
      (incoming.itogControlKeys?.size ?? 0) > 0 ? incoming.itogControlKeys : stored.itogControlKeys,
    excludedUlNumbers,
  };
}

import type { HaulzWorkbook } from "./types.js";
import { parseUlSheetId } from "./ulSheetOperations.js";

export type ItogControlKeysStorage = string[] | { keys: string[]; excludedUl?: string[] };

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
  const excluded = wb.excludedUlNumbers ?? new Set<string>();
  if (excluded.size === 0) return [...wb.itogControlKeys];
  return { keys: [...wb.itogControlKeys], excludedUl: [...excluded] };
}

export function deserializeWorkbook(sheets: unknown, keys: unknown): HaulzWorkbook {
  const meta = parseItogControlKeysMeta(keys);
  return {
    sheets: Array.isArray(sheets) ? (sheets as HaulzWorkbook["sheets"]) : [],
    ...meta,
  };
}

/** Убирает строки УЛ из JSON-ответа API (лимит Vercel ~4.5 МБ). */
export function workbookForApi(wb: HaulzWorkbook) {
  return {
    sheets: wb.sheets.map((s) =>
      s.id.startsWith("ul-") ? { ...s, rows: [], ulDeferred: true } : s,
    ),
    itogControlKeys: serializeItogControlKeysMeta(wb),
  };
}

/** Для PATCH: клиент шлёт без строк УЛ, сервер подставляет из сохранённой версии. */
export function compactWorkbookForPatch(wb: HaulzWorkbook) {
  return {
    sheets: wb.sheets.map((s) => (s.id.startsWith("ul-") ? { ...s, rows: [] } : s)),
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
        if (!s.id.startsWith("ul-")) return false;
        const ul = parseUlSheetId(s.id);
        return ul ? !excludedUlNumbers.has(ul) : true;
      })
      .map((s) => [s.id, s]),
  );

  const incomingUlIds = new Set(
    incoming.sheets.filter((s) => s.id.startsWith("ul-")).map((s) => s.id),
  );

  const mergedSheets = incoming.sheets.flatMap((s) => {
    if (s.id.startsWith("ul-")) {
      const ul = parseUlSheetId(s.id);
      if (ul && excludedUlNumbers.has(ul)) return [];
      if (s.rows.length === 0 && !s.ulLocallyEdited) {
        const prev = storedUl.get(s.id);
        if (prev) return [prev];
      }
    }
    return [s];
  });

  for (const [id, sheet] of storedUl) {
    if (incomingUlIds.has(id) && !mergedSheets.some((s) => s.id === id)) {
      mergedSheets.push(sheet);
    }
  }

  return {
    sheets: mergedSheets,
    itogControlKeys: incoming.itogControlKeys.size > 0 ? incoming.itogControlKeys : stored.itogControlKeys,
    excludedUlNumbers,
  };
}

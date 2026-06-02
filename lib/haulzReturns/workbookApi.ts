import type { HaulzWorkbook } from "./types.js";

export function deserializeWorkbook(sheets: unknown, keys: unknown): HaulzWorkbook {
  return {
    sheets: Array.isArray(sheets) ? (sheets as HaulzWorkbook["sheets"]) : [],
    itogControlKeys: new Set(Array.isArray(keys) ? keys.map(String) : []),
  };
}

/** Убирает строки УЛ из JSON-ответа API (лимит Vercel ~4.5 МБ). */
export function workbookForApi(wb: HaulzWorkbook) {
  return {
    sheets: wb.sheets.map((s) =>
      s.id.startsWith("ul-") ? { ...s, rows: [], ulDeferred: true } : s,
    ),
    itogControlKeys: [...wb.itogControlKeys],
  };
}

/** Для PATCH: клиент шлёт без строк УЛ, сервер подставляет из сохранённой версии. */
export function compactWorkbookForPatch(wb: HaulzWorkbook) {
  return {
    sheets: wb.sheets.map((s) => (s.id.startsWith("ul-") ? { ...s, rows: [] } : s)),
    itogControlKeys: [...wb.itogControlKeys],
  };
}

export function mergeWorkbookPatch(stored: HaulzWorkbook | null, incoming: HaulzWorkbook): HaulzWorkbook {
  if (!stored) return incoming;
  const storedUl = new Map(
    stored.sheets.filter((s) => s.id.startsWith("ul-")).map((s) => [s.id, s]),
  );
  const mergedSheets = incoming.sheets.map((s) => {
    if (s.id.startsWith("ul-") && s.rows.length === 0) {
      const prev = storedUl.get(s.id);
      if (prev) return prev;
    }
    return s;
  });
  for (const [id, sheet] of storedUl) {
    if (!mergedSheets.some((s) => s.id === id)) mergedSheets.push(sheet);
  }
  return {
    sheets: mergedSheets,
    itogControlKeys: incoming.itogControlKeys.size > 0 ? incoming.itogControlKeys : stored.itogControlKeys,
  };
}

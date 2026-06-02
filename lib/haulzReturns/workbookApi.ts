import type { HaulzSheet, HaulzWorkbook } from "./types.js";
import type { TdDraft } from "./tdDocuments/index.js";

/** Запас под job, files и прочие поля ответа (лимит Vercel ~4.5 МБ). */
export const HAULZ_RETURNS_API_JSON_BUDGET = 3800000;

export const WORKBOOK_META_SHEET_ID = "__workbook_meta__";

export type ItogControlKeysStorage = string[] | { keys: string[]; excludedUl?: string[] };

function normalizeSheetId(s: HaulzSheet): string {
  return String(s?.id ?? "");
}

function parseUlSheetId(sheetId: string): string | null {
  if (!sheetId.startsWith("ul-")) return null;
  const ulNumber = sheetId.slice(3).trim();
  return ulNumber.length > 0 ? ulNumber : null;
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
  const keysMeta = parseItogControlKeysMeta(keys);
  const list = Array.isArray(sheets) ? (sheets as HaulzWorkbook["sheets"]) : [];
  const metaSheet = list.find((s) => normalizeSheetId(s) === WORKBOOK_META_SHEET_ID) as
    | { tdDraft?: TdDraft; tdPrepared?: import("./tdDocuments/types.js").TdPrepared }
    | undefined;
  const filteredSheets = list.filter((s) => normalizeSheetId(s) !== WORKBOOK_META_SHEET_ID);
  return {
    sheets: filteredSheets,
    ...keysMeta,
    tdDraft: metaSheet?.tdDraft,
    tdPrepared: metaSheet?.tdPrepared,
  };
}

/** Убирает строки УЛ из JSON-ответа API (лимит Vercel ~4.5 МБ). */
export function workbookForApi(wb: HaulzWorkbook, opts?: { deferItog?: boolean }) {
  return {
    sheets: wb.sheets
      .filter((s): s is HaulzSheet => Boolean(s) && typeof s === "object")
      .filter((s) => normalizeSheetId(s) !== WORKBOOK_META_SHEET_ID)
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
    tdDraft: wb.tdDraft,
    tdPrepared: wb.tdPrepared,
  };
}

function estimateApiWorkbookBytes(wb: HaulzWorkbook): number {
  let bytes = 800;
  try {
    bytes += JSON.stringify(wb.tdPrepared ?? null).length;
    bytes += JSON.stringify(wb.tdDraft ?? null).length;
  } catch {
    bytes += 500_000;
  }
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
  const sheets = wb.sheets.map((s) => {
    const id = normalizeSheetId(s);
    return id.startsWith("ul-") ? { ...s, id, rows: [] } : { ...s, id };
  });
  if ((wb.tdDraft && Object.keys(wb.tdDraft).length > 0) || wb.tdPrepared) {
    sheets.push({
      id: WORKBOOK_META_SHEET_ID,
      name: WORKBOOK_META_SHEET_ID,
      columns: [],
      rows: [],
      tdDraft: wb.tdDraft,
      tdPrepared: wb.tdPrepared,
    } as HaulzSheet & { tdDraft?: TdDraft; tdPrepared?: import("./tdDocuments/types.js").TdPrepared });
  }
  return {
    sheets,
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
        if (prev) {
          return [{
            ...prev,
            carrierId: s.carrierId ?? prev.carrierId ?? null,
            tdNumber: s.tdNumber ?? prev.tdNumber ?? null,
          }];
        }
      }
    }
    return [{
      ...s,
      id,
      carrierId: s.carrierId ?? storedUl.get(id)?.carrierId ?? null,
      tdNumber: s.tdNumber ?? storedUl.get(id)?.tdNumber ?? null,
    }];
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
    tdDraft: incoming.tdDraft ?? stored.tdDraft,
    tdPrepared: incoming.tdPrepared ?? stored.tdPrepared,
  };
}

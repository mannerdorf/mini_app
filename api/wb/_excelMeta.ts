import * as XLSX from "xlsx";
import { parseDateOnly } from "../_wb.js";

/** Значение ячейки по адресу A1 (например O2). Нужно для разреженных строк: sheet_to_json не всегда даёт индекс столбца. */
export function readSheetCellRaw(ws: XLSX.WorkSheet, a1: string): unknown {
  const addr = a1.replace(/\$/g, "").toUpperCase();
  const cell = (ws as Record<string, unknown>)[addr];
  if (!cell || typeof cell !== "object") return undefined;
  const c = cell as XLSX.CellObject;
  if (c.v !== undefined && c.v !== null) return c.v;
  if (typeof c.w === "string" && c.w.trim() !== "") return c.w.trim();
  return undefined;
}

/** Дата из ячейки XLSX: Date, серийный номер Excel или строка (в т.ч. 23.04.2025). */
export function parseCellDateFlexible(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    const t = value.getTime();
    if (Number.isNaN(t)) return null;
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 1 && value < 100000) {
      try {
        const p = XLSX.SSF.parse_date_code(value) as { y: number; m: number; d: number };
        if (p?.y && p.m && p.d) {
          return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
        }
      } catch {
        // ignore
      }
    }
    return null;
  }
  return parseDateOnly(value);
}

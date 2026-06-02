import * as XLSX from "xlsx";

export function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return String(v).trim();
}

export function normalizeHeader(v: unknown): string {
  return cellText(v).toLowerCase().replace(/\s+/g, " ");
}

export function extractUlNumberFromFileName(fileName: string): string | null {
  const base = fileName.replace(/\.(xlsx|xls|csv)$/i, "").trim();
  const digits = base.match(/(\d{5,})/);
  return digits?.[1] ?? null;
}

export function extractUlNumberFromTitle(text: string): string | null {
  const m = text.match(/№\s*(\d+)/);
  return m?.[1] ?? null;
}

export function findHeaderRowIndex(data: unknown[][], required: ((n: string) => boolean)[]): number {
  for (let i = 0; i < Math.min(20, data.length); i++) {
    const row = data[i] ?? [];
    const norms = row.map(normalizeHeader);
    if (required.every((pred) => norms.some(pred))) return i;
  }
  return -1;
}

export function readWorkbookFromArrayBuffer(buffer: ArrayBuffer): XLSX.WorkBook {
  return XLSX.read(buffer, { type: "array", cellDates: true, raw: false });
}

export function sheetToMatrix(ws: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" }) as unknown[][];
}

export function colIndexByHeader(headerRow: unknown[], pred: (n: string) => boolean): number {
  for (let i = 0; i < headerRow.length; i++) {
    if (pred(normalizeHeader(headerRow[i]))) return i;
  }
  return -1;
}

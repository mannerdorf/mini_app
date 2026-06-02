import type { HaulzSheetRow } from "./types.js";

export type SortDirection = "asc" | "desc";

export type SortSpec = {
  key: string;
  dir: SortDirection;
};

export const FIX_DEFAULT_SORT: SortSpec[] = [
  { key: "ul", dir: "asc" },
  { key: "line", dir: "asc" },
];

function cellSortText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "1" : "0";
  return String(value).trim();
}

export function compareCellValues(a: unknown, b: unknown): number {
  const sa = cellSortText(a);
  const sb = cellSortText(b);
  if (sa === "" && sb === "") return 0;
  if (sa === "") return 1;
  if (sb === "") return -1;

  const na = Number(sa.replace(",", "."));
  const nb = Number(sb.replace(",", "."));
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;

  return sa.localeCompare(sb, "ru", { numeric: true, sensitivity: "base" });
}

export function sortDataRows(rows: HaulzSheetRow[], specs: SortSpec[]): HaulzSheetRow[] {
  if (specs.length === 0) return rows;
  return [...rows].sort((a, b) => {
    for (const { key, dir } of specs) {
      const cmp = compareCellValues(a[key], b[key]);
      if (cmp !== 0) return dir === "asc" ? cmp : -cmp;
    }
    return 0;
  });
}

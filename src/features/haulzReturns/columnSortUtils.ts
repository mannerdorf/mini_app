import type { HaulzSheetRow } from "../../lib/haulzReturns";
import {
  FIX_DEFAULT_SORT,
  sortDataRows,
  type SortDirection,
  type SortSpec,
} from "../../lib/haulzReturns/rowSort";

export type ColumnSortState = {
  key: string;
  dir: SortDirection;
} | null;

export { FIX_DEFAULT_SORT, sortDataRows, type SortDirection, type SortSpec };

export function defaultSortForSheet(sheetId: string): SortSpec[] {
  if (sheetId === "fix") return FIX_DEFAULT_SORT;
  return [];
}

export function effectiveSortSpecs(sheetId: string, userSort: ColumnSortState): SortSpec[] {
  if (userSort) return [userSort];
  return defaultSortForSheet(sheetId);
}

export function applySheetSort(rows: HaulzSheetRow[], sheetId: string, userSort: ColumnSortState): HaulzSheetRow[] {
  return sortDataRows(rows, effectiveSortSpecs(sheetId, userSort));
}

export function nextSortState(current: ColumnSortState, colKey: string): ColumnSortState {
  if (current?.key !== colKey) return { key: colKey, dir: "asc" };
  return { key: colKey, dir: current.dir === "asc" ? "desc" : "asc" };
}

export function sortDirectionForColumn(userSort: ColumnSortState, colKey: string): SortDirection | null {
  if (userSort?.key !== colKey) return null;
  return userSort.dir;
}

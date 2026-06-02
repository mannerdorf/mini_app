import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HaulzColumn, HaulzSheetRow, PreviewColumn } from "../../lib/haulzReturns";
import { HaulzColumnFilterHeader } from "./HaulzColumnFilterHeader";
import {
  applyColumnFilters,
  formatCellDisplay,
  uniqueColumnValues,
} from "./columnFilterUtils";
import {
  nextSortState,
  sortDataRows,
  sortDirectionForColumn,
  type ColumnSortState,
} from "./columnSortUtils";

const ROW_HEIGHT = 32;
const OVERSCAN = 8;

type Props = {
  tableId: string;
  columns: PreviewColumn[];
  rows: Record<string, unknown>[];
  summaryRow?: Record<string, unknown>;
};

function toSheetRows(rows: Record<string, unknown>[]): HaulzSheetRow[] {
  return rows.map((row, i) => ({ ...row, _rowId: String(i) }));
}

export function HaulzTdPreviewTable({ tableId, columns, rows, summaryRow }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(320);
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string> | null>>({});
  const [columnSort, setColumnSort] = useState<ColumnSortState>(null);

  const haulzColumns: HaulzColumn[] = useMemo(
    () => columns.map((c) => ({ key: c.key, label: c.label })),
    [columns],
  );

  const sheetRows = useMemo(() => toSheetRows(rows), [rows]);

  useEffect(() => {
    setColumnFilters({});
    setColumnSort(null);
    setScrollTop(0);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [tableId]);

  const uniqueByColumn = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const col of haulzColumns) {
      map[col.key] = uniqueColumnValues(sheetRows, col);
    }
    return map;
  }, [haulzColumns, sheetRows]);

  const filteredRows = useMemo(
    () => applyColumnFilters(sheetRows, haulzColumns, columnFilters),
    [sheetRows, haulzColumns, columnFilters],
  );

  const dataRows = useMemo(() => {
    if (!columnSort) return filteredRows;
    return sortDataRows(filteredRows, [columnSort]);
  }, [filteredRows, columnSort]);

  const activeFilterCount = useMemo(
    () =>
      haulzColumns.filter((col) => {
        const allowed = columnFilters[col.key];
        if (allowed == null) return false;
        return allowed.size < (uniqueByColumn[col.key]?.length ?? 0);
      }).length,
    [haulzColumns, columnFilters, uniqueByColumn],
  );

  const setColumnFilter = useCallback((colKey: string, selected: Set<string> | null) => {
    setColumnFilters((prev) => {
      if (selected == null) {
        const next = { ...prev };
        delete next[colKey];
        return next;
      }
      return { ...prev, [colKey]: selected };
    });
  }, []);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setScrollTop(el.scrollTop);
    setViewportH(el.clientHeight);
  }, []);

  const { start, end } = useMemo(() => {
    const total = dataRows.length;
    if (total <= 200) return { start: 0, end: total };
    const s = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const visible = Math.ceil(viewportH / ROW_HEIGHT) + OVERSCAN * 2;
    return { start: s, end: Math.min(total, s + visible) };
  }, [dataRows.length, scrollTop, viewportH]);

  const visibleRows = dataRows.slice(start, end);
  const padTop = start * ROW_HEIGHT;
  const padBottom = Math.max(0, (dataRows.length - end) * ROW_HEIGHT);

  if (rows.length === 0) {
    return <p style={{ color: "var(--color-text-secondary)" }}>Нет данных</p>;
  }

  return (
    <div className="hr-table-view" style={{ marginTop: "0.75rem" }}>
      {activeFilterCount > 0 || columnSort ? (
        <div className="hr-table-view__filter-bar">
          <span>
            {activeFilterCount > 0
              ? `Фильтры: ${activeFilterCount} · показано ${dataRows.length} из ${rows.length}`
              : columnSort
                ? `Сортировка: ${haulzColumns.find((c) => c.key === columnSort.key)?.label ?? columnSort.key} ${columnSort.dir === "asc" ? "↑" : "↓"}`
                : null}
          </span>
          <div className="hr-table-view__filter-actions">
            {columnSort ? (
              <button type="button" className="hr-table-view__filter-clear" onClick={() => setColumnSort(null)}>
                Сбросить сортировку
              </button>
            ) : null}
            {activeFilterCount > 0 ? (
              <button type="button" className="hr-table-view__filter-clear" onClick={() => setColumnFilters({})}>
                Сбросить фильтры
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div ref={scrollRef} className="hr-table-wrap" style={{ maxHeight: "320px" }} onScroll={onScroll}>
        <table className="hr-table">
          <thead>
            <tr className="hr-table__header-row">
              {haulzColumns.map((col) => (
                <th key={col.key}>
                  <HaulzColumnFilterHeader
                    col={col}
                    uniqueValues={uniqueByColumn[col.key] ?? []}
                    selectedValues={columnFilters[col.key] ?? null}
                    onChange={(selected) => setColumnFilter(col.key, selected)}
                    sortDirection={sortDirectionForColumn(columnSort, col.key)}
                    onSortClick={() => setColumnSort((prev) => nextSortState(prev, col.key))}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {padTop > 0 ? (
              <tr aria-hidden style={{ height: padTop }}>
                <td colSpan={haulzColumns.length} style={{ padding: 0, border: "none" }} />
              </tr>
            ) : null}
            {visibleRows.map((row) => (
              <tr key={row._rowId}>
                {haulzColumns.map((col) => (
                  <td key={col.key}>{formatCellDisplay(row[col.key])}</td>
                ))}
              </tr>
            ))}
            {padBottom > 0 ? (
              <tr aria-hidden style={{ height: padBottom }}>
                <td colSpan={haulzColumns.length} style={{ padding: 0, border: "none" }} />
              </tr>
            ) : null}
            {summaryRow ? (
              <tr className="hr-table__summary-row">
                {haulzColumns.map((col) => (
                  <td key={col.key} style={{ fontWeight: 700 }}>
                    {formatCellDisplay(summaryRow[col.key])}
                  </td>
                ))}
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

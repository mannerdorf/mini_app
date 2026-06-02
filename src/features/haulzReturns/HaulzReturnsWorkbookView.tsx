import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy } from "lucide-react";
import type { HaulzColumn, HaulzSheet, HaulzSheetRow } from "../../lib/haulzReturns";
import {
  isSummaryRow,
  isUlRowInItog,
  itogRowHighlight,
  itogUlDataHighlight,
  itogValidationFromRow,
  normalizeStopMatchMode,
  STOP_MATCH_MODE_LABELS,
  type StopMatchMode,
} from "../../lib/haulzReturns";
import { HaulzColumnFilterHeader } from "./HaulzColumnFilterHeader";
import {
  applyColumnFilters,
  columnValuesFromRows,
  formatCellDisplay,
  uniqueColumnValues,
} from "./columnFilterUtils";
import {
  applySheetSort,
  nextSortState,
  sortDirectionForColumn,
  type ColumnSortState,
} from "./columnSortUtils";
import { HR_ROW_MARK_COLORS } from "./rowMarkColors";

function rowMarkColor(row: HaulzSheetRow): string | null {
  const c = String(row.markColor ?? "").trim();
  return c || null;
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

const ROW_HEIGHT = 32;
const OVERSCAN = 8;

type Props = {
  sheet: HaulzSheet;
  onDeleteRow?: (rowId: string) => void;
  canDelete?: boolean;
  onStopMatchModeChange?: (rowId: string, matchMode: StopMatchMode) => void;
  onBulkDelete?: (rowIds: string[]) => void;
  onBulkMarkColor?: (rowIds: string[], color: string | null) => void;
};

function formatStopMatchModeLabel(raw: unknown): string {
  return STOP_MATCH_MODE_LABELS[normalizeStopMatchMode(raw)];
}

function formatUlCellDisplay(sheet: HaulzSheet, row: HaulzSheetRow, col: HaulzColumn): string {
  if (sheet.id === "stop" && col.key === "matchMode") {
    return formatStopMatchModeLabel(row.matchMode);
  }
  if (sheet.id.startsWith("ul-") && col.key === "inItog") {
    return isUlRowInItog(row) ? "✓" : "";
  }
  return formatCellDisplay(row[col.key]);
}

function cellStyle(sheet: HaulzSheet, row: HaulzSheetRow, col: HaulzColumn): React.CSSProperties | undefined {
  if (isSummaryRow(row)) return undefined;
  const manual = rowMarkColor(row);
  if (manual) return { backgroundColor: manual };
  if (sheet.id === "itog" || sheet.id === "fix") {
    const validation = itogValidationFromRow(row);
    if (col.key === "ulData") {
      const c = itogUlDataHighlight(validation);
      if (c) return { backgroundColor: c };
    }
    const rowKeys = ["num", "ul", "line", "id", "parcel", "ulData", "translate", "qty", "weight", "cost", "seal", "ulPlaces", "stop", "chars", "control"];
    if (rowKeys.includes(col.key)) {
      const c = itogRowHighlight(validation);
      if (c) return { backgroundColor: c };
    }
  }
  if (sheet.id === "kgd" && col.key === "dupCount" && Number(row.dupCount) > 1) {
    return { backgroundColor: "#fce4e4" };
  }
  return undefined;
}

export function HaulzReturnsWorkbookView({
  sheet,
  onDeleteRow,
  canDelete,
  onStopMatchModeChange,
  onBulkDelete,
  onBulkMarkColor,
}: Props) {
  const canBulkSelect = Boolean(onBulkDelete && onBulkMarkColor);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(480);
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string> | null>>({});
  const [columnSort, setColumnSort] = useState<ColumnSortState>(null);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(() => new Set());
  const [markMenuOpen, setMarkMenuOpen] = useState(false);
  const markMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setColumnFilters({});
    setColumnSort(null);
    setScrollTop(0);
    setSelectedRowIds(new Set());
    setMarkMenuOpen(false);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [sheet.id]);

  const uniqueByColumn = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const col of sheet.columns) {
      map[col.key] = uniqueColumnValues(sheet.rows, col, sheet.id);
    }
    return map;
  }, [sheet.columns, sheet.rows, sheet.id]);

  const filteredRows = useMemo(
    () => applyColumnFilters(sheet.rows, sheet.columns, columnFilters, sheet.id),
    [sheet.rows, sheet.columns, columnFilters, sheet.id],
  );

  const hasSummaryHeader = sheet.id === "itog" || sheet.id === "kgd" || sheet.id.startsWith("ul-");

  const summaryRow = useMemo(
    () => (hasSummaryHeader ? sheet.rows.find(isSummaryRow) ?? null : null),
    [sheet.rows, hasSummaryHeader],
  );

  const dataRows = useMemo(() => {
    const base = summaryRow ? filteredRows.filter((r) => !isSummaryRow(r)) : filteredRows;
    return applySheetSort(base, sheet.id, columnSort);
  }, [filteredRows, summaryRow, sheet.id, columnSort]);

  const dataRowCount = useMemo(
    () => sheet.rows.filter((r) => !isSummaryRow(r)).length,
    [sheet.rows],
  );

  const activeFilterCount = useMemo(
    () =>
      sheet.columns.filter((col) => {
        const allowed = columnFilters[col.key];
        if (allowed == null) return false;
        return allowed.size < (uniqueByColumn[col.key]?.length ?? 0);
      }).length,
    [sheet.columns, columnFilters, uniqueByColumn],
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

  const clearAllFilters = useCallback(() => setColumnFilters({}), []);

  const handleColumnSort = useCallback((colKey: string) => {
    setColumnSort((prev) => nextSortState(prev, colKey));
  }, []);

  const clearColumnSort = useCallback(() => setColumnSort(null), []);

  const sortHint = useMemo(() => {
    if (columnSort) {
      const col = sheet.columns.find((c) => c.key === columnSort.key);
      const label = col?.label || columnSort.key;
      return `Сортировка: ${label} ${columnSort.dir === "asc" ? "↑" : "↓"}`;
    }
    if (sheet.id === "fix") return "Сортировка: УЛ ↑, строка ↑";
    return null;
  }, [columnSort, sheet.columns, sheet.id]);

  const copyKgdParcels = useCallback(async () => {
    const parcels = columnValuesFromRows(dataRows, "parcel");
    if (parcels.length === 0) {
      setCopyHint("Нет посылок для копирования");
      window.setTimeout(() => setCopyHint(null), 2500);
      return;
    }
    const ok = await copyTextToClipboard(parcels.join("\n"));
    setCopyHint(ok ? `Скопировано ${parcels.length} посылок` : "Не удалось скопировать");
    window.setTimeout(() => setCopyHint(null), 2500);
  }, [dataRows]);

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

  const selectableRowIds = useMemo(
    () => dataRows.map((r) => r._rowId).filter((id): id is string => Boolean(id)),
    [dataRows],
  );

  const selectedCount = selectedRowIds.size;
  const allSelected = selectableRowIds.length > 0 && selectableRowIds.every((id) => selectedRowIds.has(id));
  const someSelected = selectableRowIds.some((id) => selectedRowIds.has(id));

  const leadColCount = (canBulkSelect ? 1 : 0) + (canDelete && onDeleteRow ? 1 : 0);

  const toggleRowSelection = useCallback((rowId: string, checked: boolean) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(rowId);
      else next.delete(rowId);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(
    (checked: boolean) => {
      if (!checked) {
        setSelectedRowIds(new Set());
        return;
      }
      setSelectedRowIds(new Set(selectableRowIds));
    },
    [selectableRowIds],
  );

  const selectedIdsArray = useMemo(() => [...selectedRowIds], [selectedRowIds]);

  const handleBulkDeleteClick = useCallback(() => {
    if (selectedIdsArray.length === 0 || !onBulkDelete) return;
    onBulkDelete(selectedIdsArray);
    setSelectedRowIds(new Set());
  }, [onBulkDelete, selectedIdsArray]);

  const handleBulkMarkClick = useCallback(
    (color: string | null) => {
      if (selectedIdsArray.length === 0 || !onBulkMarkColor) return;
      onBulkMarkColor(selectedIdsArray, color);
      setMarkMenuOpen(false);
    },
    [onBulkMarkColor, selectedIdsArray],
  );

  useEffect(() => {
    if (!markMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (markMenuRef.current && !markMenuRef.current.contains(e.target as Node)) {
        setMarkMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [markMenuOpen]);

  return (
    <div className="hr-table-view">
      {canBulkSelect || sheet.id === "kgd" || activeFilterCount > 0 || sortHint ? (
        <div className="hr-table-view__filter-bar">
          <span>
            {canBulkSelect && selectedCount > 0
              ? `Выбрано ${selectedCount}`
              : activeFilterCount > 0
                ? `Фильтры: ${activeFilterCount} · показано ${dataRows.length} из ${dataRowCount}`
                : sheet.id === "kgd"
                  ? `${dataRows.length} посылок`
                  : sortHint}
          </span>
          <div className="hr-table-view__filter-actions">
            {canBulkSelect ? (
              <div className="hr-table-bulk-actions">
                <button
                  type="button"
                  className="hr-table-view__filter-clear hr-table-bulk-actions__btn"
                  disabled={selectedCount === 0}
                  onClick={handleBulkDeleteClick}
                >
                  Удалить
                </button>
                <div className="hr-table-bulk-actions__mark" ref={markMenuRef}>
                  <button
                    type="button"
                    className="hr-table-view__filter-clear hr-table-bulk-actions__btn"
                    disabled={selectedCount === 0}
                    onClick={() => setMarkMenuOpen((v) => !v)}
                  >
                    Выделить цветом ▾
                  </button>
                  {markMenuOpen ? (
                    <div className="hr-table-bulk-actions__menu">
                      {HR_ROW_MARK_COLORS.map((item) => (
                        <button
                          key={item.color}
                          type="button"
                          className="hr-table-bulk-actions__menu-item"
                          onClick={() => handleBulkMarkClick(item.color)}
                        >
                          <span className="hr-table-bulk-actions__swatch" style={{ backgroundColor: item.color }} />
                          {item.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="hr-table-bulk-actions__menu-item hr-table-bulk-actions__menu-item--clear"
                        onClick={() => handleBulkMarkClick(null)}
                      >
                        Снять выделение
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
            {copyHint ? <span className="hr-table-view__copy-hint">{copyHint}</span> : null}
            {columnSort ? (
              <button type="button" className="hr-table-view__filter-clear" onClick={clearColumnSort}>
                Сбросить сортировку
              </button>
            ) : null}
            {sheet.id === "kgd" ? (
              <button type="button" className="hr-table-view__filter-clear" onClick={() => void copyKgdParcels()}>
                <Copy className="w-3.5 h-3.5" style={{ marginRight: "0.25rem", verticalAlign: "middle" }} />
                Копировать посылки
              </button>
            ) : null}
            {activeFilterCount > 0 ? (
              <button type="button" className="hr-table-view__filter-clear" onClick={clearAllFilters}>
                Сбросить все
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div
        ref={scrollRef}
        className="hr-table-wrap"
        onScroll={onScroll}
        style={{ maxHeight: "min(70vh, 640px)", overflow: "auto" }}
      >
        <table className={`hr-table${summaryRow ? " hr-table--with-summary" : ""}${canBulkSelect ? " hr-table--with-select" : ""}`}>
          <thead>
            {summaryRow ? (
              <tr className="hr-table__summary-row">
                {canBulkSelect ? <td className="hr-table__select" /> : null}
                {canDelete && onDeleteRow ? <td className="hr-table__actions" /> : null}
                {sheet.columns.map((col) => (
                  <td key={col.key} title={formatCellDisplay(summaryRow[col.key])}>
                    {formatCellDisplay(summaryRow[col.key])}
                  </td>
                ))}
              </tr>
            ) : null}
            <tr className="hr-table__header-row">
              {canBulkSelect ? (
                <th className="hr-table__select" title="Выбрать все строки на экране">
                  <input
                    type="checkbox"
                    className="hr-table__checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected && !allSelected;
                    }}
                    onChange={(e) => toggleSelectAll(e.target.checked)}
                    aria-label="Выбрать все"
                  />
                </th>
              ) : null}
              {canDelete && onDeleteRow ? <th className="hr-table__actions" /> : null}
              {sheet.columns.map((col) => (
                <th key={col.key}>
                  <HaulzColumnFilterHeader
                    col={col}
                    uniqueValues={uniqueByColumn[col.key] ?? []}
                    selectedValues={columnFilters[col.key] ?? null}
                    onChange={(selected) => setColumnFilter(col.key, selected)}
                    sortDirection={sortDirectionForColumn(columnSort, col.key)}
                    onSortClick={() => handleColumnSort(col.key)}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataRows.length === 0 && !summaryRow ? (
              <tr>
                <td colSpan={sheet.columns.length + leadColCount} className="hr-table__empty">
                  Нет строк по выбранным фильтрам
                </td>
              </tr>
            ) : (
              <>
                {padTop > 0 ? (
                  <tr aria-hidden="true">
                    <td colSpan={sheet.columns.length + leadColCount} style={{ height: padTop, padding: 0, border: 0 }} />
                  </tr>
                ) : null}
                {visibleRows.map((row) => {
                  const rowId = row._rowId ?? "";
                  const isSelected = Boolean(rowId && selectedRowIds.has(rowId));
                  return (
                  <tr
                    key={row._rowId ?? String(row.num ?? Math.random())}
                    className={[
                      sheet.id.startsWith("ul-") && isUlRowInItog(row) ? "hr-table__row--in-itog" : "",
                      isSelected ? "hr-table__row--selected" : "",
                    ].filter(Boolean).join(" ") || undefined}
                  >
                    {canBulkSelect ? (
                      <td className="hr-table__select">
                        {rowId ? (
                          <input
                            type="checkbox"
                            className="hr-table__checkbox"
                            checked={isSelected}
                            onChange={(e) => toggleRowSelection(rowId, e.target.checked)}
                            aria-label="Выбрать строку"
                          />
                        ) : null}
                      </td>
                    ) : null}
                    {canDelete && onDeleteRow ? (
                      <td className="hr-table__actions">
                        <button
                          type="button"
                          className="hr-table__delete-btn"
                          aria-label="Удалить строку"
                          onClick={() => row._rowId && onDeleteRow(row._rowId)}
                        >
                          ×
                        </button>
                      </td>
                    ) : null}
                    {sheet.columns.map((col) => (
                      <td
                        key={col.key}
                        className={sheet.id.startsWith("ul-") && col.key === "inItog" && isUlRowInItog(row) ? "hr-table__cell--in-itog" : undefined}
                        style={cellStyle(sheet, row, col)}
                        title={formatUlCellDisplay(sheet, row, col)}
                      >
                        {sheet.id === "stop" && col.key === "matchMode" && onStopMatchModeChange && row._rowId ? (
                          <select
                            className="hr-stop-match-select"
                            value={normalizeStopMatchMode(row.matchMode)}
                            onChange={(e) =>
                              onStopMatchModeChange(row._rowId!, e.target.value as StopMatchMode)
                            }
                          >
                            {(Object.entries(STOP_MATCH_MODE_LABELS) as [StopMatchMode, string][]).map(
                              ([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ),
                            )}
                          </select>
                        ) : (
                          formatUlCellDisplay(sheet, row, col)
                        )}
                      </td>
                    ))}
                  </tr>
                  );
                })}
                {padBottom > 0 ? (
                  <tr aria-hidden="true">
                    <td colSpan={sheet.columns.length + leadColCount} style={{ height: padBottom, padding: 0, border: 0 }} />
                  </tr>
                ) : null}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

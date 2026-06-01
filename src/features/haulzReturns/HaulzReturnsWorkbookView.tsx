import React, { useCallback, useMemo, useRef, useState } from "react";
import type { HaulzColumn, HaulzSheet, HaulzSheetRow } from "../../lib/haulzReturns";
import {
  itogRowHighlight,
  itogUlDataHighlight,
  UL_HIGHLIGHT,
} from "../../lib/haulzReturns";

const ROW_HEIGHT = 32;
const OVERSCAN = 8;

type Props = {
  sheet: HaulzSheet;
  onDeleteRow?: (rowId: string) => void;
  canDelete?: boolean;
};

function cellStyle(sheet: HaulzSheet, row: HaulzSheetRow, col: HaulzColumn): React.CSSProperties | undefined {
  if (sheet.id === "itog") {
    const validation = {
      englishOnly: Boolean(row.englishOnly),
      au585: Boolean(row.au585),
      digitsOnly: Boolean(row.digitsOnly),
      pinkList: Boolean(row.pinkList),
    };
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
  if (sheet.id.startsWith("ul-") && Number(row.inItog) > 0) {
    return { backgroundColor: UL_HIGHLIGHT };
  }
  return undefined;
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return String(v);
}

export function HaulzReturnsWorkbookView({ sheet, onDeleteRow, canDelete }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(480);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setScrollTop(el.scrollTop);
    setViewportH(el.clientHeight);
  }, []);

  const { start, end } = useMemo(() => {
    const total = sheet.rows.length;
    if (total <= 200) return { start: 0, end: total };
    const s = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const visible = Math.ceil(viewportH / ROW_HEIGHT) + OVERSCAN * 2;
    return { start: s, end: Math.min(total, s + visible) };
  }, [sheet.rows.length, scrollTop, viewportH]);

  const visibleRows = sheet.rows.slice(start, end);
  const padTop = start * ROW_HEIGHT;
  const padBottom = Math.max(0, (sheet.rows.length - end) * ROW_HEIGHT);

  return (
    <div
      ref={scrollRef}
      className="hr-table-wrap"
      onScroll={onScroll}
      style={{ maxHeight: "min(70vh, 640px)", overflow: "auto" }}
    >
      <table className="hr-table">
        <thead>
          <tr>
            {canDelete && onDeleteRow ? <th className="hr-table__actions" /> : null}
            {sheet.columns.map((col) => (
              <th key={col.key}>{col.label || col.key}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {padTop > 0 ? (
            <tr aria-hidden="true">
              <td colSpan={sheet.columns.length + (canDelete ? 1 : 0)} style={{ height: padTop, padding: 0, border: 0 }} />
            </tr>
          ) : null}
          {visibleRows.map((row) => (
            <tr key={row._rowId ?? String(row.num ?? Math.random())}>
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
                <td key={col.key} style={cellStyle(sheet, row, col)} title={formatCell(row[col.key])}>
                  {formatCell(row[col.key])}
                </td>
              ))}
            </tr>
          ))}
          {padBottom > 0 ? (
            <tr aria-hidden="true">
              <td colSpan={sheet.columns.length + (canDelete ? 1 : 0)} style={{ height: padBottom, padding: 0, border: 0 }} />
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

import React from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

type Props = {
  label: React.ReactNode;
  column: string;
  sortColumn: string;
  sortOrder: "asc" | "desc";
  onSort: (column: "index" | "cargo" | "status" | "count" | "volume" | "weight" | "paidWeight" | "customer" | "density") => void;
  align?: "left" | "right" | "center";
  style?: React.CSSProperties;
};

export function SendingsTableSummarySortTh(props: Props) {
  const { label, column, sortColumn, sortOrder, onSort, align = "left", style } = props;
  const active = sortColumn === column;
  return (
    <th
      style={{
        padding: "0.35rem 0.3rem",
        textAlign: align,
        fontWeight: 600,
        whiteSpace: align === "right" ? "nowrap" : undefined,
        cursor: "pointer",
        userSelect: "none",
        ...style,
      }}
      onClick={() => onSort(column)}
      title="Сортировка"
    >
      {label}{" "}
      {active &&
        (sortOrder === "asc" ? (
          <ArrowUp className="w-3 h-3" style={{ verticalAlign: "middle", marginLeft: 2, display: "inline-block" }} />
        ) : (
          <ArrowDown className="w-3 h-3" style={{ verticalAlign: "middle", marginLeft: 2, display: "inline-block" }} />
        ))}
    </th>
  );
}

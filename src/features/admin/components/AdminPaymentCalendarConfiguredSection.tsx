import React from "react";
import { Button, Typography } from "@maxhub/max-ui";
import { ChevronDown, ChevronUp } from "lucide-react";
import { PAYMENT_WEEKDAY_LABELS } from "../lib/paymentCalendarConstants";
import type { AdminPaymentCalendarState } from "../hooks/useAdminPaymentCalendar";

type Props = Pick<
  AdminPaymentCalendarState,
  | "items"
  | "itemsSorted"
  | "selectedInns"
  | "sortColumn"
  | "sortDir"
  | "toggleSort"
  | "toggleInnSelection"
  | "toggleSelectAllInns"
>;

function SortIcon({ column, sortColumn, sortDir }: { column: "inn" | "customer_name" | "days_to_pay"; sortColumn: AdminPaymentCalendarState["sortColumn"]; sortDir: AdminPaymentCalendarState["sortDir"] }) {
  if (sortColumn !== column) return null;
  return sortDir === "asc"
    ? <ChevronUp className="w-4 h-4 inline-block ml-0.5" style={{ verticalAlign: "middle" }} />
    : <ChevronDown className="w-4 h-4 inline-block ml-0.5" style={{ verticalAlign: "middle" }} />;
}

export function AdminPaymentCalendarConfiguredSection({
  items,
  itemsSorted,
  selectedInns,
  sortColumn,
  sortDir,
  toggleSort,
  toggleInnSelection,
  toggleSelectAllInns,
}: Props) {
  if (items.length === 0) return null;

  return (
    <>
      <Typography.Body style={{ fontWeight: 600, marginTop: "1.5rem", marginBottom: "0.5rem" }}>Заданные условия оплаты</Typography.Body>
      <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.5rem" }}>
        Выберите строки и нажмите «Применить к выбранным», чтобы изменить срок для нескольких заказчиков.
      </Typography.Body>
      <div style={{ marginBottom: "0.5rem", marginTop: "0.5rem" }}>
        <Button
          type="button"
          className="filter-button"
          onClick={() => toggleSelectAllInns(items.map((c) => c.inn))}
        >
          {items.every((c) => selectedInns.has(c.inn)) ? "Снять выделение" : "Выделить все"}
        </Button>
      </div>
      <div style={{ overflowX: "auto", maxHeight: "40vh", overflowY: "auto", marginTop: "0.5rem" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
              <th style={{ padding: "0.4rem 0.5rem", width: 40, textAlign: "left" }} />
              <th
                style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600, cursor: "pointer", userSelect: "none" }}
                onClick={() => toggleSort("inn")}
                title="Сортировка по ИНН"
              >
                ИНН <SortIcon column="inn" sortColumn={sortColumn} sortDir={sortDir} />
              </th>
              <th
                style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600, cursor: "pointer", userSelect: "none" }}
                onClick={() => toggleSort("customer_name")}
                title="Сортировка по наименованию"
              >
                Наименование <SortIcon column="customer_name" sortColumn={sortColumn} sortDir={sortDir} />
              </th>
              <th
                style={{ padding: "0.4rem 0.5rem", textAlign: "right", fontWeight: 600, cursor: "pointer", userSelect: "none" }}
                onClick={() => toggleSort("days_to_pay")}
                title="Сортировка по сроку (календарных дней)"
              >
                Срок (дней) <SortIcon column="days_to_pay" sortColumn={sortColumn} sortDir={sortDir} />
              </th>
              <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Платежные дни</th>
            </tr>
          </thead>
          <tbody>
            {itemsSorted.map((c) => {
              const weekdays = (c.payment_weekdays ?? []).filter((d) => d >= 1 && d <= 5);
              const weekdaysLabel = weekdays.length > 0
                ? weekdays.sort((a, b) => a - b).map((d) => PAYMENT_WEEKDAY_LABELS.find((w) => w.value === d)?.label ?? d).join(", ")
                : "—";
              return (
                <tr key={c.inn} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "0.4rem 0.5rem" }}>
                    <input
                      type="checkbox"
                      checked={selectedInns.has(c.inn)}
                      onChange={() => toggleInnSelection(c.inn)}
                      aria-label={`Выбрать ${c.customer_name || c.inn}`}
                    />
                  </td>
                  <td style={{ padding: "0.4rem 0.5rem" }}>{c.inn}</td>
                  <td style={{ padding: "0.4rem 0.5rem" }}>{c.customer_name || "—"}</td>
                  <td style={{ padding: "0.4rem 0.5rem", textAlign: "right", color: "var(--color-text-secondary)" }}>{c.days_to_pay}</td>
                  <td style={{ padding: "0.4rem 0.5rem", color: "var(--color-text-secondary)", fontSize: "0.85rem" }}>{weekdaysLabel}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

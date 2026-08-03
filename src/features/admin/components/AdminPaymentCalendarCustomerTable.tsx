import React from "react";
import { Flex, Typography } from "@maxhub/max-ui";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { PAYMENT_DAYS_OPTIONS, PAYMENT_WEEKDAY_LABELS } from "../lib/paymentCalendarConstants";
import type { AdminPaymentCalendarState } from "../hooks/useAdminPaymentCalendar";

type Props = Pick<
  AdminPaymentCalendarState,
  | "customerList"
  | "customerListSorted"
  | "customerLoading"
  | "selectedInns"
  | "savingInn"
  | "sortColumn"
  | "sortDir"
  | "toggleSort"
  | "toggleInnSelection"
  | "saveCustomerDays"
  | "saveCustomerWeekdays"
>;

function SortIcon({ column, sortColumn, sortDir }: { column: "inn" | "customer_name" | "days_to_pay"; sortColumn: AdminPaymentCalendarState["sortColumn"]; sortDir: AdminPaymentCalendarState["sortDir"] }) {
  if (sortColumn !== column) return null;
  return sortDir === "asc"
    ? <ChevronUp className="w-4 h-4 inline-block ml-0.5" style={{ verticalAlign: "middle" }} />
    : <ChevronDown className="w-4 h-4 inline-block ml-0.5" style={{ verticalAlign: "middle" }} />;
}

export function AdminPaymentCalendarCustomerTable({
  customerList,
  customerListSorted,
  customerLoading,
  selectedInns,
  savingInn,
  sortColumn,
  sortDir,
  toggleSort,
  toggleInnSelection,
  saveCustomerDays,
  saveCustomerWeekdays,
}: Props) {
  return (
    <>
      <div style={{ overflowX: "auto", maxHeight: "50vh", overflowY: "auto" }}>
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
            {customerListSorted.map((c) => {
              const currentDays = c.days != null ? Number(c.days) : 0;
              const currentWeekdays = c.payment_weekdays ?? [];
              const selected = selectedInns.has(c.inn);
              const saving = savingInn === c.inn;
              const options = [...new Set([...PAYMENT_DAYS_OPTIONS, currentDays].filter((d) => d >= 0 && d <= 365))].sort((a, b) => a - b);
              return (
                <tr key={c.inn} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "0.4rem 0.5rem" }}>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleInnSelection(c.inn)}
                      aria-label={`Выбрать ${c.customer_name || c.inn}`}
                    />
                  </td>
                  <td style={{ padding: "0.4rem 0.5rem" }}>{c.inn}</td>
                  <td style={{ padding: "0.4rem 0.5rem" }}>{c.customer_name || "—"}</td>
                  <td style={{ padding: "0.4rem 0.5rem", textAlign: "right" }}>
                    {saving ? (
                      <Loader2 className="w-4 h-4 animate-spin" style={{ display: "inline-block", verticalAlign: "middle" }} />
                    ) : (
                      <select
                        className="admin-form-input"
                        value={currentDays}
                        style={{ minWidth: "4rem", padding: "0.25rem 0.35rem", fontSize: "0.9rem" }}
                        aria-label={`Срок оплаты в календарных днях для ${c.customer_name || c.inn}`}
                        onChange={(e) => {
                          const val = Math.max(0, Math.min(365, parseInt(e.target.value, 10) || 0));
                          void saveCustomerDays(c.inn, val);
                        }}
                      >
                        {options.map((d) => (
                          <option key={d} value={d}>{d === 0 ? "—" : d}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td style={{ padding: "0.4rem 0.5rem" }}>
                    {saving ? null : (
                      <Flex gap="0.2rem" wrap="wrap">
                        {PAYMENT_WEEKDAY_LABELS.map(({ value, label }) => (
                          <label key={value} style={{ display: "inline-flex", alignItems: "center", cursor: "pointer", fontSize: "0.8rem" }} title={label}>
                            <input
                              type="checkbox"
                              checked={currentWeekdays.includes(value)}
                              onChange={() => {
                                const next = currentWeekdays.includes(value)
                                  ? currentWeekdays.filter((d) => d !== value)
                                  : [...currentWeekdays, value].sort((a, b) => a - b);
                                void saveCustomerWeekdays(c.inn, next);
                              }}
                            />
                            <span>{label}</span>
                          </label>
                        ))}
                      </Flex>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {customerList.length === 0 && !customerLoading && (
        <Typography.Body style={{ color: "var(--color-text-secondary)", marginTop: "0.5rem" }}>
          Введите поиск и нажмите «Найти» или загрузится список заказчиков из справочника.
        </Typography.Body>
      )}
    </>
  );
}

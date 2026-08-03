import React from "react";
import { Flex, Typography } from "@maxhub/max-ui";
import { Loader2 } from "lucide-react";
import { WORK_SCHEDULE_WEEKDAY_LABELS } from "../lib/workScheduleConstants";
import type { AdminWorkScheduleState } from "../hooks/useAdminWorkSchedule";

type Props = Pick<
  AdminWorkScheduleState,
  | "customerList"
  | "customerListSorted"
  | "customerLoading"
  | "selectedInns"
  | "savingInn"
  | "toggleInnSelection"
  | "saveCustomerWeekdays"
  | "saveCustomerStart"
  | "saveCustomerEnd"
>;

export function AdminWorkScheduleCustomerTable({
  customerList,
  customerListSorted,
  customerLoading,
  selectedInns,
  savingInn,
  toggleInnSelection,
  saveCustomerWeekdays,
  saveCustomerStart,
  saveCustomerEnd,
}: Props) {
  return (
    <>
      <div style={{ overflowX: "auto", maxHeight: "50vh", overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
              <th style={{ padding: "0.4rem 0.5rem", width: 40, textAlign: "left" }} />
              <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>ИНН</th>
              <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Наименование</th>
              <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Рабочие дни</th>
              <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>С</th>
              <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>До</th>
            </tr>
          </thead>
          <tbody>
            {customerListSorted.map((c) => {
              const currentWeekdays = c.days_of_week ?? [1, 2, 3, 4, 5];
              const currentStart = c.work_start ?? "09:00";
              const currentEnd = c.work_end ?? "18:00";
              const selected = selectedInns.has(c.inn);
              const saving = savingInn === c.inn;
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
                  <td style={{ padding: "0.4rem 0.5rem" }}>
                    {saving ? (
                      <Loader2 className="w-4 h-4 animate-spin" style={{ display: "inline-block", verticalAlign: "middle" }} />
                    ) : (
                      <Flex gap="0.2rem" wrap="wrap">
                        {WORK_SCHEDULE_WEEKDAY_LABELS.map(({ value, label }) => (
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
                  <td style={{ padding: "0.4rem 0.5rem" }}>
                    {saving ? null : (
                      <input
                        type="time"
                        value={currentStart}
                        onChange={(e) => void saveCustomerStart(c.inn, e.target.value)}
                        className="admin-form-input"
                        style={{ padding: "0.25rem 0.35rem", fontSize: "0.9rem" }}
                      />
                    )}
                  </td>
                  <td style={{ padding: "0.4rem 0.5rem" }}>
                    {saving ? null : (
                      <input
                        type="time"
                        value={currentEnd}
                        onChange={(e) => void saveCustomerEnd(c.inn, e.target.value)}
                        className="admin-form-input"
                        style={{ padding: "0.25rem 0.35rem", fontSize: "0.9rem" }}
                      />
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

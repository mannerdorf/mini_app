import React from "react";
import { Typography } from "@maxhub/max-ui";
import { WORK_SCHEDULE_WEEKDAY_LABELS } from "../lib/workScheduleConstants";
import type { AdminWorkScheduleState } from "../hooks/useAdminWorkSchedule";

type Props = Pick<AdminWorkScheduleState, "items">;

export function AdminWorkScheduleConfiguredSection({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <>
      <Typography.Body style={{ fontWeight: 600, marginTop: "1.5rem", marginBottom: "0.5rem" }}>Заданные графики работы</Typography.Body>
      <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.5rem" }}>
        Список заказчиков с настроенным графиком.
      </Typography.Body>
      <div style={{ overflowX: "auto", maxHeight: "40vh", overflowY: "auto", marginTop: "0.5rem" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
              <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>ИНН</th>
              <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Наименование</th>
              <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Рабочие дни</th>
              <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Часы</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => {
              const weekdays = (c.days_of_week ?? []).filter((d) => d >= 1 && d <= 7);
              const weekdaysLabel = weekdays.length > 0
                ? weekdays.sort((a, b) => a - b).map((d) => WORK_SCHEDULE_WEEKDAY_LABELS.find((w) => w.value === d)?.label ?? d).join(", ")
                : "—";
              return (
                <tr key={c.inn} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "0.4rem 0.5rem" }}>{c.inn}</td>
                  <td style={{ padding: "0.4rem 0.5rem" }}>{c.customer_name || "—"}</td>
                  <td style={{ padding: "0.4rem 0.5rem", color: "var(--color-text-secondary)" }}>{weekdaysLabel}</td>
                  <td style={{ padding: "0.4rem 0.5rem", color: "var(--color-text-secondary)" }}>{c.work_start || "09:00"}–{c.work_end || "18:00"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

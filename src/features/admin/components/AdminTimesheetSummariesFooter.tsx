import React from "react";
import { Flex, Panel, Typography } from "@maxhub/max-ui";
import type { AdminTimesheetState } from "../hooks/useAdminTimesheet";

export type AdminTimesheetSummariesFooterProps = {
  ts: AdminTimesheetState;
};

export function AdminTimesheetSummariesFooter({ ts }: AdminTimesheetSummariesFooterProps) {
  const { timesheetDepartmentSummaries, timesheetCompanySummary } = ts;

  return (
    <>
      <Flex align="center" gap="0.5rem" wrap="wrap">
        <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>Я - Явка</Typography.Body>
        <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>ПР - прогул</Typography.Body>
        <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>Б - Болезнь</Typography.Body>
        <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>В - Выходной</Typography.Body>
        <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>ОГ - Отгул</Typography.Body>
        <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>ОТ - отпуск</Typography.Body>
        <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>УВ - Уволен</Typography.Body>
        <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>
          Смена: нажмите и удерживайте для выбора статуса
        </Typography.Body>
      </Flex>
      {timesheetDepartmentSummaries.map((row) => (
        <Panel key={`timesheet-summary-${row.department}`} className="cargo-card" style={{ marginTop: "0.65rem", padding: "0.7rem" }}>
          <Typography.Body style={{ fontWeight: 600 }}>
            Итого по подразделению: {row.department} · {row.totalShifts} смен · {row.totalHours} ч
          </Typography.Body>
          <Flex align="center" gap="0.35rem" wrap="wrap" style={{ marginTop: "0.14rem" }}>
            <span style={{ fontSize: "0.74rem", padding: "0.14rem 0.4rem", borderRadius: 999, border: "1px solid #cbd5e1", background: "#f8fafc", color: "#0f172a", fontWeight: 600 }}>
              {row.totalMoney.toLocaleString("ru-RU")} ₽
            </span>
            <span style={{ fontSize: "0.74rem", padding: "0.14rem 0.4rem", borderRadius: 999, border: "1px solid #86efac", background: "#dcfce7", color: "#166534", fontWeight: 600 }}>
              {row.totalPaid.toLocaleString("ru-RU")} ₽
            </span>
            <span style={{ fontSize: "0.74rem", padding: "0.14rem 0.4rem", borderRadius: 999, border: "1px solid #fcd34d", background: "#fef3c7", color: "#92400e", fontWeight: 700 }}>
              {row.totalOutstanding.toLocaleString("ru-RU")} ₽
            </span>
          </Flex>
        </Panel>
      ))}
      <Panel className="cargo-card" style={{ marginTop: "0.65rem", padding: "0.7rem" }}>
        <Typography.Body style={{ fontWeight: 600 }}>
          Итого по компании: {timesheetCompanySummary.totalShifts} смен · {timesheetCompanySummary.totalHours} ч
        </Typography.Body>
        <Flex align="center" gap="0.35rem" wrap="wrap" style={{ marginTop: "0.14rem" }}>
          <span style={{ fontSize: "0.74rem", padding: "0.14rem 0.4rem", borderRadius: 999, border: "1px solid #cbd5e1", background: "#f8fafc", color: "#0f172a", fontWeight: 600 }}>
            {timesheetCompanySummary.totalMoney.toLocaleString("ru-RU")} ₽
          </span>
          <span style={{ fontSize: "0.74rem", padding: "0.14rem 0.4rem", borderRadius: 999, border: "1px solid #86efac", background: "#dcfce7", color: "#166534", fontWeight: 600 }}>
            {timesheetCompanySummary.totalPaid.toLocaleString("ru-RU")} ₽
          </span>
          <span style={{ fontSize: "0.74rem", padding: "0.14rem 0.4rem", borderRadius: 999, border: "1px solid #fcd34d", background: "#fef3c7", color: "#92400e", fontWeight: 700 }}>
            {timesheetCompanySummary.totalOutstanding.toLocaleString("ru-RU")} ₽
          </span>
        </Flex>
      </Panel>
    </>
  );
}

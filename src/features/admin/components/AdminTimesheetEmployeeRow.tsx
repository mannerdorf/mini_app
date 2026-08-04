import React, { useMemo } from "react";
import { Typography } from "@maxhub/max-ui";
import type { EmployeeDirectoryRow } from "../types/adminUsers";
import type { AdminTimesheetState } from "../hooks/useAdminTimesheet";
import { computeTimesheetEmployeeStats } from "../lib/adminTimesheetRowStats";
import { AdminTimesheetDayCell } from "./AdminTimesheetDayCell";
import { AdminTimesheetPayoutPanel } from "./AdminTimesheetPayoutPanel";

export type AdminTimesheetEmployeeRowProps = {
  emp: EmployeeDirectoryRow;
  department: string;
  isSuperAdmin: boolean;
  ts: AdminTimesheetState;
};

export function AdminTimesheetEmployeeRow({ emp, department, isSuperAdmin, ts }: AdminTimesheetEmployeeRowProps) {
  const {
    timesheetDays,
    timesheetHours,
    timesheetPaymentMarks,
    timesheetShiftRateOverrides,
    timesheetMobilePicker,
    timesheetPayoutsByEmployee,
    timesheetExpandedEmployeeId,
    setTimesheetExpandedEmployeeId,
    SHIFT_MARK_CODES,
  } = ts;

  const stats = useMemo(
    () => computeTimesheetEmployeeStats({
      emp,
      timesheetDays,
      timesheetHours,
      timesheetPaymentMarks,
      timesheetShiftRateOverrides,
      shiftMarkCodes: SHIFT_MARK_CODES,
      timesheetMobilePicker,
      timesheetPayoutsByEmployee,
    }),
    [emp, timesheetDays, timesheetHours, timesheetPaymentMarks, timesheetShiftRateOverrides, SHIFT_MARK_CODES, timesheetMobilePicker, timesheetPayoutsByEmployee],
  );

  const isPayoutExpanded = timesheetExpandedEmployeeId === emp.id;

  return (
    <React.Fragment key={`timesheet-row-wrap-${department}-${emp.id}`}>
      <tr>
        <td style={{ padding: "0.35rem 0.45rem", borderBottom: "1px solid var(--color-border)", position: "sticky", left: 0, background: "var(--color-bg-card, #fff)", zIndex: 30, minWidth: "15rem", boxShadow: "2px 0 0 var(--color-border)" }}>
          <Typography.Body
            style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer" }}
            onClick={() => {
              setTimesheetExpandedEmployeeId((prev) => (prev === emp.id ? null : emp.id));
            }}
          >
            {emp.full_name || emp.login}
          </Typography.Body>
          <Typography.Body style={{ display: "block", fontSize: "0.74rem", color: "var(--color-text-secondary)", marginTop: "0.1rem" }}>{emp.position || "—"}</Typography.Body>
        </td>
        {timesheetDays.map((d) => (
          <AdminTimesheetDayCell
            key={`timesheet-cell-${emp.id}-${d.iso}`}
            emp={emp}
            day={d}
            stats={stats}
            isPayoutExpanded={isPayoutExpanded}
            paidDatesSet={stats.paidDatesSet}
            ts={ts}
          />
        ))}
        <td style={{ textAlign: "center", padding: "0.35rem 0.45rem", borderBottom: "1px solid var(--color-border)", fontWeight: 600, minWidth: "7.2rem" }}>
          <div>{stats.totalPrimaryText}</div>
          <div style={{ fontSize: "0.76rem", color: "var(--color-text-secondary)" }}>
            {Number(stats.totalMoney.toFixed(2))} ₽
          </div>
          <div style={{ fontSize: "0.72rem", color: "#15803d", marginTop: "0.12rem" }}>
            Остаток: {stats.employeeOutstanding.toLocaleString("ru-RU")} ₽
          </div>
        </td>
        {SHIFT_MARK_CODES.map((code) => (
          <td key={`${emp.id}-legend-${code}`} style={{ textAlign: "center", padding: "0.35rem 0.25rem", borderBottom: "1px solid var(--color-border)" }}>
            <Typography.Body style={{ fontSize: "0.82rem", fontWeight: 600 }}>
              {stats.legendCounts[code] || 0}
            </Typography.Body>
          </td>
        ))}
      </tr>
      {isPayoutExpanded ? (
        <AdminTimesheetPayoutPanel emp={emp} stats={stats} isSuperAdmin={isSuperAdmin} ts={ts} />
      ) : null}
    </React.Fragment>
  );
}

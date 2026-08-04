import React from "react";
import { Panel, Typography } from "@maxhub/max-ui";
import type { EmployeeDirectoryRow } from "../types/adminUsers";
import type { AdminTimesheetState } from "../hooks/useAdminTimesheet";
import { AdminTimesheetEmployeeRow } from "./AdminTimesheetEmployeeRow";

export type AdminTimesheetDepartmentGroupProps = {
  department: string;
  employees: EmployeeDirectoryRow[];
  isSuperAdmin: boolean;
  ts: AdminTimesheetState;
};

export function AdminTimesheetDepartmentGroup({ department, employees, isSuperAdmin, ts }: AdminTimesheetDepartmentGroupProps) {
  const { timesheetDays, SHIFT_MARK_CODES } = ts;

  return (
    <Panel
      key={`timesheet-group-${department}`}
      className="cargo-card timesheet-panel"
      style={{ padding: "0.6rem" }}
    >
      <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>
        Подразделение: {department}
      </Typography.Body>
      <div
        className="timesheet-table-scroll"
        style={{
          overflowX: "auto",
          overflowY: "auto",
          minWidth: 0,
          width: "100%",
          scrollbarGutter: "stable",
          paddingLeft: "max(0.5rem, env(safe-area-inset-left))",
          paddingRight: "max(0.5rem, env(safe-area-inset-right))",
        }}
      >
        <table
          style={{
            borderCollapse: "collapse",
            width: "100%",
            minWidth: `${380 + timesheetDays.length * 52 + SHIFT_MARK_CODES.length * 52}px`,
          }}
        >
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "0.35rem 0.45rem", borderBottom: "1px solid var(--color-border)", position: "sticky", top: 0, left: 0, background: "var(--color-bg-card, #fff)", zIndex: 40, minWidth: "15rem", boxShadow: "2px 0 0 var(--color-border)" }}>
                Сотрудник
              </th>
              {timesheetDays.map((d) => (
                <th
                  key={`timesheet-head-${department}-${d.iso}`}
                  style={{
                    position: "sticky",
                    top: 0,
                    zIndex: 20,
                    textAlign: "center",
                    padding: "0.35rem 0.25rem",
                    borderBottom: "1px solid var(--color-border)",
                    minWidth: "3.2rem",
                    background: d.isWeekend ? "var(--color-bg-hover)" : "var(--color-bg-card)",
                  }}
                >
                  <div style={{ fontSize: "0.76rem", color: d.isWeekend ? "#d93025" : "inherit", fontWeight: d.isWeekend ? 600 : 500 }}>{d.day}</div>
                  <div style={{ fontSize: "0.68rem", color: d.isWeekend ? "#d93025" : "var(--color-text-secondary)" }}>{d.weekdayShort}</div>
                </th>
              ))}
              <th style={{ position: "sticky", top: 0, zIndex: 20, textAlign: "center", padding: "0.35rem 0.45rem", borderBottom: "1px solid var(--color-border)", minWidth: "4rem", background: "var(--color-bg-card)" }}>Итого</th>
              {SHIFT_MARK_CODES.map((code) => (
                <th key={`timesheet-legend-head-${code}`} style={{ position: "sticky", top: 0, zIndex: 20, textAlign: "center", padding: "0.35rem 0.25rem", borderBottom: "1px solid var(--color-border)", minWidth: "52px", background: "var(--color-bg-card)" }}>
                  {code}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <AdminTimesheetEmployeeRow
                key={`timesheet-row-wrap-${department}-${emp.id}`}
                emp={emp}
                department={department}
                isSuperAdmin={isSuperAdmin}
                ts={ts}
              />
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

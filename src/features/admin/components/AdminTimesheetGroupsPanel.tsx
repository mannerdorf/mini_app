import React from "react";
import { Typography } from "@maxhub/max-ui";
import type { AdminTimesheetState } from "../hooks/useAdminTimesheet";
import { AdminTimesheetDepartmentGroup } from "./AdminTimesheetDepartmentGroup";
import { AdminTimesheetSummariesFooter } from "./AdminTimesheetSummariesFooter";

export type AdminTimesheetGroupsPanelProps = {
  isSuperAdmin: boolean;
  ts: AdminTimesheetState;
};

export function AdminTimesheetGroupsPanel({ isSuperAdmin, ts }: AdminTimesheetGroupsPanelProps) {
  const { timesheetDays, timesheetVisibleGroups } = ts;

  return (
    <>
      {timesheetDays.length === 0 ? (
        <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
          Выберите месяц для отображения табеля.
        </Typography.Body>
      ) : timesheetVisibleGroups.length === 0 ? (
        <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
          За выбранный период сотрудники не найдены.
        </Typography.Body>
      ) : (
        <div className="timesheet-groups-wrap" style={{ display: "flex", flexDirection: "column", gap: "0.9rem", width: "100%", paddingRight: "3rem" }}>
          {timesheetVisibleGroups.map((group) => (
            <AdminTimesheetDepartmentGroup
              key={`timesheet-group-${group.department}`}
              department={group.department}
              employees={group.employees}
              isSuperAdmin={isSuperAdmin}
              ts={ts}
            />
          ))}
          <AdminTimesheetSummariesFooter ts={ts} />
        </div>
      )}
    </>
  );
}

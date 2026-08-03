import { Flex, Panel, Typography } from "@maxhub/max-ui";
import { Loader2 } from "lucide-react";
import type { UseAdminEmployeeDirectoryReturn } from "../hooks/useAdminEmployeeDirectory";
import { useAdminTimesheet } from "../hooks/useAdminTimesheet";
import { AdminTimesheetToolbar } from "../components/AdminTimesheetToolbar";
import { AdminTimesheetGroupsPanel } from "../components/AdminTimesheetGroupsPanel";
import { AdminTimesheetShiftPicker } from "../components/AdminTimesheetShiftPicker";

type AdminTimesheetTabProps = {
  adminToken: string;
  isSuperAdmin: boolean;
  onLogout?: (reason?: "expired") => void;
  onError: (msg: string | null) => void;
  employeeDir: UseAdminEmployeeDirectoryReturn;
};

export function AdminTimesheetTab({ adminToken, isSuperAdmin, onLogout, onError, employeeDir }: AdminTimesheetTabProps) {
  const ts = useAdminTimesheet({ adminToken, isSuperAdmin, onLogout, onError, employeeDir });
  const { timesheetMonthPaymentStatus } = ts;

  return (
    <Panel
      className="cargo-card timesheet-container timesheet-container-wide"
      style={{ padding: "var(--pad-card, 1rem)" }}
    >
      <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Табель учета рабочего времени</Typography.Body>
      <AdminTimesheetToolbar ts={ts} employeeDir={employeeDir} />
      <Typography.Body style={{ fontSize: "0.78rem", color: timesheetMonthPaymentStatus.color, marginTop: "-0.35rem", marginBottom: "0.55rem" }}>
        Статус месяца: {timesheetMonthPaymentStatus.label}
      </Typography.Body>
      <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginTop: "-0.35rem", marginBottom: "0.7rem" }}>
        Нажмите на сотрудника, чтобы открыть таблицу выплат и отметить дни к оплате.
      </Typography.Body>
      {employeeDir.loading ? (
        <Flex align="center" gap="0.5rem">
          <Loader2 className="w-4 h-4 animate-spin" />
          <Typography.Body>Загрузка...</Typography.Body>
        </Flex>
      ) : (
        <AdminTimesheetGroupsPanel isSuperAdmin={isSuperAdmin} ts={ts} />
      )}
      <AdminTimesheetShiftPicker ts={ts} />
    </Panel>
  );
}

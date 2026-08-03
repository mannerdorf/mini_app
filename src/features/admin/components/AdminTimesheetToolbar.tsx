import { Button, Flex, Panel, Typography, Input } from "@maxhub/max-ui";
import { getCurrentMonthYm } from "../../../lib/dateUtils";
import type { UseAdminEmployeeDirectoryReturn } from "../hooks/useAdminEmployeeDirectory";
import type { AdminTimesheetState } from "../hooks/useAdminTimesheet";

export type AdminTimesheetToolbarProps = {
  ts: AdminTimesheetState;
  employeeDir: UseAdminEmployeeDirectoryReturn;
};

export function AdminTimesheetToolbar({ ts, employeeDir }: AdminTimesheetToolbarProps) {
  const {
    timesheetMonth,
    setTimesheetMonth,
    timesheetSearch,
    setTimesheetSearch,
    timesheetDepartmentFilter,
    setTimesheetDepartmentFilter,
    timesheetDepartmentOptions,
    fetchTimesheetEntries,
  } = ts;

  return (
    <Panel className="cargo-card" style={{ padding: "0.75rem", marginBottom: "0.75rem" }}>
      <Flex align="center" justify="space-between" wrap="wrap" gap="0.75rem">
        <Typography.Body style={{ fontWeight: 600 }}>
          Подразделение: {timesheetDepartmentFilter === "all" ? "Все подразделения" : timesheetDepartmentFilter}
        </Typography.Body>
        <Flex align="center" gap="0.5rem" wrap="wrap">
          <select
            value={timesheetDepartmentFilter}
            onChange={(e) => setTimesheetDepartmentFilter(e.target.value)}
            style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: "0.4rem 0.6rem", background: "var(--color-bg)", minWidth: "12.5rem" }}
            aria-label="Фильтр подразделения табеля"
          >
            <option value="all">Все подразделения</option>
            {timesheetDepartmentOptions.map((dep) => (
              <option key={`timesheet-department-filter-${dep}`} value={dep}>
                {dep}
              </option>
            ))}
          </select>
          <input
            type="month"
            value={timesheetMonth}
            onChange={(e) => setTimesheetMonth(e.target.value)}
            style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: "0.4rem 0.6rem", background: "var(--color-bg)" }}
            aria-label="Месяц табеля"
          />
          <Button
            type="button"
            className="filter-button"
            title="Текущий месяц"
            style={{ padding: "0.4rem 0.55rem", whiteSpace: "nowrap" }}
            onClick={() => setTimesheetMonth(getCurrentMonthYm())}
          >
            Сегодня
          </Button>
          <Button
            type="button"
            className="filter-button"
            onClick={() => {
              void employeeDir.fetch(timesheetMonth);
              void fetchTimesheetEntries();
            }}
            disabled={employeeDir.loading}
          >
            Обновить
          </Button>
        </Flex>
      </Flex>
      <Input
        type="text"
        className="admin-form-input"
        value={timesheetSearch}
        onChange={(e) => setTimesheetSearch(e.target.value)}
        placeholder="Поиск по сотруднику: ФИО, должность, логин"
        style={{ width: "100%", marginTop: "0.55rem", height: "2rem", minHeight: "2rem", boxSizing: "border-box", paddingTop: "0.25rem", paddingBottom: "0.25rem" }}
      />
    </Panel>
  );
}

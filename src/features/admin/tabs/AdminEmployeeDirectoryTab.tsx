import { Flex, Panel, Typography } from "@maxhub/max-ui";
import { Loader2 } from "lucide-react";
import type { UseAdminEmployeeDirectoryReturn } from "../hooks/useAdminEmployeeDirectory";
import { useAdminEmployeeDirectoryMutations } from "../hooks/useAdminEmployeeDirectoryMutations";
import { AdminEmployeeAddFormPanel } from "../components/AdminEmployeeAddFormPanel";
import { AdminEmployeeDirectoryRow } from "../components/AdminEmployeeDirectoryRow";

export type AdminEmployeeDirectoryTabProps = {
  adminToken: string;
  onError: (msg: string | null) => void;
  employeeDir: UseAdminEmployeeDirectoryReturn;
};

export function AdminEmployeeDirectoryTab({ adminToken, onError, employeeDir }: AdminEmployeeDirectoryTabProps) {
  const mutations = useAdminEmployeeDirectoryMutations({ adminToken, onError, employeeDir });
  const { items: employeeDirectoryItems, loading: employeeDirectoryLoading } = employeeDir;

  return (
    <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
      <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Справочник сотрудников HAULZ</Typography.Body>
      <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginBottom: "0.9rem" }}>
        Назначение атрибутов сотруднику (email опционален): ФИО, структурное подразделение, должность, тип сотрудничества и роль.
      </Typography.Body>

      <AdminEmployeeAddFormPanel employeeDir={employeeDir} mutations={mutations} />

      {employeeDirectoryLoading ? (
        <Flex align="center" gap="0.5rem">
          <Loader2 className="w-4 h-4 animate-spin" />
          <Typography.Body>Загрузка...</Typography.Body>
        </Flex>
      ) : employeeDirectoryItems.length === 0 ? (
        <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>Сотрудники пока не заведены.</Typography.Body>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
          {employeeDirectoryItems.map((emp) => (
            <AdminEmployeeDirectoryRow key={emp.id} emp={emp} employeeDir={employeeDir} mutations={mutations} />
          ))}
        </div>
      )}
    </Panel>
  );
}

import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import type { PermissionPreset } from "../lib/permissions";
import type { AdminUserRegistrationState } from "../hooks/useAdminUserRegistration";
import { AdminUserAddCustomerSection } from "./AdminUserAddCustomerSection";
import { AdminUserAddEmailField } from "./AdminUserAddEmailField";
import { AdminUserAddPermissionsSection } from "./AdminUserAddPermissionsSection";
import { AdminUserAddPasswordSection } from "./AdminUserAddPasswordSection";

export type AdminUserAddFormPanelProps = {
  isSuperAdmin: boolean;
  permissionPresets: PermissionPreset[];
  customerDirectoryMap: Record<string, string>;
  registration: AdminUserRegistrationState;
  onClose: () => void;
};

export function AdminUserAddFormPanel({
  isSuperAdmin,
  permissionPresets,
  customerDirectoryMap,
  registration,
  onClose,
}: AdminUserAddFormPanelProps) {
  const { handleAddUser } = registration;

  return (
    <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)", marginBottom: "var(--element-gap, 1rem)" }}>
      <Flex align="center" justify="space-between" style={{ marginBottom: "1rem" }}>
        <Typography.Body style={{ fontWeight: 600 }}>Регистрация пользователя</Typography.Body>
        <Button type="button" className="filter-button" onClick={onClose} aria-label="Закрыть форму регистрации">
          Отмена
        </Button>
      </Flex>
      <form onSubmit={handleAddUser}>
        <AdminUserAddCustomerSection customerDirectoryMap={customerDirectoryMap} registration={registration} />
        <AdminUserAddEmailField registration={registration} />
        <AdminUserAddPermissionsSection
          isSuperAdmin={isSuperAdmin}
          permissionPresets={permissionPresets}
          registration={registration}
        />
        <AdminUserAddPasswordSection registration={registration} />
      </form>
    </Panel>
  );
}

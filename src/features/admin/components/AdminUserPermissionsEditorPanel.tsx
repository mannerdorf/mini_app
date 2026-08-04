import { Panel } from "@maxhub/max-ui";
import type { PermissionPreset } from "../lib/permissions";
import type { AdminUserEditorState } from "../hooks/useAdminUserEditor";
import type { User } from "../types/adminUsers";
import { AdminUserPermissionsAccountPanel } from "./AdminUserPermissionsAccountPanel";
import { AdminUserPermissionsMatrixPanel } from "./AdminUserPermissionsMatrixPanel";
import { AdminUserPermissionsCustomersPanel } from "./AdminUserPermissionsCustomersPanel";
import { AdminUserPermissionsAuditPanel } from "./AdminUserPermissionsAuditPanel";

export type AdminUserPermissionsEditorPanelProps = {
  user: User;
  isSuperAdmin: boolean;
  permissionPresets: PermissionPreset[];
  customerDirectoryMap: Record<string, string>;
  editor: AdminUserEditorState;
};

export function AdminUserPermissionsEditorPanel({
  user,
  isSuperAdmin,
  permissionPresets,
  customerDirectoryMap,
  editor,
}: AdminUserPermissionsEditorPanelProps) {
  return (
    <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)", marginTop: "var(--space-2, 0.5rem)" }}>
      <AdminUserPermissionsAccountPanel user={user} isSuperAdmin={isSuperAdmin} editor={editor} />
      <AdminUserPermissionsMatrixPanel user={user} isSuperAdmin={isSuperAdmin} permissionPresets={permissionPresets} editor={editor} />
      <AdminUserPermissionsCustomersPanel customerDirectoryMap={customerDirectoryMap} editor={editor} />
      <AdminUserPermissionsAuditPanel editor={editor} />
    </Panel>
  );
}

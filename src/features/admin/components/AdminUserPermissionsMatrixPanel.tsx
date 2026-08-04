import { Flex, Typography } from "@maxhub/max-ui";
import {
  PERMISSION_ROW1_SUPERADMIN,
  PERMISSION_ROW2_ORANGE,
  PERMISSION_ROW3_BLUE,
  applyPermissionsToggle,
  applyPresetPermissionsWithSendingsGate,
  isDashboardPermissionDisabled,
  isPermissionLockedByRedReturns,
  permissionsForAdminEditor,
  superadminRowPermissionActiveClass,
  type PermissionPreset,
} from "../lib/permissions";
import type { AdminUserEditorState } from "../hooks/useAdminUserEditor";
import type { User } from "../types/adminUsers";

type Props = {
  user: User;
  isSuperAdmin: boolean;
  permissionPresets: PermissionPreset[];
  editor: AdminUserEditorState;
};

export function AdminUserPermissionsMatrixPanel({ user, isSuperAdmin, permissionPresets, editor }: Props) {
  const {
    editorPermissions,
    setEditorPermissions,
    editorFinancial,
    setEditorFinancial,
    editorAccessAllInns,
    setEditorAccessAllInns,
    editorSelectedPresetId,
    setEditorSelectedPresetId,
    handlePermissionsToggle,
  } = editor;

  return (
    <div className="admin-form-section" style={{ marginBottom: "0.5rem" }}>
      <Flex align="center" gap="0.5rem" style={{ marginBottom: "0.5rem", flexWrap: "wrap" }}>
        <Typography.Body style={{ fontSize: "0.85rem" }}>Пресет:</Typography.Body>
        <select
          className="admin-form-input"
          style={{ padding: "0.35rem 0.5rem", fontSize: "0.85rem" }}
          value={editorSelectedPresetId}
          onChange={(e) => {
            const id = e.target.value;
            setEditorSelectedPresetId(id);
            const preset = permissionPresets.find((p) => p.id === id);
            if (preset) {
              const applied = applyPresetPermissionsWithSendingsGate(
                preset.permissions,
                isSuperAdmin,
                user?.permissions?.doc_sendings === true,
              );
              setEditorPermissions(
                isSuperAdmin
                  ? applied
                  : permissionsForAdminEditor(false, applied, user?.permissions),
              );
              setEditorFinancial(preset.financial);
              setEditorAccessAllInns(
                isSuperAdmin
                  ? preset.serviceMode
                  : Boolean(user?.permissions?.service_mode ?? user?.access_all_inns),
              );
            }
          }}
        >
          <option value="">—</option>
          {permissionPresets.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </Flex>
      <div className="admin-form-section-header">Разделы</div>
      {isSuperAdmin && (
        <div className="admin-permissions-toolbar">
          {PERMISSION_ROW1_SUPERADMIN.map(({ key, label }) => {
            const isActive = key === "service_mode" ? (!!editorPermissions.service_mode || editorAccessAllInns) : !!editorPermissions[key];
            const locked = isPermissionLockedByRedReturns(key, editorPermissions);
            const onClick = () => {
              if (locked) return;
              setEditorSelectedPresetId("");
              if (key === "service_mode") {
                const v = !(!!editorPermissions.service_mode || editorAccessAllInns);
                setEditorPermissions((p) => (v ? applyPermissionsToggle(p, "service_mode") : { ...p, service_mode: false }));
                setEditorAccessAllInns(v);
                return;
              }
              handlePermissionsToggle(key);
            };
            return (
              <button
                key={key}
                type="button"
                className={`permission-button ${superadminRowPermissionActiveClass(key, isActive)}`}
                onClick={onClick}
                disabled={locked}
                title={locked ? "Отключите «Возврат из КГД», чтобы изменить другие разделы" : undefined}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
      <div className="admin-permissions-toolbar" style={{ marginTop: isSuperAdmin ? "0.5rem" : 0 }}>
        {PERMISSION_ROW2_ORANGE.map(({ key, label }) => {
          const isActive = key === "__financial__" ? editorFinancial : !!editorPermissions[key];
          const locked = editorPermissions.red_returns === true;
          const onClick = key === "__financial__"
            ? () => {
                if (locked) return;
                setEditorSelectedPresetId("");
                setEditorFinancial(!editorFinancial);
              }
            : () => handlePermissionsToggle(key);
          return (
            <button
              key={key}
              type="button"
              className={`permission-button ${isActive ? "active active-warning" : ""}`}
              onClick={onClick}
              disabled={locked}
              title={locked ? "Отключите «Возврат из КГД», чтобы изменить другие разделы" : undefined}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div className="admin-permissions-toolbar" style={{ marginTop: "0.5rem" }}>
        {PERMISSION_ROW3_BLUE.map(({ key, label }) => {
          const isActive = !!editorPermissions[key];
          const dis = isDashboardPermissionDisabled(key, editorPermissions)
            || isPermissionLockedByRedReturns(key, editorPermissions);
          return (
            <button
              key={key}
              type="button"
              className={`permission-button ${isActive ? "active" : ""}`}
              onClick={() => { if (!dis) handlePermissionsToggle(key); }}
              disabled={dis}
              title={
                isPermissionLockedByRedReturns(key, editorPermissions)
                  ? "Отключите «Возврат из КГД», чтобы изменить другие разделы"
                  : dis
                    ? "Сначала включите «Аналитика»"
                    : undefined
              }
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

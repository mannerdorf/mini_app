import { Flex } from "@maxhub/max-ui";
import {
  PERMISSION_ROW1_SUPERADMIN,
  PERMISSION_ROW2_ORANGE,
  PERMISSION_ROW3_BLUE,
  applyPresetPermissionsWithSendingsGate,
  isDashboardPermissionDisabled,
  superadminRowPermissionActiveClass,
  type PermissionPreset,
} from "../lib/permissions";
import type { AdminUserRegistrationState } from "../hooks/useAdminUserRegistration";

type Props = {
  isSuperAdmin: boolean;
  permissionPresets: PermissionPreset[];
  registration: AdminUserRegistrationState;
};

export function AdminUserAddPermissionsSection({ isSuperAdmin, permissionPresets, registration }: Props) {
  const {
    formAccessAllInns,
    setFormAccessAllInns,
    formPermissions,
    setFormPermissions,
    formSelectedPresetId,
    setFormSelectedPresetId,
    formFinancial,
    setFormFinancial,
    togglePerm,
    clearCustomerSelection,
  } = registration;

  return (
    <div className="admin-form-section">
      <Flex align="center" gap="var(--element-gap, 0.5rem)" style={{ marginBottom: "var(--space-2, 0.5rem)", flexWrap: "wrap" }}>
        <label htmlFor="form-preset" style={{ fontSize: "0.85rem", color: "var(--color-text-primary)" }}>Пресет:</label>
        <select
          id="form-preset"
          className="admin-form-input"
          style={{ padding: "0.35rem 0.5rem", fontSize: "0.85rem" }}
          value={formSelectedPresetId}
          onChange={(e) => {
            const id = e.target.value;
            setFormSelectedPresetId(id);
            const preset = permissionPresets.find((p) => p.id === id);
            if (preset) {
              setFormPermissions(applyPresetPermissionsWithSendingsGate(preset.permissions, isSuperAdmin, false));
              setFormFinancial(preset.financial);
              setFormAccessAllInns(preset.serviceMode);
              if (preset.serviceMode) clearCustomerSelection();
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
            const isActive = key === "service_mode" ? (!!formPermissions.service_mode || formAccessAllInns) : !!formPermissions[key];
            const onClick = () => {
              setFormSelectedPresetId("");
              if (key === "service_mode") {
                const v = !(!!formPermissions.service_mode || formAccessAllInns);
                setFormPermissions((p) => ({ ...p, service_mode: v }));
                setFormAccessAllInns(v);
                if (v) clearCustomerSelection();
                return;
              }
              togglePerm(key);
            };
            const activeClass = superadminRowPermissionActiveClass(key, isActive);
            return (
              <button type="button" key={key} className={`permission-button ${activeClass}`} onClick={onClick}>{label}</button>
            );
          })}
        </div>
      )}
      <div className="admin-permissions-toolbar" style={{ marginTop: isSuperAdmin ? "0.5rem" : 0 }}>
        {PERMISSION_ROW2_ORANGE.map(({ key, label }) => {
          const isActive = key === "__financial__" ? formFinancial : !!formPermissions[key];
          const onClick = key === "__financial__"
            ? () => { setFormSelectedPresetId(""); setFormFinancial(!formFinancial); }
            : () => togglePerm(key);
          return (
            <button type="button" key={key} className={`permission-button ${isActive ? "active active-warning" : ""}`} onClick={onClick}>{label}</button>
          );
        })}
      </div>
      <div className="admin-permissions-toolbar" style={{ marginTop: "0.5rem" }}>
        {PERMISSION_ROW3_BLUE.map(({ key, label }) => {
          const isActive = !!formPermissions[key];
          const dis = isDashboardPermissionDisabled(key, formPermissions);
          return (
            <button
              type="button"
              key={key}
              className={`permission-button ${isActive ? "active" : ""}`}
              onClick={() => { if (!dis) togglePerm(key); }}
              disabled={dis}
              title={dis ? "Сначала включите «Аналитика»" : undefined}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

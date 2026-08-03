import React from "react";
import { Button, Flex, Input, Typography } from "@maxhub/max-ui";
import { Loader2 } from "lucide-react";
import {
  PERMISSION_ROW1_SUPERADMIN,
  PERMISSION_ROW2_ORANGE,
  PERMISSION_ROW3_BLUE,
  applyPermissionsToggle,
  isDashboardPermissionDisabled,
  superadminRowPermissionActiveClass,
} from "../lib/permissions";
import type { AdminPresetsEditorState } from "../hooks/useAdminPresetsEditor";

type Props = Pick<
  AdminPresetsEditorState,
  | "editingId"
  | "formLabel"
  | "setFormLabel"
  | "formPermissions"
  | "setFormPermissions"
  | "formFinancial"
  | "setFormFinancial"
  | "formServiceMode"
  | "setFormServiceMode"
  | "formError"
  | "formSaving"
  | "resetForm"
  | "savePreset"
> & { isSuperAdmin: boolean };

export function AdminPresetFormPanel({
  isSuperAdmin,
  editingId,
  formLabel,
  setFormLabel,
  formPermissions,
  setFormPermissions,
  formFinancial,
  setFormFinancial,
  formServiceMode,
  setFormServiceMode,
  formError,
  formSaving,
  resetForm,
  savePreset,
}: Props) {
  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem", fontSize: "0.9rem" }}>
        {editingId ? "Редактировать пресет" : "Добавить пресет"}
      </Typography.Body>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--element-gap, 0.75rem)", maxWidth: "28rem" }}>
        <div>
          <label htmlFor="preset-label" style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.25rem", color: "var(--color-text-primary)" }}>Название</label>
          <Input
            id="preset-label"
            className="admin-form-input"
            value={formLabel}
            onChange={(e) => setFormLabel(e.target.value)}
            placeholder="Например: Менеджер"
            style={{ width: "100%" }}
          />
        </div>
        <div className="admin-form-section-header">Разделы</div>
        {isSuperAdmin && (
          <div className="admin-permissions-toolbar">
            {PERMISSION_ROW1_SUPERADMIN.map(({ key, label }) => {
              const isActive = key === "service_mode" ? (!!formPermissions.service_mode || formServiceMode) : !!formPermissions[key];
              const onClick = () => {
                if (key === "service_mode") {
                  const v = !(!!formPermissions.service_mode || formServiceMode);
                  setFormPermissions((p) => ({ ...p, service_mode: v }));
                  setFormServiceMode(v);
                  return;
                }
                setFormPermissions((p) => ({ ...p, [key]: !p[key] }));
              };
              const activeClass = superadminRowPermissionActiveClass(key, isActive);
              return <button key={key} type="button" className={`permission-button ${activeClass}`} onClick={onClick}>{label}</button>;
            })}
          </div>
        )}
        <div className="admin-permissions-toolbar" style={{ marginTop: isSuperAdmin ? "0.25rem" : 0 }}>
          {PERMISSION_ROW2_ORANGE.map(({ key, label }) => {
            const isActive = key === "__financial__" ? formFinancial : !!formPermissions[key];
            const onClick = key === "__financial__"
              ? () => setFormFinancial(!formFinancial)
              : () => setFormPermissions((p) => ({ ...p, [key]: !p[key] }));
            return (
              <button key={key} type="button" className={`permission-button ${isActive ? "active active-warning" : ""}`} onClick={onClick}>{label}</button>
            );
          })}
        </div>
        <div className="admin-permissions-toolbar" style={{ marginTop: "0.25rem" }}>
          {PERMISSION_ROW3_BLUE.map(({ key, label }) => {
            const dis = isDashboardPermissionDisabled(key, formPermissions);
            return (
              <button
                key={key}
                type="button"
                className={`permission-button ${!!formPermissions[key] ? "active" : ""}`}
                onClick={() => {
                  if (dis) return;
                  setFormPermissions((p) => applyPermissionsToggle(p, key));
                }}
                disabled={dis}
                title={dis ? "Сначала включите «Аналитика»" : undefined}
              >
                {label}
              </button>
            );
          })}
        </div>
        {formError && <Typography.Body style={{ color: "var(--color-error)", fontSize: "0.85rem", marginTop: "0.25rem" }}>{formError}</Typography.Body>}
        <Flex gap="0.5rem" align="center" style={{ marginTop: "0.5rem" }}>
          <Button
            type="button"
            className="button-primary"
            disabled={formSaving || !formLabel.trim()}
            onClick={() => void savePreset()}
          >
            {formSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {formSaving ? " Сохранение…" : editingId ? "Сохранить" : "Добавить"}
          </Button>
          {editingId && (
            <Button className="filter-button" onClick={resetForm}>
              Отмена
            </Button>
          )}
        </Flex>
      </div>
    </div>
  );
}

import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { Loader2 } from "lucide-react";
import {
  PERMISSION_ROW1_SUPERADMIN,
  PERMISSION_ROW2_ORANGE,
  PERMISSION_ROW3_BLUE,
  applyPermissionsToggle,
  applyPresetPermissionsWithSendingsGate,
  isDashboardPermissionDisabled,
  superadminRowPermissionActiveClass,
  type PermissionPreset,
} from "../lib/permissions";
import type { Dispatch, RefObject, SetStateAction } from "react";

export type AdminUsersBulkPermissionsPanelProps = {
  selectedUserIds: number[];
  isSuperAdmin: boolean;
  permissionPresets: PermissionPreset[];
  bulkPermissions: Record<string, boolean>;
  setBulkPermissions: Dispatch<SetStateAction<Record<string, boolean>>>;
  bulkFinancial: boolean;
  setBulkFinancial: Dispatch<SetStateAction<boolean>>;
  bulkAccessAllInns: boolean;
  setBulkAccessAllInns: Dispatch<SetStateAction<boolean>>;
  bulkSelectedPresetId: string;
  setBulkSelectedPresetId: Dispatch<SetStateAction<string>>;
  bulkError: string | null;
  bulkLoading: boolean;
  bulkDeactivateConfirmOpen: boolean;
  setBulkDeactivateConfirmOpen: Dispatch<SetStateAction<boolean>>;
  bulkDeactivateModalRef: RefObject<HTMLDivElement | null>;
  handleBulkApplyPermissions: () => void | Promise<void>;
  handleBulkDeactivate: () => void | Promise<void>;
  clearSelection: () => void;
};

export function AdminUsersBulkPermissionsPanel({
  selectedUserIds,
  isSuperAdmin,
  permissionPresets,
  bulkPermissions,
  setBulkPermissions,
  bulkFinancial,
  setBulkFinancial,
  bulkAccessAllInns,
  setBulkAccessAllInns,
  bulkSelectedPresetId,
  setBulkSelectedPresetId,
  bulkError,
  bulkLoading,
  bulkDeactivateConfirmOpen,
  setBulkDeactivateConfirmOpen,
  bulkDeactivateModalRef,
  handleBulkApplyPermissions,
  handleBulkDeactivate,
  clearSelection,
}: AdminUsersBulkPermissionsPanelProps) {
  const presets = permissionPresets ?? [];
  if (selectedUserIds.length === 0) return null;
  return (
                <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)", marginBottom: "var(--element-gap, 1rem)" }}>
                  <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Групповое изменение прав ({selectedUserIds.length})</Typography.Body>
                  <Flex align="center" gap="0.5rem" style={{ marginBottom: "0.5rem", flexWrap: "wrap" }}>
                    <Typography.Body style={{ fontSize: "0.85rem" }}>Пресет:</Typography.Body>
                    <select
                      className="admin-form-input"
                      style={{ padding: "0.35rem 0.5rem", fontSize: "0.85rem" }}
                      value={bulkSelectedPresetId}
                      onChange={(e) => {
                        const id = e.target.value;
                        setBulkSelectedPresetId(id);
                        const preset = presets.find((p) => p.id === id);
                        if (preset) {
                          setBulkPermissions(applyPresetPermissionsWithSendingsGate(preset.permissions, isSuperAdmin, false));
                          setBulkFinancial(preset.financial);
                          setBulkAccessAllInns(preset.serviceMode);
                        }
                      }}
                    >
                      <option value="">—</option>
                      {presets.map((p) => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                    </select>
                  </Flex>
                  <div className="admin-form-section-header" style={{ marginBottom: "0.35rem" }}>Разделы</div>
                  {isSuperAdmin && (
                    <div className="admin-permissions-toolbar">
                      {PERMISSION_ROW1_SUPERADMIN.map(({ key, label }) => {
                        const isActive = key === "service_mode" ? (!!bulkPermissions.service_mode || bulkAccessAllInns) : !!bulkPermissions[key];
                        const onClick = () => {
                          setBulkSelectedPresetId("");
                          if (key === "service_mode") {
                            const v = !(!!bulkPermissions.service_mode || bulkAccessAllInns);
                            setBulkPermissions((p) => ({ ...p, service_mode: v }));
                            setBulkAccessAllInns(v);
                            return;
                          }
                          setBulkPermissions((p) => ({ ...p, [key]: !p[key] }));
                        };
                        const activeClass = superadminRowPermissionActiveClass(key, isActive);
                        return <button key={key} type="button" className={`permission-button ${activeClass}`} onClick={onClick}>{label}</button>;
                      })}
                    </div>
                  )}
                  <div className="admin-permissions-toolbar" style={{ marginTop: isSuperAdmin ? "0.5rem" : 0 }}>
                    {PERMISSION_ROW2_ORANGE.map(({ key, label }) => {
                      const isActive = key === "__financial__" ? bulkFinancial : !!bulkPermissions[key];
                      const onClick = key === "__financial__"
                        ? () => { setBulkSelectedPresetId(""); setBulkFinancial(!bulkFinancial); }
                        : () => { setBulkSelectedPresetId(""); setBulkPermissions((p) => ({ ...p, [key]: !p[key] })); };
                      return (
                        <button key={key} type="button" className={`permission-button ${isActive ? "active active-warning" : ""}`} onClick={onClick}>{label}</button>
                      );
                    })}
                  </div>
                  <div className="admin-permissions-toolbar" style={{ marginTop: "0.5rem" }}>
                    {PERMISSION_ROW3_BLUE.map(({ key, label }) => {
                      const dis = isDashboardPermissionDisabled(key, bulkPermissions);
                      return (
                        <button
                          key={key}
                          type="button"
                          className={`permission-button ${!!bulkPermissions[key] ? "active" : ""}`}
                          onClick={() => {
                            if (dis) return;
                            setBulkSelectedPresetId("");
                            setBulkPermissions((p) => applyPermissionsToggle(p, key));
                          }}
                          disabled={dis}
                          title={dis ? "Сначала включите «Аналитика»" : undefined}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  {bulkError && <Typography.Body style={{ color: "var(--color-error)", fontSize: "0.85rem", marginTop: "0.5rem" }}>{bulkError}</Typography.Body>}
                  <Flex gap="0.5rem" align="center" wrap="wrap" style={{ marginTop: "0.75rem" }}>
                    <Button className="button-primary" disabled={bulkLoading} onClick={handleBulkApplyPermissions}>
                      {bulkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      {bulkLoading ? " Применяем…" : "Применить к выбранным"}
                    </Button>
                    <Button
                      type="button"
                      className="filter-button"
                      disabled={bulkLoading}
                      onClick={() => setBulkDeactivateConfirmOpen(true)}
                      style={{ color: "var(--color-error, #dc2626)" }}
                    >
                      Деактивировать выбранных
                    </Button>
                    <Button className="filter-button" onClick={clearSelection}>Снять выделение</Button>
                  </Flex>
                  {bulkDeactivateConfirmOpen && (
                    <div className="modal-overlay" style={{ zIndex: 10000 }} onClick={() => !bulkLoading && setBulkDeactivateConfirmOpen(false)} role="dialog" aria-modal="true" aria-labelledby="bulk-deactivate-title">
                      <div ref={bulkDeactivateModalRef} className="modal-content" style={{ maxWidth: "22rem" }} onClick={(e) => e.stopPropagation()}>
                        <Typography.Body id="bulk-deactivate-title" style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Деактивировать выбранных?</Typography.Body>
                        <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
                          Пользователи ({selectedUserIds.length}) не смогут входить в приложение. Права и заказчики сохранятся; повторная активация возможна через редактирование.
                        </Typography.Body>
                        <Flex gap="0.5rem" wrap="wrap">
                          <Button
                            type="button"
                            disabled={bulkLoading}
                            onClick={handleBulkDeactivate}
                            style={{ background: "var(--color-error, #dc2626)", color: "#fff", border: "none" }}
                            aria-label="Деактивировать выбранных пользователей"
                          >
                            {bulkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Деактивировать"}
                          </Button>
                          <Button type="button" className="filter-button" disabled={bulkLoading} onClick={() => setBulkDeactivateConfirmOpen(false)} aria-label="Отмена">
                            Отмена
                          </Button>
                        </Flex>
                      </div>
                    </div>
                  )}
                </Panel>
  );
}

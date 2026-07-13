import React, { useRef, useState } from "react";
import { Button, Flex, Panel, Typography, Input } from "@maxhub/max-ui";
import { Loader2 } from "lucide-react";
import { useFocusTrap } from "../../../hooks/useFocusTrap";
import { deleteAdminPreset, saveAdminPreset } from "../../../api/client/admin/presets";
import {
  PERMISSION_ROW1_SUPERADMIN,
  PERMISSION_ROW2_ORANGE,
  PERMISSION_ROW3_BLUE,
  applyPermissionsToggle,
  createDefaultPermissions,
  isDashboardPermissionDisabled,
  normalizeAnalyticsDashboardPermissions,
  superadminRowPermissionActiveClass,
  type PermissionPreset,
} from "../lib/permissions";

type AdminPresetsTabProps = {
  adminToken: string;
  isSuperAdmin: boolean;
  permissionPresets: PermissionPreset[];
  fetchPresets: () => void;
  presetsLoading: boolean;
};

export function AdminPresetsTab({
  adminToken,
  isSuperAdmin,
  permissionPresets,
  fetchPresets,
  presetsLoading,
}: AdminPresetsTabProps) {
  const [presetEditingId, setPresetEditingId] = useState<string | null>(null);
  const [presetFormLabel, setPresetFormLabel] = useState("");
  const [presetFormPermissions, setPresetFormPermissions] = useState<Record<string, boolean>>(() => createDefaultPermissions());
  const [presetFormFinancial, setPresetFormFinancial] = useState(false);
  const [presetFormServiceMode, setPresetFormServiceMode] = useState(false);
  const [presetFormError, setPresetFormError] = useState<string | null>(null);
  const [presetFormSaving, setPresetFormSaving] = useState(false);
  const [presetDeleteConfirmId, setPresetDeleteConfirmId] = useState<string | null>(null);
  const [presetDeleteLoading, setPresetDeleteLoading] = useState(false);
  const presetDeleteModalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(presetDeleteModalRef, presetDeleteConfirmId != null, () => !presetDeleteLoading && setPresetDeleteConfirmId(null));

  return (
        <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
          <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Пресеты ролей</Typography.Body>
          <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
            Настройте наборы прав для быстрой подстановки при выдаче прав пользователям и при групповом изменении.
          </Typography.Body>
          {presetsLoading ? (
            <Flex align="center" gap="0.5rem">
              <Loader2 className="w-4 h-4 animate-spin" />
              <Typography.Body>Загрузка...</Typography.Body>
            </Flex>
          ) : (
            <>
              <div style={{ marginBottom: "1.5rem" }}>
                <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem", fontSize: "0.9rem" }}>
                  {presetEditingId ? "Редактировать пресет" : "Добавить пресет"}
                </Typography.Body>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--element-gap, 0.75rem)", maxWidth: "28rem" }}>
                  <div>
                    <label htmlFor="preset-label" style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.25rem", color: "var(--color-text-primary)" }}>Название</label>
                    <Input
                      id="preset-label"
                      className="admin-form-input"
                      value={presetFormLabel}
                      onChange={(e) => setPresetFormLabel(e.target.value)}
                      placeholder="Например: Менеджер"
                      style={{ width: "100%" }}
                    />
                  </div>
                  <div className="admin-form-section-header">Разделы</div>
                  {isSuperAdmin && (
                    <div className="admin-permissions-toolbar">
                      {PERMISSION_ROW1_SUPERADMIN.map(({ key, label }) => {
                        const isActive = key === "service_mode" ? (!!presetFormPermissions.service_mode || presetFormServiceMode) : !!presetFormPermissions[key];
                        const onClick = () => {
                          if (key === "service_mode") {
                            const v = !(!!presetFormPermissions.service_mode || presetFormServiceMode);
                            setPresetFormPermissions((p) => ({ ...p, service_mode: v }));
                            setPresetFormServiceMode(v);
                            return;
                          }
                          setPresetFormPermissions((p) => ({ ...p, [key]: !p[key] }));
                        };
                        const activeClass = superadminRowPermissionActiveClass(key, isActive);
                        return <button key={key} type="button" className={`permission-button ${activeClass}`} onClick={onClick}>{label}</button>;
                      })}
                    </div>
                  )}
                  <div className="admin-permissions-toolbar" style={{ marginTop: isSuperAdmin ? "0.25rem" : 0 }}>
                    {PERMISSION_ROW2_ORANGE.map(({ key, label }) => {
                      const isActive = key === "__financial__" ? presetFormFinancial : !!presetFormPermissions[key];
                      const onClick = key === "__financial__"
                        ? () => setPresetFormFinancial(!presetFormFinancial)
                        : () => setPresetFormPermissions((p) => ({ ...p, [key]: !p[key] }));
                      return (
                        <button key={key} type="button" className={`permission-button ${isActive ? "active active-warning" : ""}`} onClick={onClick}>{label}</button>
                      );
                    })}
                  </div>
                  <div className="admin-permissions-toolbar" style={{ marginTop: "0.25rem" }}>
                    {PERMISSION_ROW3_BLUE.map(({ key, label }) => {
                      const dis = isDashboardPermissionDisabled(key, presetFormPermissions);
                      return (
                        <button
                          key={key}
                          type="button"
                          className={`permission-button ${!!presetFormPermissions[key] ? "active" : ""}`}
                          onClick={() => {
                            if (dis) return;
                            setPresetFormPermissions((p) => applyPermissionsToggle(p, key));
                          }}
                          disabled={dis}
                          title={dis ? "Сначала включите «Аналитика»" : undefined}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  {presetFormError && <Typography.Body style={{ color: "var(--color-error)", fontSize: "0.85rem", marginTop: "0.25rem" }}>{presetFormError}</Typography.Body>}
                  <Flex gap="0.5rem" align="center" style={{ marginTop: "0.5rem" }}>
                    <Button
                      type="button"
                      className="button-primary"
                      disabled={presetFormSaving || !presetFormLabel.trim()}
                      onClick={async () => {
                        setPresetFormError(null);
                        setPresetFormSaving(true);
                        try {
                          await saveAdminPreset(adminToken, {
                            ...(presetEditingId ? { id: presetEditingId } : {}),
                            label: presetFormLabel.trim(),
                            permissions: normalizeAnalyticsDashboardPermissions(presetFormPermissions),
                            financial: presetFormFinancial,
                            serviceMode: presetFormServiceMode,
                          });
                          setPresetFormLabel("");
                          setPresetFormPermissions(
                            normalizeAnalyticsDashboardPermissions({
                              cms_access: false,
                              home: true,
                              dashboard: true,
                              cargo: true,
                              doc_invoices: true,
                              doc_acts: true,
                              doc_orders: true,
                              doc_sendings: false,
                              doc_claims: true,
                              doc_contracts: true,
                              doc_acts_settlement: true,
                              doc_tariffs: true,
                              haulz: false,
                              service_mode: false,
                              analytics: false,
                              supervisor: false,
                              eor: false,
                              wb: false,
                              wb_admin: false,
                            })
                          );
                          setPresetFormFinancial(false);
                          setPresetFormServiceMode(false);
                          setPresetEditingId(null);
                          fetchPresets();
                        } catch (e: unknown) {
                          setPresetFormError((e as Error)?.message || "Ошибка");
                        } finally {
                          setPresetFormSaving(false);
                        }
                      }}
                    >
                      {presetFormSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      {presetFormSaving ? " Сохранение…" : presetEditingId ? "Сохранить" : "Добавить"}
                    </Button>
                    {presetEditingId && (
                      <Button className="filter-button" onClick={() => { setPresetEditingId(null); setPresetFormLabel(""); setPresetFormError(null); }}>
                        Отмена
                      </Button>
                    )}
                  </Flex>
                </div>
              </div>
              <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem", fontSize: "0.9rem" }}>Список пресетов</Typography.Body>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {permissionPresets.length === 0 ? (
                  <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Нет пресетов. Добавьте первый выше.</Typography.Body>
                ) : (
                  permissionPresets.map((p) => (
                    <div
                      key={p.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "0.75rem",
                        border: "1px solid var(--color-border)",
                        borderRadius: 8,
                        background: "var(--color-bg-hover)",
                      }}
                    >
                      <Typography.Body style={{ fontWeight: 600 }}>{p.label}</Typography.Body>
                      <Flex gap="0.5rem">
                        <Button
                          type="button"
                          className="filter-button"
                          style={{ padding: "0.35rem 0.6rem" }}
                          onClick={() => {
                            setPresetEditingId(p.id);
                            setPresetFormLabel(p.label);
                            setPresetFormPermissions(normalizeAnalyticsDashboardPermissions({ ...p.permissions }));
                            setPresetFormFinancial(p.financial);
                            setPresetFormServiceMode(p.serviceMode);
                            setPresetFormError(null);
                          }}
                        >
                          Изменить
                        </Button>
                        <Button
                          type="button"
                          className="filter-button"
                          style={{ padding: "0.35rem 0.6rem", color: "var(--color-error)" }}
                          onClick={() => setPresetDeleteConfirmId(p.id)}
                        >
                          Удалить
                        </Button>
                      </Flex>
                    </div>
                  ))
                )}
              </div>
              {presetDeleteConfirmId && (
                <div className="modal-overlay" style={{ zIndex: 10000 }} onClick={() => !presetDeleteLoading && setPresetDeleteConfirmId(null)} role="dialog" aria-modal="true" aria-labelledby="preset-delete-title">
                  <div
                    ref={presetDeleteModalRef}
                    className="modal-content"
                    style={{ maxWidth: "20rem", padding: "1.25rem" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Typography.Body id="preset-delete-title" style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Удалить пресет?</Typography.Body>
                    <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
                      Пресет «{permissionPresets.find((x) => x.id === presetDeleteConfirmId)?.label ?? presetDeleteConfirmId}» будет удалён. Это не изменит права уже выданные пользователям.
                    </Typography.Body>
                    <Flex gap="0.5rem" wrap="wrap">
                      <button
                        type="button"
                        disabled={presetDeleteLoading}
                        aria-label="Удалить пресет"
                        style={{
                          padding: "0.5rem 1rem",
                          borderRadius: "0.5rem",
                          border: "none",
                          cursor: presetDeleteLoading ? "not-allowed" : "pointer",
                          fontSize: "0.9rem",
                          fontWeight: 500,
                          background: "var(--color-error, #dc2626)",
                          color: "#fff",
                          opacity: presetDeleteLoading ? 0.8 : 1,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.35rem",
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          if (presetDeleteLoading) return;
                          setPresetFormError(null);
                          setPresetDeleteLoading(true);
                          const idToDelete = presetDeleteConfirmId;
                          if (!idToDelete) {
                            setPresetDeleteLoading(false);
                            return;
                          }
                          void deleteAdminPreset(adminToken, idToDelete)
                            .then(() => {
                              setPresetDeleteConfirmId(null);
                              fetchPresets();
                            })
                            .catch((e: unknown) => {
                              setPresetFormError((e as Error)?.message || "Не удалось удалить пресет");
                            })
                            .finally(() => setPresetDeleteLoading(false));
                        }}
                      >
                        {presetDeleteLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ flexShrink: 0 }} /> : null}
                        Удалить
                      </button>
                      <Button
                        type="button"
                        className="filter-button"
                        disabled={presetDeleteLoading}
                        onClick={(e) => { e.stopPropagation(); setPresetDeleteConfirmId(null); }}
                        aria-label="Отмена, не удалять пресет"
                      >
                        Отмена
                      </Button>
                    </Flex>
                  </div>
                </div>
              )}
            </>
          )}
        </Panel>

  );
}

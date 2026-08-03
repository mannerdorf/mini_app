import { Button, Flex, Panel, Typography, Input } from "@maxhub/max-ui";
import { Eye, EyeOff, Loader2, Trash2 } from "lucide-react";
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
  const {
    formAccessAllInns,
    setFormAccessAllInns,
    selectedCustomers,
    formEmail,
    setFormEmail,
    formPermissions,
    setFormPermissions,
    formSelectedPresetId,
    setFormSelectedPresetId,
    formFinancial,
    setFormFinancial,
    formSendEmail,
    setFormSendEmail,
    formPassword,
    setFormPassword,
    formPasswordVisible,
    setFormPasswordVisible,
    formSubmitting,
    formResult,
    setCustomerPickModalOpen,
    formEmailError,
    togglePerm,
    clearCustomerSelection,
    removeSelectedCustomer,
    handleAddUser,
  } = registration;

  return (
<Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)", marginBottom: "var(--element-gap, 1rem)" }}>
          <Flex align="center" justify="space-between" style={{ marginBottom: "1rem" }}>
            <Typography.Body style={{ fontWeight: 600 }}>Регистрация пользователя</Typography.Body>
            <Button type="button" className="filter-button" onClick={onClose} aria-label="Закрыть форму регистрации">
              Отмена
            </Button>
          </Flex>
          <form onSubmit={handleAddUser}>
            <div style={{ marginBottom: "1rem" }}>
              <Typography.Body style={{ marginBottom: "0.25rem", fontSize: "0.85rem" }}>Заказчик</Typography.Body>
              {(formAccessAllInns || formPermissions.service_mode) ? (
                <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>Служебный режим — выбор заказчика не требуется</Typography.Body>
              ) : (
                <>
                  <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setCustomerPickModalOpen(true)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setCustomerPickModalOpen(true); } }}
                      style={{
                        flex: 1,
                        minHeight: 160,
                        maxHeight: 260,
                        padding: "0.75rem",
                        background: "var(--color-bg-input)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 8,
                        overflowY: "auto",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.5rem",
                        cursor: "pointer",
                      }}
                      aria-label="Выбрать заказчика"
                    >
                      {selectedCustomers.length === 0 ? (
                        <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Не выбран</Typography.Body>
                      ) : (
                        selectedCustomers.map((cust) => (
                          <div
                            key={cust.inn}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              padding: "0.35rem 0.5rem",
                              borderRadius: 6,
                              background: "var(--color-bg-hover)",
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <Typography.Body style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                                {(customerDirectoryMap[cust.inn] || cust.customer_name || cust.inn)}
                                {(customerDirectoryMap[cust.inn] || cust.customer_name) ? ` · ${cust.inn}` : ""}
                              </Typography.Body>
                              {cust.email && (
                                <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>
                                  {cust.email}
                                </Typography.Body>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); removeSelectedCustomer(cust.inn); }}
                              style={{
                                border: "none",
                                background: "transparent",
                                cursor: "pointer",
                                color: "var(--color-text-secondary)",
                              }}
                              aria-label="Удалить заказчика"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      <Button
                        className="filter-button"
                        type="button"
                        onClick={() => setCustomerPickModalOpen(true)}
                      >
                        Подбор
                      </Button>
                      {selectedCustomers.length > 0 && (
                        <Button
                          className="filter-button"
                          type="button"
                          onClick={clearCustomerSelection}
                          style={{ padding: "0.4rem 0.75rem", fontSize: "0.8rem" }}
                        >
                          Очистить
                        </Button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
            <div style={{ marginBottom: "var(--element-gap, 1rem)" }}>
              <label htmlFor="form-email" style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.85rem", color: "var(--color-text-primary)" }}>Email</label>
              <Input id="form-email" className="admin-form-input" type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="user@example.com" required style={{ width: "100%" }} />
              {formEmailError && (
                <Typography.Body style={{ color: "var(--color-error)", fontSize: "0.78rem", marginTop: "0.25rem" }}>
                  {formEmailError}
                </Typography.Body>
              )}
            </div>
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
            <div style={{ marginBottom: "1rem" }}>
              <Flex align="center">
                <input
                  type="checkbox"
                  checked={formSendEmail}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setFormSendEmail(checked);
                    if (checked) setFormPassword("");
                  }}
                  id="sendEmail"
                />
                <label htmlFor="sendEmail" style={{ marginLeft: "0.5rem", fontSize: "0.9rem" }}>Отправить пароль на email</label>
              </Flex>
            </div>
            {!formSendEmail && (
              <div style={{ marginBottom: "var(--element-gap, 1rem)" }}>
                <label htmlFor="form-password" style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.85rem", color: "var(--color-text-primary)" }}>Пароль</label>
                <div className="password-input-container" style={{ position: "relative" }}>
                  <Input
                    id="form-password"
                    className="admin-form-input password"
                    type={formPasswordVisible ? "text" : "password"}
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder="Минимум 8 символов, буквы и цифры"
                    style={{ width: "100%" }}
                    minLength={8}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="toggle-password-visibility"
                    onClick={() => setFormPasswordVisible((prev) => !prev)}
                    aria-label={formPasswordVisible ? "Скрыть пароль" : "Показать пароль"}
                  >
                    {formPasswordVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginTop: "0.25rem" }}>
                  Минимум 8 символов, обязательно буквы и цифры. Простые пароли (123, password и т.п.) запрещены.
                </Typography.Body>
              </div>
            )}
            {formResult?.password && (
              <Typography.Body style={{ marginBottom: "1rem", color: "var(--color-success-status)", fontSize: "0.9rem" }}>
                Пароль: {formResult.password}
                {formResult.emailSent ? " (отправлен на email)" : " — сохраните, email не отправлен"}
              </Typography.Body>
            )}
            <Button type="submit" className="filter-button" disabled={formSubmitting || !!formEmailError}>
              {formSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Зарегистрировать"}
            </Button>
          </form>
        </Panel>
  );
}

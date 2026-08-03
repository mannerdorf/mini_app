import { Button, Flex, Panel, Typography, Input } from "@maxhub/max-ui";
import { Copy, Loader2, Trash2 } from "lucide-react";
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
  const {
    editorPermissions,
    setEditorPermissions,
    editorFinancial,
    setEditorFinancial,
    editorAccessAllInns,
    setEditorAccessAllInns,
    editorLoading,
    editorError,
    resetPasswordInfo,
    editorSendPasswordToEmail,
    setEditorSendPasswordToEmail,
    editorCustomers,
    setEditorCustomers,
    setEditorCustomerPickOpen,
    editorSelectedPresetId,
    setEditorSelectedPresetId,
    editorChangeLoginValue,
    setEditorChangeLoginValue,
    editorChangeLoginOpen,
    setEditorChangeLoginOpen,
    editorChangeLoginLoading,
    deleteProfileConfirmOpen,
    setDeleteProfileConfirmOpen,
    deleteProfileLoading,
    userChangeEntries,
    userChangeLoading,
    userChangeQuery,
    setUserChangeQuery,
    editorDiffItems,
    closePermissionsEditor,
    handlePermissionsToggle,
    handleSaveUserPermissions,
    handleResetPassword,
    saveEditorLogin,
    archiveSelectedUser,
  } = editor;

  return (
                <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)", marginTop: "var(--space-2, 0.5rem)" }}>
                  <Flex justify="space-between" align="center" style={{ marginBottom: "0.5rem", gap: "0.5rem" }}>
                    <Typography.Body style={{ fontWeight: 600 }}>{user.login ?? "—"}</Typography.Body>
                    <Button className="filter-button" style={{ padding: "0.25rem 0.75rem" }} onClick={closePermissionsEditor}>
                      Закрыть
                    </Button>
                  </Flex>
                  <Flex align="center" style={{ marginBottom: "0.75rem", gap: "0.5rem" }}>
                    <input
                      type="checkbox"
                      id="editorSendPasswordToEmail"
                      checked={editorSendPasswordToEmail}
                      onChange={(e) => setEditorSendPasswordToEmail(e.target.checked)}
                    />
                    <label htmlFor="editorSendPasswordToEmail" style={{ fontSize: "0.9rem" }}>Новый пароль отправить на почту</label>
                  </Flex>
                  <Flex gap="0.5rem" align="center" style={{ marginBottom: "0.75rem", flexWrap: "wrap" }}>
                    <Button className="filter-button" style={{ padding: "0.25rem 0.75rem" }} onClick={handleResetPassword}>
                      Сбросить пароль
                    </Button>
                    <Button
                      type="button"
                      className="filter-button"
                      style={{ padding: "0.25rem 0.75rem" }}
                      onClick={() => {
                        setEditorChangeLoginOpen(true);
                        setEditorChangeLoginValue(user?.login ?? "");
                      }}
                    >
                      Изменить логин
                    </Button>
                    {isSuperAdmin && (
                      <Button
                        type="button"
                        className="filter-button"
                        style={{ padding: "0.25rem 0.75rem", color: "var(--color-error)" }}
                        onClick={() => setDeleteProfileConfirmOpen(true)}
                      >
                        В архив
                      </Button>
                    )}
                  </Flex>
                  {editorChangeLoginOpen && (
                    <div style={{ marginBottom: "0.75rem" }}>
                      <label htmlFor="editor-new-login" style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.25rem" }}>Новый логин (email)</label>
                      <Flex gap="0.5rem" align="center" wrap="wrap">
                        <Input
                          id="editor-new-login"
                          className="admin-form-input"
                          type="email"
                          value={editorChangeLoginValue}
                          onChange={(e) => setEditorChangeLoginValue(e.target.value)}
                          placeholder="email@example.com"
                          style={{ flex: 1, minWidth: "12rem" }}
                        />
                        <Button
                          type="button"
                          className="filter-button"
                          disabled={editorChangeLoginLoading || !editorChangeLoginValue.trim()}
                          onClick={() => void saveEditorLogin()}
                        >
                          {editorChangeLoginLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Сохранить логин"}
                        </Button>
                        <Button type="button" className="filter-button" onClick={() => setEditorChangeLoginOpen(false)}>
                          Отмена
                        </Button>
                      </Flex>
                    </div>
                  )}
                  {deleteProfileConfirmOpen && user && (
                    <div className="modal-overlay" style={{ zIndex: 10000 }} onClick={() => !deleteProfileLoading && setDeleteProfileConfirmOpen(false)} role="dialog" aria-modal="true" aria-labelledby="delete-profile-title">
                      <div className="modal-content" style={{ maxWidth: "22rem", padding: "1.25rem" }} onClick={(e) => e.stopPropagation()}>
                        <Typography.Body id="delete-profile-title" style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Архивировать профиль?</Typography.Body>
                        <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
                          Пользователь {user.login} будет деактивирован и перемещён в архив. Профиль можно восстановить повторной активацией.
                        </Typography.Body>
                        <Flex gap="0.5rem" wrap="wrap">
                          <Button
                            type="button"
                            className="filter-button"
                            disabled={deleteProfileLoading}
                            style={{ color: "var(--color-error)" }}
                            onClick={() => void archiveSelectedUser()}
                          >
                            {deleteProfileLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Архивировать"}
                          </Button>
                          <Button type="button" className="filter-button" disabled={deleteProfileLoading} onClick={() => setDeleteProfileConfirmOpen(false)}>
                            Отмена
                          </Button>
                        </Flex>
                      </div>
                    </div>
                  )}
                  {resetPasswordInfo && (
                    <div style={{ fontSize: "0.85rem", marginBottom: "0.5rem", color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                      {resetPasswordInfo.emailSent ? (
                        "Пароль отправлен на email."
                      ) : resetPasswordInfo.password ? (
                        <>
                          Новый временный пароль: <strong style={{ color: "var(--color-text-primary)", fontWeight: 700 }}>{resetPasswordInfo.password}</strong> Передайте его пользователю.
                          <button
                            type="button"
                            onClick={() => navigator.clipboard?.writeText(resetPasswordInfo.password || "")}
                            className="filter-button"
                            style={{ padding: "0.25rem 0.5rem", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                            title="Копировать пароль"
                            aria-label="Копировать пароль"
                          >
                            <Copy size={16} />
                            Копировать
                          </button>
                        </>
                      ) : (
                        "Пароль не отправлен."
                      )}
                      {resetPasswordInfo.emailError && ` Ошибка отправки: ${resetPasswordInfo.emailError}`}
                    </div>
                  )}
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
                              user?.permissions?.doc_sendings === true
                            );
                            setEditorPermissions(
                              isSuperAdmin
                                ? applied
                                : permissionsForAdminEditor(false, applied, user?.permissions)
                            );
                            setEditorFinancial(preset.financial);
                            setEditorAccessAllInns(
                              isSuperAdmin
                                ? preset.serviceMode
                                : Boolean(user?.permissions?.service_mode ?? user?.access_all_inns)
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
                          const activeClass = superadminRowPermissionActiveClass(key, isActive);
                          return (
                            <button
                              key={key}
                              type="button"
                              className={`permission-button ${activeClass}`}
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
                  {!(editorPermissions.service_mode || editorAccessAllInns) && (
                    <div style={{ marginBottom: "1rem" }}>
                      <Typography.Body style={{ marginBottom: "0.25rem", fontSize: "0.85rem" }}>Заказчик</Typography.Body>
                      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-start" }}>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setEditorCustomerPickOpen(true)}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEditorCustomerPickOpen(true); } }}
                          style={{
                            flex: 1,
                            minHeight: 80,
                            maxHeight: 160,
                            padding: "0.5rem 0.75rem",
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
                          {editorCustomers.length === 0 ? (
                            <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Не выбран</Typography.Body>
                          ) : (
                            editorCustomers.map((cust) => (
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
                                <Typography.Body style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                                  {(customerDirectoryMap[cust.inn] || cust.customer_name || cust.inn)}
                                  {customerDirectoryMap[cust.inn] || cust.customer_name ? ` · ${cust.inn}` : ""}
                                </Typography.Body>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setEditorCustomers((prev) => prev.filter((c) => c.inn !== cust.inn)); }}
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
                          <Button type="button" className="filter-button" onClick={() => setEditorCustomerPickOpen(true)}>
                            Подбор
                          </Button>
                          {editorCustomers.length > 0 && (
                            <Button
                              type="button"
                              className="filter-button"
                              style={{ padding: "0.4rem 0.75rem", fontSize: "0.8rem" }}
                              onClick={() => setEditorCustomers([])}
                            >
                              Очистить
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  <div style={{ marginBottom: "0.75rem" }}>
                    <Typography.Body style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                      Дифф перед сохранением
                    </Typography.Body>
                    {editorDiffItems.length === 0 ? (
                      <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                        Изменений нет
                      </Typography.Body>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                        {editorDiffItems.map((line, idx) => (
                          <Typography.Body key={`diff-${idx}`} style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                            • {line}
                          </Typography.Body>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ marginBottom: "0.75rem" }}>
                    <Typography.Body style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                      Журнал изменений пользователя
                    </Typography.Body>
                    <Input
                      type="text"
                      className="admin-form-input"
                      value={userChangeQuery}
                      onChange={(e) => setUserChangeQuery(e.target.value)}
                      placeholder="Фильтр по логину"
                      style={{ width: "100%", marginBottom: "0.4rem" }}
                    />
                    {userChangeLoading ? (
                      <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>Загрузка…</Typography.Body>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", maxHeight: 140, overflowY: "auto" }}>
                        {userChangeEntries
                          .filter((e) => {
                            const q = userChangeQuery.trim().toLowerCase();
                            if (!q) return true;
                            const login = String((e.details as Record<string, unknown> | null)?.login || "").toLowerCase();
                            return login.includes(q);
                          })
                          .map((e) => (
                            <Typography.Body key={`change-${e.id}`} style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>
                              {new Date(e.created_at).toLocaleString("ru-RU")} · {e.action}
                            </Typography.Body>
                          ))}
                        {userChangeEntries.length === 0 && (
                          <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>
                            Пока нет записей
                          </Typography.Body>
                        )}
                      </div>
                    )}
                  </div>
                  {editorError && (
                    <Typography.Body style={{ color: "var(--color-error)", fontSize: "0.85rem", marginBottom: "0.75rem" }}>
                      {editorError}
                    </Typography.Body>
                  )}
                  <Flex gap="0.5rem" align="center">
                    <Button className="button-primary" disabled={editorLoading} onClick={handleSaveUserPermissions}>
                      {editorLoading ? <Loader2 className="animate-spin w-4 h-4" /> : "Сохранить"}
                    </Button>
                    <Button type="button" className="filter-button" onClick={closePermissionsEditor} style={{ padding: "0.5rem 0.75rem" }} aria-label="Отмена редактирования прав">
                      Отмена
                    </Button>
                  </Flex>
                </Panel>
  );
}

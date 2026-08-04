import { Button, Flex, Input, Typography } from "@maxhub/max-ui";
import { Copy, Loader2 } from "lucide-react";
import type { AdminUserEditorState } from "../hooks/useAdminUserEditor";
import type { User } from "../types/adminUsers";

type Props = {
  user: User;
  isSuperAdmin: boolean;
  editor: AdminUserEditorState;
};

export function AdminUserPermissionsAccountPanel({ user, isSuperAdmin, editor }: Props) {
  const {
    editorSendPasswordToEmail,
    setEditorSendPasswordToEmail,
    resetPasswordInfo,
    editorChangeLoginValue,
    setEditorChangeLoginValue,
    editorChangeLoginOpen,
    setEditorChangeLoginOpen,
    editorChangeLoginLoading,
    deleteProfileConfirmOpen,
    setDeleteProfileConfirmOpen,
    deleteProfileLoading,
    closePermissionsEditor,
    handleResetPassword,
    saveEditorLogin,
    archiveSelectedUser,
  } = editor;

  return (
    <>
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
            <Button type="button" className="filter-button" disabled={editorChangeLoginLoading || !editorChangeLoginValue.trim()} onClick={() => void saveEditorLogin()}>
              {editorChangeLoginLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Сохранить логин"}
            </Button>
            <Button type="button" className="filter-button" onClick={() => setEditorChangeLoginOpen(false)}>Отмена</Button>
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
              <Button type="button" className="filter-button" disabled={deleteProfileLoading} style={{ color: "var(--color-error)" }} onClick={() => void archiveSelectedUser()}>
                {deleteProfileLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Архивировать"}
              </Button>
              <Button type="button" className="filter-button" disabled={deleteProfileLoading} onClick={() => setDeleteProfileConfirmOpen(false)}>Отмена</Button>
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
    </>
  );
}

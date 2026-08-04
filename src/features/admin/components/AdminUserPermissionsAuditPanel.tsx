import { Button, Flex, Input, Typography } from "@maxhub/max-ui";
import { Loader2 } from "lucide-react";
import type { AdminUserEditorState } from "../hooks/useAdminUserEditor";

type Props = {
  editor: AdminUserEditorState;
};

export function AdminUserPermissionsAuditPanel({ editor }: Props) {
  const {
    editorDiffItems,
    userChangeEntries,
    userChangeLoading,
    userChangeQuery,
    setUserChangeQuery,
    editorError,
    editorLoading,
    closePermissionsEditor,
    handleSaveUserPermissions,
  } = editor;

  return (
    <>
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
    </>
  );
}

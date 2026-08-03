import React from "react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import { Loader2 } from "lucide-react";
import { useFocusTrap } from "../../../hooks/useFocusTrap";
import type { PermissionPreset } from "../lib/permissions";
import type { AdminPresetsEditorState } from "../hooks/useAdminPresetsEditor";

type Props = Pick<
  AdminPresetsEditorState,
  | "beginEdit"
  | "setDeleteConfirmId"
  | "deleteConfirmId"
  | "deleteLoading"
  | "deleteModalRef"
  | "confirmDeletePreset"
  | "deletePresetLabel"
> & {
  permissionPresets: PermissionPreset[];
};

export function AdminPresetListPanel({
  permissionPresets,
  beginEdit,
  setDeleteConfirmId,
  deleteConfirmId,
  deleteLoading,
  deleteModalRef,
  confirmDeletePreset,
  deletePresetLabel,
}: Props) {
  useFocusTrap(deleteModalRef, deleteConfirmId != null, () => !deleteLoading && setDeleteConfirmId(null));

  return (
    <>
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
                <Button type="button" className="filter-button" style={{ padding: "0.35rem 0.6rem" }} onClick={() => beginEdit(p)}>
                  Изменить
                </Button>
                <Button
                  type="button"
                  className="filter-button"
                  style={{ padding: "0.35rem 0.6rem", color: "var(--color-error)" }}
                  onClick={() => setDeleteConfirmId(p.id)}
                >
                  Удалить
                </Button>
              </Flex>
            </div>
          ))
        )}
      </div>
      {deleteConfirmId && (
        <div className="modal-overlay" style={{ zIndex: 10000 }} onClick={() => !deleteLoading && setDeleteConfirmId(null)} role="dialog" aria-modal="true" aria-labelledby="preset-delete-title">
          <div
            ref={deleteModalRef}
            className="modal-content"
            style={{ maxWidth: "20rem", padding: "1.25rem" }}
            onClick={(e) => e.stopPropagation()}
          >
            <Typography.Body id="preset-delete-title" style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Удалить пресет?</Typography.Body>
            <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
              Пресет «{deletePresetLabel}» будет удалён. Это не изменит права уже выданные пользователям.
            </Typography.Body>
            <Flex gap="0.5rem" wrap="wrap">
              <button
                type="button"
                disabled={deleteLoading}
                aria-label="Удалить пресет"
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "0.5rem",
                  border: "none",
                  cursor: deleteLoading ? "not-allowed" : "pointer",
                  fontSize: "0.9rem",
                  fontWeight: 500,
                  background: "var(--color-error, #dc2626)",
                  color: "#fff",
                  opacity: deleteLoading ? 0.8 : 1,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  void confirmDeletePreset();
                }}
              >
                {deleteLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ flexShrink: 0 }} /> : null}
                Удалить
              </button>
              <Button
                type="button"
                className="filter-button"
                disabled={deleteLoading}
                onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(null); }}
                aria-label="Отмена, не удалять пресет"
              >
                Отмена
              </Button>
            </Flex>
          </div>
        </div>
      )}
    </>
  );
}

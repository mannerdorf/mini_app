import React from "react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import { FILE_PICKER_BUTTON_STYLE } from "./claimFormConstants";

type Props = {
  open: boolean;
  submitting: boolean;
  error: string | null;
  photoFiles: File[];
  documentFiles: File[];
  videoLink: string;
  onClose: () => void;
  onSubmit: () => void;
  onPhotoFilesChange: (files: File[]) => void;
  onDocumentFilesChange: (files: File[]) => void;
  onVideoLinkChange: (value: string) => void;
};

export function ClaimsReplyModal({
  open,
  submitting,
  error,
  photoFiles,
  documentFiles,
  videoLink,
  onClose,
  onSubmit,
  onPhotoFilesChange,
  onDocumentFilesChange,
  onVideoLinkChange,
}: Props) {
  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={() => !submitting && onClose()}
    >
      <div
        style={{
          width: "min(92vw, 640px)",
          maxHeight: "90vh",
          overflowY: "auto",
          borderRadius: 12,
          background: "var(--color-bg-card, #fff)",
          padding: "1rem",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <Typography.Body style={{ fontWeight: 700, marginBottom: "0.55rem" }}>Ответ на запрос документов</Typography.Body>
        <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.6rem" }}>
          Приложите документы и/или фото по запросу менеджера.
        </Typography.Body>
        <div style={{ display: "grid", gap: "0.55rem" }}>
          <div>
            <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.2rem" }}>
              Фото (до 10 файлов, до 5MB каждый)
            </Typography.Body>
            <input
              id="claims-reply-photos"
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => onPhotoFilesChange(Array.from(e.target.files || []))}
              style={{ display: "none" }}
            />
            <Flex align="center" gap="0.45rem" wrap="wrap">
              <label htmlFor="claims-reply-photos" style={FILE_PICKER_BUTTON_STYLE}>
                Выбрать фото
              </label>
              <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>
                {photoFiles.length > 0 ? `Выбрано: ${photoFiles.length}` : "Файлы не выбраны"}
              </Typography.Body>
            </Flex>
          </div>
          <div>
            <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.2rem" }}>
              PDF документы (до 5MB каждый)
            </Typography.Body>
            <input
              id="claims-reply-documents"
              type="file"
              accept="application/pdf"
              multiple
              onChange={(e) => onDocumentFilesChange(Array.from(e.target.files || []))}
              style={{ display: "none" }}
            />
            <Flex align="center" gap="0.45rem" wrap="wrap">
              <label htmlFor="claims-reply-documents" style={FILE_PICKER_BUTTON_STYLE}>
                Выбрать PDF
              </label>
              <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>
                {documentFiles.length > 0 ? `Выбрано: ${documentFiles.length}` : "Файлы не выбраны"}
              </Typography.Body>
            </Flex>
          </div>
          <div>
            <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.2rem" }}>
              Видео-ссылка (опционально)
            </Typography.Body>
            <input
              type="url"
              className="admin-form-input"
              placeholder="https://..."
              value={videoLink}
              onChange={(e) => onVideoLinkChange(e.target.value)}
              style={{ width: "100%", padding: "0.45rem" }}
            />
          </div>
        </div>
        {error ? (
          <Typography.Body style={{ color: "#ef4444", fontSize: "0.78rem", marginTop: "0.6rem" }}>{error}</Typography.Body>
        ) : null}
        <Flex justify="flex-end" gap="0.45rem" wrap="nowrap" style={{ marginTop: "0.7rem", flexWrap: "nowrap" }}>
          <Button className="filter-button" disabled={submitting} onClick={onClose} style={{ flexShrink: 0 }}>
            Отмена
          </Button>
          <Button className="button-primary" disabled={submitting} onClick={onSubmit} style={{ flexShrink: 0 }}>
            {submitting ? "Отправка..." : "Отправить документы"}
          </Button>
        </Flex>
      </div>
    </div>
  );
}

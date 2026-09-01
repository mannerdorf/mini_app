import React from "react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import { Download, X } from "lucide-react";
import type { PdfPreviewState } from "../../lib/documentPreview";

type PdfPreviewPanelProps = {
  preview: PdfPreviewState;
  onClose: () => void;
  onDownload: (blob: Blob, fileName: string) => void | Promise<void>;
  height?: number | string;
};

export function PdfPreviewPanel({ preview, onClose, onDownload, height = 500 }: PdfPreviewPanelProps) {
  return (
    <div
      className="pdf-preview-panel"
      style={{
        marginTop: "1rem",
        border: "1px solid var(--color-border)",
        borderRadius: "8px",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "0.5rem",
          background: "var(--color-bg-secondary)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "0.5rem",
        }}
      >
        <Typography.Label
          style={{
            fontSize: "0.8rem",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {preview.name}
        </Typography.Label>
        <Flex align="center" gap="0.25rem">
          <Button
            size="small"
            onClick={() => void onDownload(preview.blob, preview.downloadFileName)}
            title="Скачать"
          >
            <Download className="w-4 h-4" />
          </Button>
          <Button size="small" onClick={onClose} title="Закрыть просмотр">
            <X size={16} />
          </Button>
        </Flex>
      </div>
      <iframe
        src={preview.url}
        title={preview.name}
        style={{ width: "100%", height, border: "none", display: "block", background: "#fff" }}
      />
    </div>
  );
}

import React from "react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import { Download, X } from "lucide-react";
import type { PdfPreviewState } from "../../lib/documentPreview";
import { PdfJsViewer } from "./PdfJsViewer";

type PdfPreviewPanelProps = {
  preview: PdfPreviewState;
  onClose: () => void;
  onDownload: (blob: Blob, fileName: string) => void | Promise<void>;
  height?: number | string;
};

export function PdfPreviewPanel({ preview, onClose, onDownload, height = "min(70vh, 560px)" }: PdfPreviewPanelProps) {
  return (
    <div className="pdf-preview-panel">
      <div className="pdf-preview-panel__header">
        <Typography.Label className="pdf-preview-panel__title">{preview.name}</Typography.Label>
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
      <PdfJsViewer blob={preview.blob} title={preview.name} height={height} />
    </div>
  );
}

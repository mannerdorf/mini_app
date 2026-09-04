import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, Eye, Loader2, Play } from "lucide-react";
import { Button, Flex, Input, Panel, Typography } from "@maxhub/max-ui";
import type { AuthData } from "../types";
import { PdfPreviewPanel } from "../components/shared/PdfPreviewPanel";
import { revokePdfPreview, type PdfPreviewState } from "../lib/documentPreview";
import { saveBlobFile } from "../lib/saveBlobFile";
import { isCapacitorNative } from "../lib/capacitorPlatform";
import {
  DOWNLOAD_SANDBOX_VARIANTS,
  loadSandboxInputs,
  runDownloadSandboxVariant,
  SANDBOX_DOC_TYPES,
  saveSandboxInputs,
  type DownloadSandboxVariant,
  type SandboxDocType,
  type SandboxDocumentInputs,
  type SandboxRunLog,
} from "../lib/documentDownloadSandbox";

type Props = {
  auth: AuthData;
  onBack: () => void;
};

const LABEL_STYLE: React.CSSProperties = { fontSize: "0.82rem", color: "var(--color-text-secondary)" };

function variantIsVisible(variant: DownloadSandboxVariant): boolean {
  if ("nativeOnly" in variant && variant.nativeOnly) return isCapacitorNative();
  return true;
}

export function HaulzDownloadSandboxPage({ auth, onBack }: Props) {
  const [inputs, setInputs] = useState<SandboxDocumentInputs>(() => loadSandboxInputs());
  const [docType, setDocType] = useState<SandboxDocType>("АПП");
  const [runningId, setRunningId] = useState<string | null>(null);
  const [logs, setLogs] = useState<SandboxRunLog[]>([]);
  const [pdfViewer, setPdfViewer] = useState<PdfPreviewState | null>(null);
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);

  useEffect(() => {
    saveSandboxInputs(inputs);
  }, [inputs]);

  useEffect(() => {
    return () => {
      if (iframeUrl) URL.revokeObjectURL(iframeUrl);
    };
  }, [iframeUrl]);

  const visibleVariants = useMemo(() => DOWNLOAD_SANDBOX_VARIANTS.filter(variantIsVisible), []);

  const patchInputs = useCallback((patch: Partial<SandboxDocumentInputs>) => {
    setInputs((prev) => ({ ...prev, ...patch }));
  }, []);

  const runVariant = useCallback(
    async (variant: DownloadSandboxVariant) => {
      setRunningId(variant.id);
      try {
        if (pdfViewer) {
          await revokePdfPreview(pdfViewer);
          setPdfViewer(null);
        }
        if (iframeUrl) {
          URL.revokeObjectURL(iframeUrl);
          setIframeUrl(null);
        }

        const result = await runDownloadSandboxVariant(auth, docType, variant, inputs);
        setLogs((prev) => [result.log, ...prev].slice(0, 40));
        if (result.preview) setPdfViewer(result.preview);
        if (result.iframeUrl) setIframeUrl(result.iframeUrl);
      } finally {
        setRunningId(null);
      }
    },
    [auth, docType, iframeUrl, inputs, pdfViewer],
  );

  const runAllVariants = useCallback(async () => {
    for (const variant of visibleVariants) {
      await runVariant(variant);
    }
  }, [runVariant, visibleVariants]);

  return (
    <div className="w-full haulz-download-sandbox">
      <Flex align="center" style={{ marginBottom: "1rem", gap: "0.75rem" }}>
        <Button type="button" className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Typography.Headline className="text-page-title">Скачивание — песочница</Typography.Headline>
      </Flex>

      <Typography.Body style={{ fontSize: "0.88rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
        Тест предпросмотра и скачивания документов (ЭР, АПП, СЧЕТ, УПД, реестр). Выберите тип, заполните номера и
        попробуйте варианты — в логе будет видно, что сработало.
      </Typography.Body>

      <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)", marginBottom: "1rem" }}>
        <Typography.Body style={{ fontWeight: 600, marginBottom: "0.65rem" }}>Тестовые данные</Typography.Body>
        <Flex direction="column" gap="0.65rem">
          <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <Typography.Body style={LABEL_STYLE}>Номер перевозки</Typography.Body>
            <Input
              className="login-input"
              value={inputs.cargoNumber}
              onChange={(e) => patchInputs({ cargoNumber: e.target.value })}
              placeholder="000141572"
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <Typography.Body style={LABEL_STYLE}>Номер счёта</Typography.Body>
            <Input
              className="login-input"
              value={inputs.invoiceNumber}
              onChange={(e) => patchInputs({ invoiceNumber: e.target.value })}
              placeholder="0000-000123"
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <Typography.Body style={LABEL_STYLE}>Дата счёта (для реестра)</Typography.Body>
            <Input
              className="login-input date-input"
              type="date"
              value={inputs.dateDoc.slice(0, 10)}
              onChange={(e) => patchInputs({ dateDoc: e.target.value })}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <Typography.Body style={LABEL_STYLE}>ИНН (опционально)</Typography.Body>
            <Input
              className="login-input"
              value={inputs.inn}
              onChange={(e) => patchInputs({ inn: e.target.value })}
              placeholder={auth.inn || "из auth"}
            />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
            <input
              type="checkbox"
              checked={inputs.formatCargoForApi}
              onChange={(e) => patchInputs({ formatCargoForApi: e.target.checked })}
            />
            <Typography.Body style={{ fontSize: "0.85rem" }}>Форматировать перевозку для API (9 цифр)</Typography.Body>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
            <input
              type="checkbox"
              checked={inputs.schetUseInvoiceNumber}
              onChange={(e) => patchInputs({ schetUseInvoiceNumber: e.target.checked })}
            />
            <Typography.Body style={{ fontSize: "0.85rem" }}>СЧЕТ: номер счёта вместо перевозки</Typography.Body>
          </label>
        </Flex>
      </Panel>

      <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)", marginBottom: "1rem" }}>
        <Flex align="center" justify="space-between" wrap="wrap" gap="0.5rem" style={{ marginBottom: "0.75rem" }}>
          <Typography.Body style={{ fontWeight: 600 }}>Тип документа</Typography.Body>
          <Button type="button" className="filter-button" onClick={() => void runAllVariants()} disabled={!!runningId}>
            <Play className="w-4 h-4" />
            Прогнать все варианты
          </Button>
        </Flex>
        <Flex gap="0.35rem" wrap="wrap" style={{ marginBottom: "0.85rem" }}>
          {SANDBOX_DOC_TYPES.map((type) => (
            <Button
              key={type}
              type="button"
              className={docType === type ? "button-primary" : "filter-button"}
              onClick={() => setDocType(type)}
            >
              {type}
            </Button>
          ))}
        </Flex>

        <div style={{ overflowX: "auto" }}>
          <table className="admin-table" style={{ width: "100%", fontSize: "0.82rem" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Вариант</th>
                <th style={{ textAlign: "right", width: "6.5rem" }}>Запуск</th>
              </tr>
            </thead>
            <tbody>
              {visibleVariants.map((variant) => {
                const busy = runningId === variant.id;
                const last = logs.find((l) => l.docType === docType && l.variantLabel === variant.label);
                return (
                  <tr key={variant.id}>
                    <td style={{ padding: "0.45rem 0.35rem" }}>
                      <div>{variant.label}</div>
                      {last ? (
                        <div
                          style={{
                            fontSize: "0.72rem",
                            marginTop: "0.15rem",
                            color: last.ok ? "#16a34a" : "#dc2626",
                          }}
                        >
                          {last.ok
                            ? `OK · ${last.ms} ms${last.sizeBytes != null ? ` · ${last.sizeBytes} B` : ""}${last.isHtml ? " · HTML" : ""}`
                            : last.error}
                        </div>
                      ) : null}
                    </td>
                    <td style={{ padding: "0.45rem 0.35rem", textAlign: "right", whiteSpace: "nowrap" }}>
                      <Button
                        type="button"
                        className="filter-button"
                        disabled={!!runningId}
                        onClick={() => void runVariant(variant)}
                        title="Запустить"
                      >
                        {busy ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : variant.kind === "preview_pdfjs" || variant.kind === "iframe" || variant.kind === "blob_tab" ? (
                          <Eye className="w-4 h-4" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {pdfViewer ? (
        <Panel className="cargo-card" style={{ padding: "0.75rem", marginBottom: "1rem" }}>
          <PdfPreviewPanel
            preview={pdfViewer}
            onDownload={(blob, name) => saveBlobFile(blob, name)}
            onClose={() => {
              void revokePdfPreview(pdfViewer);
              setPdfViewer(null);
            }}
            height="min(65vh, 520px)"
          />
        </Panel>
      ) : null}

      {iframeUrl ? (
        <Panel className="cargo-card" style={{ padding: "0.75rem", marginBottom: "1rem" }}>
          <Flex justify="space-between" align="center" style={{ marginBottom: "0.5rem" }}>
            <Typography.Body style={{ fontWeight: 600 }}>iframe preview</Typography.Body>
            <Button
              type="button"
              className="filter-button"
              onClick={() => {
                URL.revokeObjectURL(iframeUrl);
                setIframeUrl(null);
              }}
            >
              Закрыть
            </Button>
          </Flex>
          <iframe
            title="Document iframe preview"
            src={iframeUrl}
            style={{ width: "100%", height: "min(65vh, 520px)", border: "1px solid var(--color-border)", borderRadius: 8 }}
          />
        </Panel>
      ) : null}

      {logs.length > 0 ? (
        <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
          <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Лог</Typography.Body>
          <div style={{ maxHeight: "16rem", overflowY: "auto", fontFamily: "ui-monospace, monospace", fontSize: "0.72rem" }}>
            {logs.map((log) => (
              <div
                key={log.id}
                style={{
                  padding: "0.35rem 0",
                  borderBottom: "1px solid var(--color-border)",
                  color: log.ok ? "var(--color-text-primary)" : "#dc2626",
                }}
              >
                [{log.at.slice(11, 19)}] {log.docType} · {log.variantLabel} · {log.ok ? "OK" : "ERR"} · {log.ms}ms
                {log.fileName ? ` · ${log.fileName}` : ""}
                {log.error ? ` · ${log.error}` : ""}
                {log.request ? ` · metod=${log.request.metod} number=${log.request.number}` : ""}
              </div>
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

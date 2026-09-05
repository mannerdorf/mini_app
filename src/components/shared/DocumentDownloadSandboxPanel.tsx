import React, { useState } from "react";
import { ChevronDown, ChevronUp, Copy } from "lucide-react";
import type { DocumentDownloadDebug } from "../../lib/documentDownloadDebug";
import { formatDocumentDownloadSandbox } from "../../lib/documentDownloadDebug";

type Props = {
  debug: DocumentDownloadDebug | null;
  open?: boolean;
};

/** Разворачиваемая песочница: curl в 1С + краткий ответ. */
export function DocumentDownloadSandboxPanel({ debug, open: openProp }: Props) {
  const [open, setOpen] = useState(true);
  const expanded = openProp ?? open;

  if (!debug) return null;

  const { curl, response, meta } = formatDocumentDownloadSandbox(debug);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard?.writeText(text);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className={`document-download-sandbox${debug.ok ? " document-download-sandbox--ok" : " document-download-sandbox--err"}`}
    >
      <button
        type="button"
        className="document-download-sandbox__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={expanded}
      >
        <span>
          Песочница 1С · {debug.ok ? "OK" : "ошибка"}
          {debug.upstream_status != null ? ` · HTTP ${debug.upstream_status}` : ` · HTTP ${debug.httpStatus}`}
        </span>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {expanded ? (
        <div className="document-download-sandbox__body">
          <p className="document-download-sandbox__meta">{meta}</p>
          <div className="document-download-sandbox__label-row">
            <label className="document-download-sandbox__label">Запрос curl (GetFile → 1С)</label>
            <button type="button" className="document-download-sandbox__copy" onClick={() => void copy(curl)} title="Копировать">
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
          <textarea
            className="document-download-sandbox__pre"
            readOnly
            spellCheck={false}
            value={curl}
            rows={7}
          />
          {debug.upstream_url ? (
            <p className="document-download-sandbox__meta">{debug.upstream_url}</p>
          ) : null}
          {debug.client_curl ? (
            <>
              <div className="document-download-sandbox__label-row">
                <label className="document-download-sandbox__label">Клиент → /api/download</label>
                <button
                  type="button"
                  className="document-download-sandbox__copy"
                  onClick={() => void copy(debug.client_curl || "")}
                  title="Копировать"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
              <textarea
                className="document-download-sandbox__pre"
                readOnly
                spellCheck={false}
                value={debug.client_curl}
                rows={5}
              />
            </>
          ) : null}
          <label className="document-download-sandbox__label">Ответ 1С (кратко)</label>
          <textarea
            className="document-download-sandbox__pre document-download-sandbox__pre--response"
            readOnly
            spellCheck={false}
            value={response}
            rows={8}
          />
        </div>
      ) : null}
    </div>
  );
}

import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { Order1cSandboxSnapshot } from "./DocumentsOrderQuoteSummary";

function formatSandboxJson(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

type Props = {
  snapshot: Order1cSandboxSnapshot;
  onClose: () => void;
};

/** Полноэкранная песочница через portal — не обрезается колонкой «Ваш расчёт». */
export function DocumentsOrder1cSandboxModal({ snapshot, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const upstream = snapshot.upstreamRequest;
  const requestBody = upstream?.body ?? snapshot.request;

  return createPortal(
    <div
      className="haulz-calc-map-overlay documents-order-1c-sandbox-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="documents-order-1c-sandbox-title"
      onClick={onClose}
    >
      <div
        className="haulz-calc-map-modal documents-order-1c-sandbox-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="haulz-calc-map-modal__head">
          <div id="documents-order-1c-sandbox-title" className="haulz-calc-map-modal__title">
            Песочница 1С
          </div>
          <button type="button" className="haulz-calc-map-modal__close" aria-label="Закрыть" onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="documents-order-1c-sandbox-modal__body">
          <p
            className={`documents-order-1c-sandbox-modal__status${
              snapshot.ok ? " documents-order-1c-sandbox-modal__status--ok" : " documents-order-1c-sandbox-modal__status--err"
            }`}
          >
            {snapshot.ok ? "OK" : "Ошибка"}
            {snapshot.status != null ? ` · HTTP ${snapshot.status}` : ""}
            {snapshot.requestId ? ` · ${snapshot.requestId}` : ""}
            {snapshot.at ? ` · ${new Date(snapshot.at).toLocaleString("ru-RU")}` : ""}
          </p>
          {snapshot.error ? <p className="documents-order-1c-sandbox-modal__error">{snapshot.error}</p> : null}
          {snapshot.apiRoute ? (
            <p className="documents-order-1c-sandbox-modal__meta">
              API: <code>{snapshot.apiRoute}</code>
            </p>
          ) : null}

          {upstream ? (
            <>
              <label className="documents-order-1c-sandbox-modal__label">HTTP-запрос бэкенда в 1С</label>
              <p className="documents-order-1c-sandbox-modal__meta">
                <strong>{upstream.method}</strong> {upstream.url}
              </p>
              <label className="documents-order-1c-sandbox-modal__label">Заголовки</label>
              <textarea
                className="documents-order-1c-sandbox-modal__pre documents-order-1c-sandbox-modal__pre--request"
                readOnly
                spellCheck={false}
                value={formatSandboxJson(upstream.headers)}
              />
            </>
          ) : null}

          <label className="documents-order-1c-sandbox-modal__label">
            {upstream ? "Тело JSON (LoadZayavka)" : "Запрос в 1С"}
          </label>
          <textarea
            className="documents-order-1c-sandbox-modal__pre documents-order-1c-sandbox-modal__pre--request"
            readOnly
            spellCheck={false}
            value={formatSandboxJson(requestBody)}
          />

          <label className="documents-order-1c-sandbox-modal__label">Ответ 1С / API</label>
          <textarea
            className="documents-order-1c-sandbox-modal__pre"
            readOnly
            spellCheck={false}
            value={formatSandboxJson(snapshot.response)}
          />
        </div>

        <div className="haulz-calc-map-modal__actions">
          <button type="button" className="haulz-calc-btn-primary" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

import React, { useCallback, useEffect, useState } from "react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import { Copy, Loader2, QrCode } from "lucide-react";
import { formatCurrency } from "../../lib/formatUtils";
import { canShowInvoicePaymentQr } from "../../../lib/invoicePaymentQr.js";
import type { AuthData } from "../../types";

type QrResponse = {
  configured?: boolean;
  payload?: string;
  qrImageUrl?: string;
  purpose?: string;
  amountRub?: number;
  payeeName?: string;
  error?: string;
};

type Props = {
  invoice: Record<string, unknown>;
  auth: AuthData | null | undefined;
};

export function InvoicePaymentQrBlock({ invoice, auth }: Props) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<QrResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"payload" | "purpose" | null>(null);

  const mayPay = canShowInvoicePaymentQr(invoice);

  const loadQr = useCallback(async () => {
    if (!auth?.login || !auth?.password || !mayPay) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/invoice-payment-qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          login: auth.login,
          password: auth.password,
          invoice,
        }),
      });
      const json = (await res.json()) as QrResponse;
      if (!res.ok) {
        setData(null);
        setError(json.error || "Не удалось сформировать QR");
        return;
      }
      setData(json);
    } catch {
      setError("Не удалось выполнить запрос");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [auth?.login, auth?.password, invoice, mayPay]);

  useEffect(() => {
    void loadQr();
  }, [loadQr]);

  const copyText = async (text: string, kind: "payload" | "purpose") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      /* ignore */
    }
  };

  if (!mayPay) return null;

  return (
    <div
      className="invoice-payment-qr-block"
      style={{
        marginBottom: "0.75rem",
        padding: "0.75rem",
        borderRadius: "10px",
        border: "1px solid var(--color-border)",
        background: "var(--color-bg-hover)",
        flexShrink: 0,
      }}
    >
      <Flex align="center" gap="0.35rem" style={{ marginBottom: "0.5rem" }}>
        <QrCode className="w-4 h-4" style={{ color: "var(--color-primary-blue)" }} />
        <Typography.Body style={{ fontWeight: 600, fontSize: "0.9rem" }}>Оплата по QR</Typography.Body>
      </Flex>

      {loading && (
        <Flex align="center" gap="0.35rem" style={{ color: "var(--color-text-secondary)" }}>
          <Loader2 className="w-4 h-4 animate-spin" />
          <Typography.Body style={{ fontSize: "0.85rem" }}>Формируем QR…</Typography.Body>
        </Flex>
      )}

      {!loading && error && (
        <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-error)" }}>{error}</Typography.Body>
      )}

      {!loading && data?.qrImageUrl && data.payload && (
        <Flex gap="0.75rem" wrap="wrap" align="flex-start">
          <img
            src={data.qrImageUrl}
            alt="QR для оплаты в банке"
            width={200}
            height={200}
            style={{
              display: "block",
              borderRadius: "8px",
              background: "#fff",
              padding: "6px",
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1, minWidth: "12rem" }}>
            <Typography.Body style={{ fontSize: "0.85rem", marginBottom: "0.35rem" }}>
              К оплате:{" "}
              <strong>{formatCurrency(data.amountRub ?? 0)}</strong>
            </Typography.Body>
            {data.payeeName && (
              <Typography.Body
                style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.35rem" }}
              >
                Получатель: {data.payeeName}
              </Typography.Body>
            )}
            <Typography.Body
              style={{
                fontSize: "0.78rem",
                color: "var(--color-text-secondary)",
                marginBottom: "0.5rem",
                lineHeight: 1.4,
              }}
            >
              {data.purpose}
            </Typography.Body>
            <Typography.Body
              style={{ fontSize: "0.72rem", color: "var(--color-text-secondary)", marginBottom: "0.5rem", lineHeight: 1.45 }}
            >
              В приложении банка для бизнеса: «Платёж» → «Сканировать QR» или «По реквизитам» → сканер.
            </Typography.Body>
            <Flex gap="0.35rem" wrap="wrap">
              <Button
                type="button"
                className="filter-button"
                style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}
                onClick={() => void copyText(data.payload!, "payload")}
              >
                <Copy className="w-3.5 h-3.5" />
                {copied === "payload" ? "Скопировано" : "Копировать QR-строку"}
              </Button>
              {data.purpose && (
                <Button
                  type="button"
                  className="filter-button"
                  style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}
                  onClick={() => void copyText(data.purpose!, "purpose")}
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copied === "purpose" ? "Скопировано" : "Назначение"}
                </Button>
              )}
            </Flex>
          </div>
        </Flex>
      )}
    </div>
  );
}

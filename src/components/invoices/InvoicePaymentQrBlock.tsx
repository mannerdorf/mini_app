import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Flex, Typography } from "@maxhub/max-ui";
import { Loader2, QrCode } from "lucide-react";
import { formatCurrency, parseCargoNumbersFromText } from "../../lib/formatUtils";
import { invoiceBalance, invoiceDocSum, invoiceSumPaid } from "../../../lib/invoiceAmounts.js";
import { canShowInvoicePaymentQr } from "../../../lib/invoicePaymentQr.js";
import { BankBusinessPayButtons } from "./BankBusinessPayButtons";
import type { AuthData } from "../../types";

type QrResponse = {
  configured?: boolean;
  payload?: string;
  qrImageUrl?: string;
  purpose?: string;
  amountRub?: number;
  docSumRub?: number;
  paidRub?: number;
  balanceRub?: number;
  payeeName?: string;
  error?: string;
};

type Props = {
  invoice: Record<string, unknown>;
  auth: AuthData | null | undefined;
  cargoSumPaidByNumber?: Map<string, number>;
};

function getFirstCargoNumberFromInvoice(inv: Record<string, unknown>): string | null {
  const list = Array.isArray(inv.List) ? inv.List : [];
  for (const row of list) {
    const text = String(
      (row as { Operation?: string; Name?: string })?.Operation ??
        (row as { Name?: string })?.Name ??
        "",
    ).trim();
    if (!text) continue;
    const cargo = parseCargoNumbersFromText(text).find((p) => p.type === "cargo");
    if (cargo?.value) return cargo.value;
  }
  return null;
}

export function InvoicePaymentQrBlock({ invoice, auth, cargoSumPaidByNumber }: Props) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<QrResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mayPay = canShowInvoicePaymentQr(invoice);

  const amounts = useMemo(() => {
    const getCargo = (inv: Record<string, unknown>) => getFirstCargoNumberFromInvoice(inv);
    const docSum = invoiceDocSum(invoice);
    const paid = invoiceSumPaid(invoice, cargoSumPaidByNumber, getCargo);
    const balance = invoiceBalance(invoice, cargoSumPaidByNumber, getCargo);
    return { docSum, paid, balance };
  }, [invoice, cargoSumPaidByNumber]);

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

  if (!mayPay) return null;

  const docSum = data?.docSumRub ?? amounts.docSum;
  const paid = data?.paidRub ?? amounts.paid;
  const balance = data?.balanceRub ?? data?.amountRub ?? amounts.balance;

  const amountLineStyle = { fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.2rem" };

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
            <Typography.Body style={amountLineStyle}>
              Сумма счёта: <strong style={{ color: "var(--color-text-primary)" }}>{formatCurrency(docSum)}</strong>
            </Typography.Body>
            <Typography.Body style={amountLineStyle}>
              Оплачено: <strong style={{ color: "var(--color-text-primary)" }}>{formatCurrency(paid)}</strong>
            </Typography.Body>
            <Typography.Body style={{ ...amountLineStyle, marginBottom: "0.45rem" }}>
              Остаток к оплате:{" "}
              <strong style={{ color: "var(--color-text-primary)", fontSize: "0.9rem" }}>{formatCurrency(balance)}</strong>
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
              style={{ fontSize: "0.72rem", color: "var(--color-text-secondary)", lineHeight: 1.45, marginBottom: "0.65rem" }}
            >
              В приложении банка: «Платёж» → «Сканировать QR» или оплата по реквизитам.
            </Typography.Body>
            <BankBusinessPayButtons />
          </div>
        </Flex>
      )}
    </div>
  );
}

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

function SummaryTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`invoice-payment-qr-tile${accent ? " invoice-payment-qr-tile--accent" : ""}`}>
      <span className="invoice-payment-qr-tile__label">{label}</span>
      <span className="invoice-payment-qr-tile__value">{value}</span>
    </div>
  );
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

  return (
    <div className="invoice-payment-qr-block">
      <Flex align="center" gap="0.35rem" className="invoice-payment-qr-block__head">
        <QrCode className="w-4 h-4" style={{ color: "var(--color-primary-blue)" }} />
        <Typography.Headline className="invoice-payment-qr-block__title">Оплата по QR</Typography.Headline>
      </Flex>

      {loading && (
        <Flex align="center" gap="0.35rem" className="invoice-payment-qr-block__loading">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Формируем QR…</span>
        </Flex>
      )}

      {!loading && error && <p className="invoice-payment-qr-block__error">{error}</p>}

      {!loading && data?.qrImageUrl && data.payload && (
        <div className="invoice-payment-qr-block__body">
          <div className="invoice-payment-qr-block__qr-wrap">
            <img src={data.qrImageUrl} alt="QR для оплаты в банке" className="invoice-payment-qr-block__qr" />
          </div>

          <div className="invoice-payment-qr-block__details">
            <div className="invoice-payment-qr-summary">
              <SummaryTile label="Сумма счёта" value={formatCurrency(docSum)} />
              <SummaryTile label="Оплачено" value={formatCurrency(paid)} />
              <SummaryTile label="Остаток к оплате" value={formatCurrency(balance)} accent />
            </div>

            {data.payeeName ? (
              <p className="invoice-payment-qr-meta">
                <span className="invoice-payment-qr-meta__label">Получатель:</span>{" "}
                <span className="invoice-payment-qr-meta__value">{data.payeeName}</span>
              </p>
            ) : null}

            {data.purpose ? (
              <p className="invoice-payment-qr-purpose">{data.purpose}</p>
            ) : null}

            <p className="invoice-payment-qr-hint">
              В приложении банка выберите «Платёж», затем «Сканировать QR» или оплатите по реквизитам.
            </p>

            <BankBusinessPayButtons />
          </div>
        </div>
      )}
    </div>
  );
}

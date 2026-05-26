import type { CompanyPayeeDetails } from "./companyPayeeDetails.js";
import { invoiceBalance, invoiceDocSum, invoiceSumPaid } from "./invoiceAmounts.js";
import { getInvoicePaymentFilterKey } from "./invoicePaymentFilter.js";

const PURPOSE_TEMPLATE =
  "Оплата за транспортные услуги по счету {number} от {date}";

function qrEscape(value: string): string {
  return value.replace(/[|\r\n]+/g, " ").trim();
}

export function formatInvoiceDateForPaymentPurpose(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  const ru = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (ru) return `${ru[1]}.${ru[2]}.${ru[3]}`;
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    const d = parsed;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
  }
  return s.slice(0, 10);
}

export function buildInvoicePaymentPurpose(invoiceNumber: string, invoiceDateRaw: unknown): string {
  const number = qrEscape(invoiceNumber || "—");
  const date = formatInvoiceDateForPaymentPurpose(invoiceDateRaw) || "—";
  return PURPOSE_TEMPLATE.replace("{number}", number).replace("{date}", date);
}

export function invoicePaymentAmountKopecks(inv: Record<string, unknown>): number {
  const rub = invoiceBalance(inv);
  return Math.max(0, Math.round(rub * 100));
}

export function canShowInvoicePaymentQr(inv: Record<string, unknown>): boolean {
  const key = getInvoicePaymentFilterKey(inv);
  if (key === "paid" || key === "cancelled") return false;
  return invoicePaymentAmountKopecks(inv) > 0;
}

/** Строка для QR по ГОСТ Р 56042 (ST00012, UTF-8). */
export function buildSt00012PaymentPayload(
  payee: CompanyPayeeDetails,
  options: { amountKopecks: number; purpose: string },
): string {
  const parts = [
    "ST00012",
    `Name=${qrEscape(payee.name)}`,
    `PersonalAcc=${qrEscape(payee.account)}`,
    `BankName=${qrEscape(payee.bankName)}`,
    `BIC=${qrEscape(payee.bic)}`,
  ];
  if (payee.corrAccount) parts.push(`CorrespAcc=${qrEscape(payee.corrAccount)}`);
  parts.push(`Sum=${options.amountKopecks}`);
  parts.push(`Purpose=${qrEscape(options.purpose)}`);
  parts.push(`PayeeINN=${qrEscape(payee.inn)}`);
  if (payee.kpp) parts.push(`KPP=${qrEscape(payee.kpp)}`);
  return parts.join("|");
}

export function buildQrImageUrl(payload: string, sizePx = 280): string {
  const color = "2563eb";
  const bgcolor = "ffffff";
  return `https://api.qrserver.com/v1/create-qr-code/?size=${sizePx}x${sizePx}&data=${encodeURIComponent(payload)}&color=${color}&bgcolor=${bgcolor}`;
}

/** Загружает PNG QR на сервере — в WebView мини-приложений внешние img часто не грузятся. */
export async function embedQrImageAsDataUrl(qrImageUrl: string): Promise<string> {
  try {
    const res = await fetch(qrImageUrl);
    if (!res.ok) return qrImageUrl;
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
    return `data:${ct};base64,${buf.toString("base64")}`;
  } catch {
    return qrImageUrl;
  }
}

export type InvoicePaymentQrResult = {
  payload: string;
  qrImageUrl: string;
  purpose: string;
  amountRub: number;
  amountKopecks: number;
  docSumRub: number;
  paidRub: number;
  balanceRub: number;
  invoiceNumber: string;
  invoiceDate: string;
};

export function buildInvoicePaymentQr(
  payee: CompanyPayeeDetails,
  inv: Record<string, unknown>,
): InvoicePaymentQrResult | null {
  if (!canShowInvoicePaymentQr(inv)) return null;

  const invoiceNumber = String(inv.Number ?? inv.number ?? "").trim();
  const invoiceDateRaw = inv.DateDoc ?? inv.Date ?? inv.date ?? inv.Дата ?? "";
  const purpose = buildInvoicePaymentPurpose(invoiceNumber, invoiceDateRaw);
  const docSumRub = invoiceDocSum(inv);
  const paidRub = invoiceSumPaid(inv);
  const balanceRub = invoiceBalance(inv);
  const amountKopecks = Math.max(0, Math.round(balanceRub * 100));
  if (amountKopecks <= 0) return null;

  const payload = buildSt00012PaymentPayload(payee, { amountKopecks, purpose });
  return {
    payload,
    qrImageUrl: buildQrImageUrl(payload),
    purpose,
    amountRub: amountKopecks / 100,
    amountKopecks,
    docSumRub,
    paidRub,
    balanceRub,
    invoiceNumber,
    invoiceDate: formatInvoiceDateForPaymentPurpose(invoiceDateRaw),
  };
}

/** Для отладки / превью без полного счёта. */
export function summarizeInvoicePayment(inv: Record<string, unknown>) {
  return {
    docSum: invoiceDocSum(inv),
    paid: invoiceSumPaid(inv),
    balance: invoiceBalance(inv),
    paymentKey: getInvoicePaymentFilterKey(inv),
  };
}

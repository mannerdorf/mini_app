/** Серверная копия логики ЭДО из src/lib/edoStatus.ts (без React). */

export type EdoTone = "success" | "warning" | "danger" | "muted" | "info";

export type EdoStatusInfo = {
  raw: string;
  label: string;
  shortLabel: string;
  tone: EdoTone;
};

const EDO_STATUS_MAP: Record<string, Omit<EdoStatusInfo, "raw">> = {
  WaitingForRecipientSignature: { label: "Ожидает подписи получателя", shortLabel: "ОП", tone: "warning" },
  RecipientResponseStatusAccepted: { label: "Принят получателем", shortLabel: "П", tone: "success" },
  RecipientResponseStatusSigned: { label: "Подписан получателем", shortLabel: "П", tone: "success" },
  RecipientResponseStatusNotAcceptable: { label: "Не принят получателем", shortLabel: "НП", tone: "danger" },
  RecipientResponseStatusRejected: { label: "Отклонен получателем", shortLabel: "НП", tone: "danger" },
  RecipientSignatureRequestRejected: { label: "Запрос подписи отклонен получателем", shortLabel: "НП", tone: "danger" },
  RecipientResponseStatusPartlySigned: { label: "Подписан частично", shortLabel: "П", tone: "success" },
};

const EMPTY_EDO: EdoStatusInfo = { raw: "", label: "Нет статуса", shortLabel: "НС", tone: "muted" };

function edoSlug(s: string): string {
  return s.normalize("NFKC").trim().toLowerCase().replace(/[\s\u00A0_-]+/g, "");
}

const SLUG_TO_CANONICAL: Record<string, keyof typeof EDO_STATUS_MAP> = {
  waitingforrecipientsignature: "WaitingForRecipientSignature",
  withrecipientsignature: "RecipientResponseStatusSigned",
  withrecipientssignature: "RecipientResponseStatusSigned",
  awaitingrecipientsignature: "WaitingForRecipientSignature",
  recipientresponsenotacceptable: "RecipientResponseStatusNotAcceptable",
  recipientresponsestatusnotacceptable: "RecipientResponseStatusNotAcceptable",
  recipientresponsestatusaccepted: "RecipientResponseStatusAccepted",
  recipientresponsestatussigned: "RecipientResponseStatusSigned",
  recipientresponsestatusrejected: "RecipientResponseStatusRejected",
  recipientsignaturerequestrejected: "RecipientSignatureRequestRejected",
  recipientresponsestatuspartlysigned: "RecipientResponseStatusPartlySigned",
};

function resolveCanonicalKey(raw: string): keyof typeof EDO_STATUS_MAP | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (Object.prototype.hasOwnProperty.call(EDO_STATUS_MAP, trimmed)) return trimmed as keyof typeof EDO_STATUS_MAP;
  const slug = edoSlug(trimmed);
  if (SLUG_TO_CANONICAL[slug]) return SLUG_TO_CANONICAL[slug];
  if (/with\s+recipients?\s+signature/i.test(trimmed)) return "RecipientResponseStatusSigned";
  if (/waiting\s+for\s+recipient/i.test(trimmed) && /signature/i.test(trimmed)) return "WaitingForRecipientSignature";
  return null;
}

export function getEdoStatusInfo(raw: unknown): EdoStatusInfo {
  const key = String(raw ?? "").trim();
  if (!key) return { ...EMPTY_EDO };
  const canonical = resolveCanonicalKey(key);
  if (canonical) return { raw: key, ...EDO_STATUS_MAP[canonical] };
  return { raw: key, label: `Неизвестный статус: ${key}`, shortLabel: "?", tone: "info" };
}

function pickString(obj: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

export const INVOICE_EDO_DOC_LABELS = ["ЭР", "АПП", "УПД", "СЧЕТ"] as const;
export type InvoiceEdoDocLabel = (typeof INVOICE_EDO_DOC_LABELS)[number];

export function getInvoiceEdoRawByDocLabel(item: Record<string, unknown>, docLabel: InvoiceEdoDocLabel | "Реестр"): string {
  if (docLabel === "ЭР") {
    return pickString(item, ["DDRecipientResponseStatus_Raspiska", "ddRecipientResponseStatusRaspiska", "recipientResponseStatusRaspiska"]);
  }
  if (docLabel === "АПП") {
    return pickString(item, ["DDRecipientResponseStatus_APP", "ddRecipientResponseStatusAPP", "recipientResponseStatusAPP"]);
  }
  if (docLabel === "УПД") {
    return pickString(item, ["DDRecipientResponseStatus_UPD", "ddRecipientResponseStatusUPD", "recipientResponseStatusUPD"]);
  }
  if (docLabel === "СЧЕТ") {
    return pickString(item, ["DDRecipientResponseStatus_bill", "ddRecipientResponseStatusBill", "recipientResponseStatusBill"]);
  }
  return "";
}

export function getInvoiceEdoInfoByDocLabel(item: Record<string, unknown>, docLabel: InvoiceEdoDocLabel): EdoStatusInfo {
  const raw = getInvoiceEdoRawByDocLabel(item, docLabel);
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return getEdoStatusInfo(raw);
  if (docLabel === "СЧЕТ") {
    const canonical = resolveCanonicalKey(trimmed);
    if (canonical === "RecipientResponseStatusNotAcceptable") {
      return { raw: trimmed, label: "Отправлен", shortLabel: "ОТ", tone: "info" };
    }
  }
  return getEdoStatusInfo(raw);
}

export function isInvoiceEdoSigned(info: EdoStatusInfo): boolean {
  return Boolean(info.raw) && info.tone === "success";
}

export type InvoiceEdoDocAgg = { signed: number; total: number };

export function aggregateInvoiceEdoDocStats(invoices: Record<string, unknown>[]): Record<InvoiceEdoDocLabel, InvoiceEdoDocAgg> {
  const out: Record<InvoiceEdoDocLabel, InvoiceEdoDocAgg> = {
    ЭР: { signed: 0, total: 0 },
    АПП: { signed: 0, total: 0 },
    УПД: { signed: 0, total: 0 },
    СЧЕТ: { signed: 0, total: 0 },
  };
  for (const inv of invoices) {
    for (const label of INVOICE_EDO_DOC_LABELS) {
      const info = getInvoiceEdoInfoByDocLabel(inv, label);
      if (!info.raw) continue;
      out[label].total += 1;
      if (isInvoiceEdoSigned(info)) out[label].signed += 1;
    }
  }
  return out;
}

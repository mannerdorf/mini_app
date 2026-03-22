import type { CSSProperties } from "react";

export type EdoTone = "success" | "warning" | "danger" | "muted" | "info";

export type EdoStatusInfo = {
  raw: string;
  label: string;
  shortLabel: string;
  tone: EdoTone;
};

/** Ключи как в ответе 1С / PostB */
const EDO_STATUS_MAP: Record<string, Omit<EdoStatusInfo, "raw">> = {
  WaitingForRecipientSignature: {
    label: "Ожидает подписи получателя",
    shortLabel: "ОП",
    tone: "warning",
  },
  RecipientResponseStatusAccepted: {
    label: "Принят получателем",
    shortLabel: "П",
    tone: "success",
  },
  RecipientResponseStatusSigned: {
    label: "Подписан получателем",
    shortLabel: "П",
    tone: "success",
  },
  /** Для счёта (`СЧЕТ` / bill) тот же код API показываем как «Отправлен» — см. getInvoiceEdoInfoByDocLabel */
  RecipientResponseStatusNotAcceptable: {
    label: "Не принят получателем",
    shortLabel: "НП",
    tone: "danger",
  },
  RecipientResponseStatusRejected: {
    label: "Отклонен получателем",
    shortLabel: "НП",
    tone: "danger",
  },
  RecipientResponseStatusPartlySigned: {
    label: "Подписан частично",
    shortLabel: "П",
    tone: "success",
  },
};

const EMPTY_EDO: EdoStatusInfo = {
  raw: "",
  label: "Нет статуса ЭДО",
  shortLabel: "НС",
  tone: "muted",
};

function edoSlug(s: string): string {
  return s
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\s\u00A0_-]+/g, "");
}

/** Синонимы / человекочитаемые строки от API → ключ EDO_STATUS_MAP */
const SLUG_TO_CANONICAL: Record<string, keyof typeof EDO_STATUS_MAP> = {
  waitingforrecipientsignature: "WaitingForRecipientSignature",
  /**
   * «with recipient(s) signature» — по смыслу «есть подпись получателя» (подписан), не «ожидает».
   */
  withrecipientsignature: "RecipientResponseStatusSigned",
  withrecipientssignature: "RecipientResponseStatusSigned",
  awaitingrecipientsignature: "WaitingForRecipientSignature",
  waitingforrecipientsign: "WaitingForRecipientSignature",
  recipientresponsenotacceptable: "RecipientResponseStatusNotAcceptable",
  notacceptable: "RecipientResponseStatusNotAcceptable",
  recipientresponsestatusnotacceptable: "RecipientResponseStatusNotAcceptable",
  recipientresponsestatusaccepted: "RecipientResponseStatusAccepted",
  recipientresponsestatussigned: "RecipientResponseStatusSigned",
  recipientresponsestatusrejected: "RecipientResponseStatusRejected",
  recipientresponsestatuspartlysigned: "RecipientResponseStatusPartlySigned",
};

function resolveCanonicalKey(raw: string): keyof typeof EDO_STATUS_MAP | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (Object.prototype.hasOwnProperty.call(EDO_STATUS_MAP, trimmed)) {
    return trimmed as keyof typeof EDO_STATUS_MAP;
  }

  const slug = edoSlug(trimmed);
  if (SLUG_TO_CANONICAL[slug]) return SLUG_TO_CANONICAL[slug];

  // «With … signature» = подпись уже есть → подписан (П), не ожидание (ОП)
  if (/with\s+recipients?\s+signature/i.test(trimmed)) {
    return "RecipientResponseStatusSigned";
  }
  if (/waiting\s+for\s+recipient/i.test(trimmed) && /signature/i.test(trimmed)) {
    return "WaitingForRecipientSignature";
  }

  return null;
}

export function getEdoStatusInfo(raw: unknown): EdoStatusInfo {
  const key = String(raw ?? "").trim();
  if (!key) return { ...EMPTY_EDO };

  const canonical = resolveCanonicalKey(key);
  if (canonical) {
    return { raw: key, ...EDO_STATUS_MAP[canonical] };
  }

  return {
    raw: key,
    label: `Неизвестный статус: ${key}`,
    shortLabel: "?",
    tone: "info",
  };
}

function pickString(obj: any, keys: string[]): string {
  for (const key of keys) {
    const v = obj?.[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

export function getInvoiceEdoRawByDocLabel(item: any, docLabel: "ЭР" | "АПП" | "УПД" | "СЧЕТ" | "Реестр"): string {
  if (docLabel === "ЭР") {
    return pickString(item, [
      "DDRecipientResponseStatus_Raspiska",
      "ddRecipientResponseStatusRaspiska",
      "recipientResponseStatusRaspiska",
    ]);
  }
  if (docLabel === "АПП") {
    return pickString(item, [
      "DDRecipientResponseStatus_APP",
      "ddRecipientResponseStatusAPP",
      "recipientResponseStatusAPP",
    ]);
  }
  if (docLabel === "УПД") {
    return pickString(item, [
      "DDRecipientResponseStatus_UPD",
      "ddRecipientResponseStatusUPD",
      "recipientResponseStatusUPD",
    ]);
  }
  if (docLabel === "СЧЕТ") {
    return pickString(item, [
      "DDRecipientResponseStatus_bill",
      "ddRecipientResponseStatusBill",
      "recipientResponseStatusBill",
    ]);
  }
  return "";
}

export function getInvoiceEdoInfoByDocLabel(
  item: any,
  docLabel: "ЭР" | "АПП" | "УПД" | "СЧЕТ" | "Реестр",
): EdoStatusInfo {
  const raw = getInvoiceEdoRawByDocLabel(item, docLabel);
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return getEdoStatusInfo(raw);

  if (docLabel === "СЧЕТ") {
    const canonical = resolveCanonicalKey(trimmed);
    if (canonical === "RecipientResponseStatusNotAcceptable") {
      return {
        raw: trimmed,
        label: "Отправлен",
        shortLabel: "ОТ",
        tone: "info",
      };
    }
  }

  return getEdoStatusInfo(raw);
}

export function getInvoiceBillEdoInfo(item: any): EdoStatusInfo {
  return getInvoiceEdoInfoByDocLabel(item, "СЧЕТ");
}

/** Типы документов в счёте с полями DDRecipientResponseStatus_* */
export const INVOICE_EDO_MERGED_COLUMNS = ["ЭР", "АПП", "УПД", "СЧЕТ"] as const;
export type InvoiceEdoMergedDocLabel = (typeof INVOICE_EDO_MERGED_COLUMNS)[number];

/** Подписан по ЭДО: зелёный бейдж «П» (success) */
export function isInvoiceEdoSigned(info: EdoStatusInfo): boolean {
  return Boolean(info.raw) && info.tone === "success";
}

export type InvoiceEdoDocAgg = { signed: number; total: number };

/** По списку счетов: для каждого типа документа — сколько с непустым статусом ЭДО и сколько из них подписаны (success). */
export function aggregateInvoiceEdoDocStats(invoices: any[] | undefined | null): Record<InvoiceEdoMergedDocLabel, InvoiceEdoDocAgg> {
  const out: Record<InvoiceEdoMergedDocLabel, InvoiceEdoDocAgg> = {
    ЭР: { signed: 0, total: 0 },
    АПП: { signed: 0, total: 0 },
    УПД: { signed: 0, total: 0 },
    СЧЕТ: { signed: 0, total: 0 },
  };
  for (const inv of invoices || []) {
    for (const label of INVOICE_EDO_MERGED_COLUMNS) {
      const info = getInvoiceEdoInfoByDocLabel(inv, label);
      if (!info.raw) continue;
      out[label].total += 1;
      if (isInvoiceEdoSigned(info)) out[label].signed += 1;
    }
  }
  return out;
}

/** Отображение «3/10» — подписано / всего с известным статусом ЭДО по этому типу документа */
export function formatEdoSignedRatio(signed: number, total: number): string {
  if (total <= 0) return "—";
  return `${signed}/${total}`;
}

/** Фон/бордер мини-бейджа ЭДО по тону */
export function edoToneSurfaceStyle(tone: EdoTone): CSSProperties {
  if (tone === "success") return { background: "rgba(34,197,94,0.2)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.35)" };
  if (tone === "warning") return { background: "rgba(234,179,8,0.2)", color: "#ca8a04", border: "1px solid rgba(202,138,4,0.35)" };
  if (tone === "danger") return { background: "rgba(239,68,68,0.2)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.35)" };
  if (tone === "info") return { background: "rgba(59,130,246,0.15)", color: "var(--color-primary-blue)", border: "1px solid rgba(59,130,246,0.35)" };
  return { background: "var(--color-panel-secondary)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" };
}

/**
 * Мини-бейдж ОП/П/НП/ОТ/НС внутри кнопок скачивания ЭР/АПП/СЧЕТ/УПД.
 * Класс `edo-doc-download-btn` на кнопке — уменьшенные отступы и иконка (см. styles.css).
 */
export function edoDocButtonMiniBadgeStyle(tone: EdoTone): CSSProperties {
  return {
    fontSize: "0.54rem",
    fontWeight: 700,
    lineHeight: 1,
    padding: "0.04rem 0.16rem",
    borderRadius: "999px",
    whiteSpace: "nowrap",
    ...edoToneSurfaceStyle(tone),
  };
}

/** Легенда ЭДО под кнопками в модалках */
export function edoLegendBadgeStyle(tone: EdoTone): CSSProperties {
  return {
    fontSize: "0.58rem",
    fontWeight: 700,
    lineHeight: 1,
    padding: "0.06rem 0.2rem",
    borderRadius: "999px",
    ...edoToneSurfaceStyle(tone),
  };
}

/** Колонка «ЭДО» в таблицах раздела Документы */
export function edoTableCellBadgeStyle(tone: EdoTone): CSSProperties {
  return {
    fontSize: "0.58rem",
    fontWeight: 600,
    padding: "0.06rem 0.2rem",
    borderRadius: "999px",
    whiteSpace: "nowrap",
    display: "inline-block",
    ...edoToneSurfaceStyle(tone),
  };
}

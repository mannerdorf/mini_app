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
  RecipientSignatureRequestRejected: {
    label: "Запрос подписи отклонен получателем",
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
  label: "Нет статуса",
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
  recipientsignaturerequestrejected: "RecipientSignatureRequestRejected",
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

/** Поля статуса ЭДО в кэше договоров и актов сверки (GETdogovors / GETsverki). */
const CACHED_DOC_EDO_STATUS_KEYS = [
  "RecipientResponseStatus",
  "recipientResponseStatus",
  "DDRecipientResponseStatus",
  "ddRecipientResponseStatus",
  "EdoStatus",
  "edoStatus",
  "EdoState",
  "EDO",
  "StatusEDO",
  "ЭДО",
  "DocumentStatus",
  "documentStatus",
] as const;

function pickCachedDocEdoString(obj: Record<string, unknown>): string {
  for (const key of CACHED_DOC_EDO_STATUS_KEYS) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/** Сырой код статуса ЭДО из `data` записи кэша договора / акта сверки. */
export function getCachedDocumentEdoRaw(data: unknown): string {
  if (!data || typeof data !== "object" || Array.isArray(data)) return "";
  return pickCachedDocEdoString(data as Record<string, unknown>);
}

/** Статус ЭДО для договора или акта сверки (маппинг как у счетов). */
export function getCachedDocumentEdoInfo(data: unknown): EdoStatusInfo {
  return getEdoStatusInfo(getCachedDocumentEdoRaw(data));
}

/** Фильтр «Статус ЭДО» для договоров / актов сверки. */
export function cachedDocumentMatchesEdoStatusFilter(data: unknown, filterSet: Set<string>): boolean {
  if (filterSet.size === 0) return true;
  return filterSet.has(getCachedDocumentEdoInfo(data).label);
}

/** Уникальные подписи статусов ЭДО из кэша договоров или актов сверки. */
export function collectUniqueCachedDocumentEdoLabels(
  rows: Array<{ data?: unknown }> | undefined | null,
): string[] {
  const set = new Set<string>();
  for (const row of rows || []) {
    set.add(getCachedDocumentEdoInfo(row?.data).label);
  }
  return [...set].sort((a, b) => {
    if (a === EMPTY_EDO.label) return 1;
    if (b === EMPTY_EDO.label) return -1;
    return a.localeCompare(b, "ru");
  });
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

/** Подписи статусов ЭДО по колонкам таблицы (как в мониторе / раскрытии счёта). */
export function collectInvoiceEdoTableLabels(item: any): string[] {
  return INVOICE_EDO_MERGED_COLUMNS.map((col) => getInvoiceEdoInfoByDocLabel(item, col).label);
}

/** Фильтр «Статус ЭДО»: счёт подходит, если хотя бы одна колонка совпадает с выбранным статусом. */
export function invoiceMatchesEdoStatusFilter(item: any, filterSet: Set<string>): boolean {
  if (filterSet.size === 0) return true;
  return collectInvoiceEdoTableLabels(item).some((label) => filterSet.has(label));
}

/** Уникальные статусы ЭДО из списка счетов (все колонки таблицы). */
export function collectUniqueInvoiceEdoTableLabels(invoices: any[] | undefined | null): string[] {
  const set = new Set<string>();
  for (const inv of invoices || []) {
    collectInvoiceEdoTableLabels(inv).forEach((label) => set.add(label));
  }
  return [...set].sort((a, b) => {
    if (a === EMPTY_EDO.label) return 1;
    if (b === EMPTY_EDO.label) return -1;
    return a.localeCompare(b, "ru");
  });
}

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

export type EdoHealthSummary = {
  byDoc: Record<InvoiceEdoMergedDocLabel, InvoiceEdoDocAgg>;
  signed: number;
  total: number;
  /** 0–100 или null, если нет статусов ЭДО */
  percent: number | null;
  pending: number;
  issues: number;
  invoiceCount: number;
};

/** Сводка «здоровья ЭДО» для компактного виджета на главной */
export function computeEdoHealthSummary(invoices: any[] | undefined | null): EdoHealthSummary {
  const byDoc = aggregateInvoiceEdoDocStats(invoices);
  let signed = 0;
  let total = 0;
  let pending = 0;
  let issues = 0;
  for (const label of INVOICE_EDO_MERGED_COLUMNS) {
    signed += byDoc[label].signed;
    total += byDoc[label].total;
  }
  for (const inv of invoices || []) {
    for (const label of INVOICE_EDO_MERGED_COLUMNS) {
      const info = getInvoiceEdoInfoByDocLabel(inv, label);
      if (!info.raw) continue;
      if (info.tone === "warning") pending += 1;
      if (info.tone === "danger") issues += 1;
    }
  }
  const percent = total > 0 ? Math.round((signed / total) * 100) : null;
  return {
    byDoc,
    signed,
    total,
    percent,
    pending,
    issues,
    invoiceCount: (invoices || []).length,
  };
}

export function edoHealthPercentColor(percent: number): string {
  if (percent >= 90) return "#22c55e";
  if (percent >= 70) return "#10b981";
  if (percent >= 50) return "#f59e0b";
  return "#ef4444";
}

export function edoHealthStatusLabel(percent: number | null, issues: number): string {
  if (percent == null) return "Нет данных";
  if (issues > 0 && percent < 70) return "Риск";
  if (issues > 0 || percent < 50) return "Внимание";
  if (percent >= 90) return "Отлично";
  if (percent >= 70) return "Хорошо";
  return "Норма";
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
    fontSize: "0.5rem",
    fontWeight: 600,
    lineHeight: 1.1,
    padding: "0.04rem 0.2rem",
    borderRadius: "999px",
    maxWidth: "7.5rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
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

/** Текст статуса в таблице (без «ЭДО» и без сокращений) */
export function getEdoTableDisplayLabel(info: EdoStatusInfo): string {
  if (!info.raw) return "Нет статуса";
  return info.label;
}

/** Короткая подпись на плитке: «ЭР П», «Сч —» */
export function getEdoCardCompactLabel(docLabel: InvoiceEdoMergedDocLabel, info: EdoStatusInfo): string {
  const prefix = docLabel === "СЧЕТ" ? "Сч" : docLabel;
  if (!info.raw) return `${prefix} —`;
  return `${prefix} ${info.shortLabel}`;
}

/** Подпись на карточке: полный статус с префиксом «ЭДО» */
export function getEdoCardDisplayLabel(info: EdoStatusInfo): string {
  return `ЭДО ${getEdoTableDisplayLabel(info)}`;
}

export function edoToneTextColor(tone: EdoTone): string {
  if (tone === "success") return "#22c55e";
  if (tone === "warning") return "#ca8a04";
  if (tone === "danger") return "#ef4444";
  if (tone === "info") return "var(--color-primary-blue)";
  return "var(--color-text-secondary)";
}

/** Таблица: обычный текст, цвет по тону */
export function edoTableCellTextStyle(tone: EdoTone): CSSProperties {
  return {
    fontSize: "0.8rem",
    fontWeight: 500,
    whiteSpace: "nowrap",
    color: edoToneTextColor(tone),
  };
}

/** Карточка: цвет фона/рамки бейджа (без позиционирования) */
export function edoCardBadgeSurfaceStyle(tone: EdoTone): CSSProperties {
  return edoToneSurfaceStyle(tone);
}

/** @deprecated Используйте edoCardBadgeSurfaceStyle + CSS-класс documents-edo-card-badge */
export function edoCardCornerBadgeStyle(tone: EdoTone): CSSProperties {
  return edoCardBadgeSurfaceStyle(tone);
}

/** Пункты легенды в модалках (без сокращений ОП/П/НП) */
export const EDO_LEGEND_ITEMS: ReadonlyArray<{ tone: EdoTone; label: string }> = [
  { tone: "warning", label: "Ожидает подписи получателя" },
  { tone: "success", label: "Принят или подписан получателем" },
  { tone: "danger", label: "Не принят (ЭР, АПП, УПД)" },
  { tone: "info", label: "Отправлен (счёт)" },
  { tone: "muted", label: "Нет статуса" },
] as const;

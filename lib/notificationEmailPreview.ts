import type { Pool } from "pg";
import { emailBodyStyle, HAULZ_EMAIL_HEAD_LINKS } from "./emailTypography.js";
import { HAULZ_EMAIL_BRAND_BAR_ATTRS, renderWeeklySummaryFooterHtml } from "./emailSummaryFooter.js";
import {
  type EmailNotificationEventId,
  EMAIL_NOTIFICATION_EVENTS,
} from "./notificationEmailPrefs.js";
import {
  CARGO_NOTIFICATION_STAGES,
  CARGO_STAGE_EVENT_IDS,
  formatTelegramMessage,
  getCargoStageEventIdFromState,
  getPaymentKey,
  type CargoEvent,
  type CargoStageEventId,
} from "./notificationPoll.js";
import { perevozkiItemInn } from "../api/perevozki.js";
import { readCacheRow } from "./documentCacheRefreshCore.js";
import {
  buildWeeklySummaryData,
  getPreviousCalendarWeekRange,
  renderWeeklySummaryHtml,
} from "./weeklySummary.js";
import { formatDailySummaryPlainText } from "./notificationDailySummary.js";

export type NotificationEmailPreviewKind = EmailNotificationEventId;

export const NOTIFICATION_EMAIL_PREVIEW_KINDS: Array<{ id: NotificationEmailPreviewKind; label: string; group: string }> = [
  { id: "weekly_summary", label: "Еженедельная сводка", group: "Сводка" },
  { id: "daily_summary", label: "Ежедневная сводка", group: "Сводка" },
  ...CARGO_NOTIFICATION_STAGES.map((s) => ({ id: s.id as NotificationEmailPreviewKind, label: s.label, group: "Перевозки" })),
  { id: "bill_created", label: "Создан счёт", group: "Документы" },
  { id: "bill_paid", label: "Счёт оплачен", group: "Документы" },
];

function normalizeInnCanon(inn: string): string {
  return String(inn ?? "").replace(/\D/g, "").trim() || String(inn ?? "").trim();
}

function itemInnMatches(item: Record<string, unknown>, inn: string): boolean {
  const canon = normalizeInnCanon(inn);
  const itemCanon = normalizeInnCanon(perevozkiItemInn(item));
  return !!canon && (itemCanon === canon || String(perevozkiItemInn(item)).trim() === inn.trim());
}

function invoiceInn(item: Record<string, unknown>): string {
  const v = item.INN ?? item.Inn ?? item.inn ?? "";
  return normalizeInnCanon(String(v));
}

function cargoNumber(item: Record<string, unknown>): string {
  return String(item.Number ?? item.number ?? item.Номер ?? "—").trim() || "—";
}

function normalizeStatus(state: unknown): string {
  const s = String(state ?? "").trim();
  return s || "Без статуса";
}

function invoiceSum(item: Record<string, unknown>): number {
  const v = item.SumDoc ?? item.Sum ?? item.sum ?? item.Amount ?? 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function statusMatchesEvent(status: string, event: CargoEvent): boolean {
  if (event === "bill_created" || event === "bill_paid") return false;
  return getCargoStageEventIdFromState(status) === event;
}

function renderSimpleNotificationEmail(params: {
  targetLogin: string;
  headerTitle: string;
  headerSubtitle: string;
  companyLine: string;
  bodyHtml: string;
  previewNote?: string;
}): string {
  const note = params.previewNote
    ? `<p style="margin:0 0 14px;padding:10px 12px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;font-size:12px;color:#92400e;line-height:1.45;">${params.previewNote}</p>`
    : "";
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">${HAULZ_EMAIL_HEAD_LINKS}</head>
<body style="${emailBodyStyle()}">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#fff;">
    <tr><td ${HAULZ_EMAIL_BRAND_BAR_ATTRS}>
      <div style="font-size:22px;font-weight:700;">HAULZ</div>
      <div style="font-size:14px;opacity:0.9;margin-top:4px;">${params.headerTitle}</div>
      <div style="font-size:13px;opacity:0.85;margin-top:6px;">${params.headerSubtitle}</div>
    </td></tr>
    <tr><td style="padding:20px;">
      ${note}
      <p style="margin:0 0 10px;font-size:14px;color:#4b5563;">${params.companyLine}</p>
      ${params.bodyHtml}
    </td></tr>
    ${renderWeeklySummaryFooterHtml(params.targetLogin)}
  </table>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function loadCargoForInn(pool: Pool, inn: string): Promise<Record<string, unknown>[]> {
  const rows = await readCacheRow(pool, "cache_perevozki");
  return (rows as Record<string, unknown>[]).filter((item) => itemInnMatches(item, inn));
}

async function loadInvoicesForInn(pool: Pool, inn: string): Promise<Record<string, unknown>[]> {
  const rows = await readCacheRow(pool, "cache_invoices");
  return (rows as Record<string, unknown>[]).filter((item) => invoiceInn(item) === normalizeInnCanon(inn));
}

function findCargoSample(items: Record<string, unknown>[], event: CargoStageEventId): Record<string, unknown> | null {
  for (const item of items) {
    if (statusMatchesEvent(normalizeStatus(item.State), event)) return item;
  }
  return items[0] ?? null;
}

function findInvoiceSample(items: Record<string, unknown>[], paid: boolean): Record<string, unknown> | null {
  for (const item of items) {
    const key = getPaymentKey(String(item.StateBill ?? item.Status ?? item.State ?? ""));
    if (paid && key === "paid") return item;
    if (!paid && key !== "paid") return item;
  }
  return items[0] ?? null;
}

const DEMO_CARGO_STATES: Record<CargoStageEventId, string> = {
  info_received: "Получена информация",
  received_at_warehouse: "Получена на складе",
  measured: "Измерена",
  consolidation: "Консолидация",
  loaded: "Загружена в ТС",
  sent: "Отправлена",
  arrived: "Прибыла в город назначения",
  delivery_scheduled: "Запланирована доставка",
  delivered: "Доставлена",
};

function demoCargo(event: CargoStageEventId): Record<string, unknown> {
  return {
    Number: "0000-123456",
    State: DEMO_CARGO_STATES[event],
    Mest: 3,
    PW: 120,
    W: 95,
    Value: 0.8,
    Sender: "ООО Пример",
    Receiver: "ООО Получатель",
  };
}

function demoInvoice(paid: boolean): Record<string, unknown> {
  return {
    NumberBill: "СЧ-001234",
    DateBill: new Date().toISOString().slice(0, 10),
    SumDoc: 45000,
    SumNDS: 7500,
    StateBill: paid ? "Оплачен" : "Не оплачен",
  };
}

async function buildDailySummaryPreview(
  pool: Pool,
  params: { targetLogin: string; inn: string; companyName: string },
): Promise<{ html: string; subject: string }> {
  const cargoItems = await loadCargoForInn(pool, params.inn);
  const invoiceItems = await loadInvoicesForInn(pool, params.inn);

  const activeStatusCounts = new Map<string, number>();
  for (const item of cargoItems) {
    const status = normalizeStatus(item.State);
    const lower = status.toLowerCase();
    if (lower.includes("достав") || lower.includes("заверш")) continue;
    activeStatusCounts.set(status, (activeStatusCounts.get(status) || 0) + 1);
  }

  let unpaidCount = 0;
  let unpaidSum = 0;
  for (const inv of invoiceItems) {
    if (getPaymentKey(String(inv.StateBill ?? inv.Status ?? inv.State ?? "")) === "paid") continue;
    unpaidCount += 1;
    unpaidSum += invoiceSum(inv);
  }

  const summaryText = formatDailySummaryPlainText({ activeStatusCounts, unpaidCount, unpaidSum });
  const summaryLines = summaryText.split("\n").map((line) => {
    const colonIdx = line.indexOf(":");
    const label = colonIdx >= 0 ? line.slice(0, colonIdx + 1) : line;
    const value = colonIdx >= 0 ? line.slice(colonIdx + 1).trim() : "";
    return `<div style="font-size:14px;color:#111827;line-height:1.6;"><span style="font-weight:600;">${escapeHtml(label)}</span> ${escapeHtml(value)}</div>`;
  }).join("");
  const companyLine = `${escapeHtml(params.companyName || params.inn)}${params.inn ? ` (ИНН ${escapeHtml(params.inn)})` : ""}`;

  const bodyHtml = `
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding:12px;background:#f8fafc;border-radius:8px;">
        ${summaryLines}
      </td></tr>
    </table>`;

  const html = renderSimpleNotificationEmail({
    targetLogin: params.targetLogin,
    headerTitle: "Ежедневная сводка",
    headerSubtitle: new Date().toLocaleDateString("ru-RU"),
    companyLine,
    bodyHtml,
    previewNote: cargoItems.length === 0 && invoiceItems.length === 0 ? "Пример на демо-данных — в кэше нет записей для выбранного ИНН." : undefined,
  });

  return { html, subject: "HAULZ: ежедневная сводка" };
}

async function buildCargoEventPreview(
  pool: Pool,
  event: CargoStageEventId,
  params: { targetLogin: string; inn: string; companyName: string },
): Promise<{ html: string; subject: string }> {
  const items = await loadCargoForInn(pool, params.inn);
  let sample = findCargoSample(items, event);
  let demo = false;
  if (!sample) {
    sample = demoCargo(event);
    demo = true;
  }
  const text = formatTelegramMessage(event, cargoNumber(sample), sample);
  const title = CARGO_NOTIFICATION_STAGES.find((s) => s.id === event)?.label ?? event;
  const bodyHtml = `<p style="margin:0;font-size:15px;color:#111827;line-height:1.55;">${escapeHtml(text)}</p>`;
  const html = renderSimpleNotificationEmail({
    targetLogin: params.targetLogin,
    headerTitle: title,
    headerSubtitle: `№ ${escapeHtml(cargoNumber(sample))}`,
    companyLine: `${escapeHtml(params.companyName || params.inn)} (ИНН ${escapeHtml(params.inn)})`,
    bodyHtml,
    previewNote: demo ? "Пример на демо-данных — подходящая перевозка не найдена в кэше для этого ИНН." : undefined,
  });
  return { html, subject: `HAULZ: ${title.toLowerCase()} № ${cargoNumber(sample)}` };
}

async function buildBillEventPreview(
  pool: Pool,
  event: "bill_created" | "bill_paid",
  params: { targetLogin: string; inn: string; companyName: string },
): Promise<{ html: string; subject: string }> {
  const items = await loadInvoicesForInn(pool, params.inn);
  let sample = findInvoiceSample(items, event === "bill_paid");
  let demo = false;
  if (!sample) {
    sample = demoInvoice(event === "bill_paid");
    demo = true;
  }
  const text = formatTelegramMessage(event, cargoNumber(sample), sample as Parameters<typeof formatTelegramMessage>[2]);
  const title = event === "bill_created" ? "Создан счёт" : "Счёт оплачен";
  const bodyHtml = `<p style="margin:0;font-size:15px;color:#111827;line-height:1.55;">${escapeHtml(text)}</p>`;
  const html = renderSimpleNotificationEmail({
    targetLogin: params.targetLogin,
    headerTitle: title,
    headerSubtitle: params.companyName ? escapeHtml(params.companyName) : `ИНН ${escapeHtml(params.inn)}`,
    companyLine: `${escapeHtml(params.companyName || params.inn)} (ИНН ${escapeHtml(params.inn)})`,
    bodyHtml,
    previewNote: demo ? "Пример на демо-данных — счёт не найден в кэше для этого ИНН." : undefined,
  });
  return { html, subject: `HAULZ: ${title.toLowerCase()}` };
}

export function isNotificationEmailPreviewKind(v: unknown): v is NotificationEmailPreviewKind {
  return EMAIL_NOTIFICATION_EVENTS.includes(String(v ?? "").trim() as NotificationEmailPreviewKind);
}

export async function buildNotificationEmailPreview(
  pool: Pool,
  params: {
    kind: NotificationEmailPreviewKind;
    targetLogin: string;
    inn: string;
    companyName?: string;
    dateFrom?: string;
    dateTo?: string;
  },
): Promise<{ html: string; subject: string; kind: NotificationEmailPreviewKind }> {
  const kind = params.kind;
  const targetLogin = String(params.targetLogin || "").trim().toLowerCase();
  const inn = String(params.inn || "").trim();
  const companyName = String(params.companyName || "").trim() || inn;

  if (kind === "weekly_summary") {
    const defaultPeriod = getPreviousCalendarWeekRange();
    const dateFrom = params.dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(params.dateFrom) ? params.dateFrom : defaultPeriod.dateFrom;
    const dateTo = params.dateTo && /^\d{4}-\d{2}-\d{2}$/.test(params.dateTo) ? params.dateTo : defaultPeriod.dateTo;
    const data = await buildWeeklySummaryData(pool, { inn, companyName, targetLogin, dateFrom, dateTo });
    return {
      kind,
      html: renderWeeklySummaryHtml(data),
      subject: `HAULZ: сводка за ${data.periodLabel}`,
    };
  }

  if (kind === "daily_summary") {
    const r = await buildDailySummaryPreview(pool, { targetLogin, inn, companyName });
    return { kind, ...r };
  }

  if ((CARGO_STAGE_EVENT_IDS as readonly string[]).includes(kind)) {
    const r = await buildCargoEventPreview(pool, kind as CargoStageEventId, { targetLogin, inn, companyName });
    return { kind, ...r };
  }

  if (kind === "bill_created" || kind === "bill_paid") {
    const r = await buildBillEventPreview(pool, kind, { targetLogin, inn, companyName });
    return { kind, ...r };
  }

  throw new Error(`Неизвестный тип письма: ${kind}`);
}

import type { Pool } from "pg";
import { HAULZ_EMAIL_BRAND_BAR_ATTRS } from "./emailSummaryFooter.js";
import {
  emailBodyStyle,
  emailSectionTitleStyle,
  emailTableBodyCellStyle,
  emailTableHeadCellStyle,
  HAULZ_EMAIL_HEAD_LINKS,
} from "./emailTypography.js";
import { sendHaulzEmail } from "./sendRegistrationEmail.js";

export type SummaryCronCriteriaLike = {
  acceptance: boolean;
  delivery: boolean;
  unpaid_invoices: boolean;
};

export type SummaryCronSendJobLike = {
  period: { dateFrom: string; dateTo: string };
  recipients: Array<{ targetLogin: string; inn: string; reasons: string[] }>;
  startedAt: string;
  updatedAt: string;
  sent: number;
  failed: number;
  skippedUnsubscribed?: number;
  errors: Array<{ targetLogin: string; inn: string; error: string }>;
};

export const HAULZ_SUMMARY_OPS_EMAIL = "info@haulz.pro";

export type SummaryDispatchTrigger = "auto" | "manual";

export type SummaryDispatchReport = {
  trigger: SummaryDispatchTrigger;
  status: string;
  period: { dateFrom: string; dateTo: string };
  criteria: SummaryCronCriteriaLike;
  startedAt: string;
  finishedAt: string;
  recipientsTotal: number;
  uniqueUsers: number;
  uniqueCompanies: number;
  sent: number;
  failed: number;
  skippedUnsubscribed: number;
  reasonBreakdown: { acceptance: number; delivery: number; unpaid: number };
  errors: Array<{ targetLogin: string; inn: string; error: string }>;
  trackingOpens?: number;
  trackingClicks?: number;
  trackingOpenedEmails?: number;
  trackingClickedEmails?: number;
};

function formatRuDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRuPeriodDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms} мс`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec} с`;
  const min = Math.floor(sec / 60);
  const rest = sec % 60;
  return rest > 0 ? `${min} мин ${rest} с` : `${min} мин`;
}

function criteriaLabels(c: SummaryCronCriteriaLike): string {
  const parts: string[] = [];
  if (c.acceptance) parts.push("приёмки");
  if (c.delivery) parts.push("доставки");
  if (c.unpaid_invoices) parts.push("неоплаченные и частично оплаченные счета");
  return parts.length ? parts.join(", ") : "—";
}

function statusLabel(status: string): string {
  if (status === "ok") return "Успешно";
  if (status === "partial") return "Частично (есть ошибки)";
  if (status === "failed") return "Ошибка";
  return status;
}

function triggerLabel(trigger: SummaryDispatchTrigger): string {
  return trigger === "manual" ? "Ручная («Отправить сейчас»)" : "Автоматическая (cron)";
}

export function buildDispatchReportFromJob(
  job: SummaryCronSendJobLike,
  criteria: SummaryCronCriteriaLike,
  status: string,
  trigger: SummaryDispatchTrigger,
): SummaryDispatchReport {
  const users = new Set<string>();
  const companies = new Set<string>();
  let acceptance = 0;
  let delivery = 0;
  let unpaid = 0;

  for (const r of job.recipients) {
    users.add(r.targetLogin.toLowerCase());
    companies.add(r.inn);
    if (r.reasons.some((x) => x.includes("приём"))) acceptance += 1;
    if (r.reasons.some((x) => x.includes("достав"))) delivery += 1;
    if (r.reasons.some((x) => x.includes("счет") || x.includes("счёт"))) unpaid += 1;
  }

  return {
    trigger,
    status,
    period: job.period,
    criteria,
    startedAt: job.startedAt,
    finishedAt: job.updatedAt,
    recipientsTotal: job.recipients.length,
    uniqueUsers: users.size,
    uniqueCompanies: companies.size,
    sent: job.sent,
    failed: job.failed,
    skippedUnsubscribed: job.skippedUnsubscribed ?? 0,
    reasonBreakdown: { acceptance, delivery, unpaid },
    errors: job.errors.slice(0, 20),
  };
}

function statRow(label: string, value: string): string {
  const body = emailTableBodyCellStyle();
  return `<tr>
    <td style="${body}color:#6b7280;width:42%;">${label}</td>
    <td style="${body}font-weight:600;">${value}</td>
  </tr>`;
}

export function renderSummaryDispatchReportHtml(report: SummaryDispatchReport): string {
  const duration = formatDurationMs(
    Math.max(0, new Date(report.finishedAt).getTime() - new Date(report.startedAt).getTime()),
  );
  const periodLabel = `${formatRuPeriodDate(report.period.dateFrom)} — ${formatRuPeriodDate(report.period.dateTo)}`;
  const head = emailTableHeadCellStyle();
  const body = emailTableBodyCellStyle();

  const errorRows =
    report.errors.length === 0
      ? `<p style="margin:8px 0 0;font-size:13px;color:#6b7280;">Ошибок нет.</p>`
      : `<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;border-collapse:collapse;">
          <thead><tr style="background:#f9fafb;">
            <th style="${head}">Логин</th>
            <th style="${head}">ИНН</th>
            <th style="${head}">Ошибка</th>
          </tr></thead>
          <tbody>${report.errors
            .map(
              (e) => `<tr>
                <td style="${body}">${e.targetLogin}</td>
                <td style="${body}">${e.inn}</td>
                <td style="${body}color:#b91c1c;">${e.error}</td>
              </tr>`,
            )
            .join("")}</tbody>
        </table>`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">${HAULZ_EMAIL_HEAD_LINKS}</head>
<body style="${emailBodyStyle()}">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#fff;">
    <tr><td ${HAULZ_EMAIL_BRAND_BAR_ATTRS}>
      <div style="font-size:22px;font-weight:700;">HAULZ</div>
      <div style="font-size:14px;opacity:0.9;margin-top:4px;">Отчёт о рассылке «Самери»</div>
    </td></tr>
    <tr><td style="padding:20px;">
      <p style="margin:0 0 14px;font-size:14px;color:#4b5563;line-height:1.5;">
        Сводка по массовой рассылке партнёрских писем (пользователь + контрагент).
      </p>
      <p style="${emailSectionTitleStyle()}">Параметры запуска</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        ${statRow("Тип запуска", triggerLabel(report.trigger))}
        ${statRow("Статус", statusLabel(report.status))}
        ${statRow("Период в письмах", periodLabel)}
        ${statRow("Критерии выборки", criteriaLabels(report.criteria))}
        ${statRow("Начало (МСК)", formatRuDateTime(report.startedAt))}
        ${statRow("Завершение (МСК)", formatRuDateTime(report.finishedAt))}
        ${statRow("Длительность", duration)}
      </table>

      <p style="${emailSectionTitleStyle()}margin-top:18px;">Статистика рассылки</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        ${statRow("В выборке (писем)", String(report.recipientsTotal))}
        ${statRow("Уникальных пользователей", String(report.uniqueUsers))}
        ${statRow("Уникальных контрагентов", String(report.uniqueCompanies))}
        ${statRow("Отправлено успешно", String(report.sent))}
        ${statRow("Ошибок отправки", String(report.failed))}
        ${statRow("Пропущено (отписка)", String(report.skippedUnsubscribed))}
        ${statRow("С приёмками за период", String(report.reasonBreakdown.acceptance))}
        ${statRow("С доставками за период", String(report.reasonBreakdown.delivery))}
        ${statRow("С неоплаченными/частичными счетами", String(report.reasonBreakdown.unpaid))}
      </table>

      ${
        report.trackingOpens != null
          ? `<p style="${emailSectionTitleStyle()}margin-top:18px;">Трекинг писем (пиксель и ссылки)</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        ${statRow("Уникальных открытий (писем)", String(report.trackingOpenedEmails ?? 0))}
        ${statRow("Всего загрузок пикселя", String(report.trackingOpens ?? 0))}
        ${statRow("Уникальных с кликом", String(report.trackingClickedEmails ?? 0))}
        ${statRow("Всего кликов", String(report.trackingClicks ?? 0))}
      </table>`
          : ""
      }

      <p style="${emailSectionTitleStyle()}margin-top:18px;">Ошибки (до 20)</p>
      ${errorRows}
    </td></tr>
  </table>
</body></html>`;
}

export async function sendSummaryDispatchReportEmail(
  pool: Pool,
  report: SummaryDispatchReport,
): Promise<{ ok: boolean; error?: string }> {
  const periodLabel = `${formatRuPeriodDate(report.period.dateFrom)} — ${formatRuPeriodDate(report.period.dateTo)}`;
  const subject = `HAULZ: отчёт о рассылке «Самери» (${periodLabel}) — ${statusLabel(report.status)}`;
  const html = renderSummaryDispatchReportHtml(report);
  return sendHaulzEmail(pool, {
    to: HAULZ_SUMMARY_OPS_EMAIL,
    subject,
    html,
  });
}

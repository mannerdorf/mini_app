import type { Pool } from "pg";
import type { SummaryCronCriteria, SummaryCronRecipient, SummaryCronSendJob } from "./haulzSummaryCron.js";

export type DispatchLogRow = {
  id: number;
  startedAt: string;
  finishedAt: string | null;
  updatedAt: string;
  trigger: "auto" | "manual";
  status: string;
  period: { dateFrom: string; dateTo: string };
  criteria: SummaryCronCriteria;
  recipientsTotal: number;
  uniqueUsers: number;
  uniqueCompanies: number;
  sent: number;
  failed: number;
  skippedUnsubscribed: number;
  cursorPos: number;
  reasonBreakdown: { acceptance: number; delivery: number; unpaid: number };
  errors: Array<{ targetLogin: string; inn: string; error: string }>;
  progressPct: number;
  isRunning: boolean;
  trackingOpens: number;
  trackingClicks: number;
  trackingOpenedEmails: number;
  trackingClickedEmails: number;
};

function reasonBreakdownFromRecipients(recipients: SummaryCronRecipient[]) {
  let acceptance = 0;
  let delivery = 0;
  let unpaid = 0;
  for (const r of recipients) {
    if (r.reasons.some((x) => x.includes("приём"))) acceptance += 1;
    if (r.reasons.some((x) => x.includes("достав"))) delivery += 1;
    if (r.reasons.some((x) => x.includes("счет") || x.includes("счёт"))) unpaid += 1;
  }
  return { acceptance, delivery, unpaid };
}

function countUnique(recipients: SummaryCronRecipient[]) {
  const users = new Set<string>();
  const companies = new Set<string>();
  for (const r of recipients) {
    users.add(r.targetLogin.toLowerCase());
    companies.add(r.inn);
  }
  return { uniqueUsers: users.size, uniqueCompanies: companies.size };
}

function mapRow(row: Record<string, unknown>): DispatchLogRow {
  const recipientsTotal = Number(row.recipients_total) || 0;
  const cursorPos = Number(row.cursor_pos) || 0;
  const finishedAt = row.finished_at ? new Date(String(row.finished_at)).toISOString() : null;
  const status = String(row.status ?? "");
  const isRunning = !finishedAt && status === "running";
  const progressPct =
    recipientsTotal > 0 ? Math.min(100, Math.round((cursorPos / recipientsTotal) * 100)) : isRunning ? 0 : 100;
  const criteriaRaw = row.criteria;
  const criteria =
    criteriaRaw && typeof criteriaRaw === "object"
      ? (criteriaRaw as SummaryCronCriteria)
      : { acceptance: true, delivery: true, unpaid_invoices: true };
  const rbRaw = row.reason_breakdown;
  const reasonBreakdown =
    rbRaw && typeof rbRaw === "object"
      ? {
          acceptance: Number((rbRaw as Record<string, unknown>).acceptance) || 0,
          delivery: Number((rbRaw as Record<string, unknown>).delivery) || 0,
          unpaid: Number((rbRaw as Record<string, unknown>).unpaid) || 0,
        }
      : { acceptance: 0, delivery: 0, unpaid: 0 };
  const errors = Array.isArray(row.errors)
    ? (row.errors as Array<{ targetLogin: string; inn: string; error: string }>)
    : [];

  return {
    id: Number(row.id),
    startedAt: new Date(String(row.started_at)).toISOString(),
    finishedAt,
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    trigger: String(row.trigger) === "manual" ? "manual" : "auto",
    status,
    period: {
      dateFrom: String(row.period_from).slice(0, 10),
      dateTo: String(row.period_to).slice(0, 10),
    },
    criteria,
    recipientsTotal,
    uniqueUsers: Number(row.unique_users) || 0,
    uniqueCompanies: Number(row.unique_companies) || 0,
    sent: Number(row.sent) || 0,
    failed: Number(row.failed) || 0,
    skippedUnsubscribed: Number(row.skipped_unsubscribed) || 0,
    cursorPos,
    reasonBreakdown,
    errors,
    progressPct,
    isRunning,
    trackingOpens: 0,
    trackingClicks: 0,
    trackingOpenedEmails: 0,
    trackingClickedEmails: 0,
  };
}

export async function insertDispatchLog(
  pool: Pool,
  job: SummaryCronSendJob,
  criteria: SummaryCronCriteria,
): Promise<number> {
  const uniq = countUnique(job.recipients);
  const rb = reasonBreakdownFromRecipients(job.recipients);
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO haulz_summary_dispatch_log (
       started_at, updated_at, trigger, status, period_from, period_to, criteria,
       recipients_total, unique_users, unique_companies, sent, failed, skipped_unsubscribed,
       cursor_pos, reason_breakdown, errors
     ) VALUES (
       $1::timestamptz, now(), $2, 'running', $3::date, $4::date, $5::jsonb,
       $6, $7, $8, 0, 0, 0, 0, $9::jsonb, '[]'::jsonb
     ) RETURNING id`,
    [
      job.startedAt,
      job.trigger,
      job.period.dateFrom,
      job.period.dateTo,
      JSON.stringify(criteria),
      job.recipients.length,
      uniq.uniqueUsers,
      uniq.uniqueCompanies,
      JSON.stringify(rb),
    ],
  );
  return Number(rows[0]?.id) || 0;
}

export async function updateDispatchLogProgress(pool: Pool, logId: number, job: SummaryCronSendJob): Promise<void> {
  if (!logId) return;
  await pool.query(
    `UPDATE haulz_summary_dispatch_log SET
       updated_at = now(),
       sent = $2,
       failed = $3,
       skipped_unsubscribed = $4,
       cursor_pos = $5,
       errors = $6::jsonb
     WHERE id = $1`,
    [logId, job.sent, job.failed, job.skippedUnsubscribed, job.cursor, JSON.stringify(job.errors.slice(0, 50))],
  );
}

export async function finishDispatchLog(
  pool: Pool,
  logId: number,
  job: SummaryCronSendJob,
  status: string,
): Promise<void> {
  if (!logId) return;
  const uniq = countUnique(job.recipients);
  const rb = reasonBreakdownFromRecipients(job.recipients);
  await pool.query(
    `UPDATE haulz_summary_dispatch_log SET
       finished_at = now(),
       updated_at = now(),
       status = $2,
       sent = $3,
       failed = $4,
       skipped_unsubscribed = $5,
       cursor_pos = $6,
       recipients_total = $7,
       unique_users = $8,
       unique_companies = $9,
       reason_breakdown = $10::jsonb,
       errors = $11::jsonb
     WHERE id = $1`,
    [
      logId,
      status,
      job.sent,
      job.failed,
      job.skippedUnsubscribed,
      job.cursor,
      job.recipients.length,
      uniq.uniqueUsers,
      uniq.uniqueCompanies,
      JSON.stringify(rb),
      JSON.stringify(job.errors.slice(0, 50)),
    ],
  );
}

export async function listDispatchLogs(pool: Pool, limit = 40): Promise<DispatchLogRow[]> {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM haulz_summary_dispatch_log ORDER BY started_at DESC LIMIT $1`,
      [Math.max(1, Math.min(100, limit))],
    );
    const logs = rows.map((r) => mapRow(r as Record<string, unknown>));
    const { aggregateTrackingByDispatchLogIds } = await import("./haulzSummaryEmailTrack.js");
    const agg = await aggregateTrackingByDispatchLogIds(
      pool,
      logs.map((l) => l.id),
    );
    return logs.map((l) => {
      const t = agg.get(l.id);
      if (!t) return l;
      return { ...l, ...t };
    });
  } catch {
    return [];
  }
}

export async function getDispatchLogById(pool: Pool, id: number): Promise<DispatchLogRow | null> {
  try {
    const { rows } = await pool.query(`SELECT * FROM haulz_summary_dispatch_log WHERE id = $1 LIMIT 1`, [id]);
    if (!rows[0]) return null;
    const log = mapRow(rows[0] as Record<string, unknown>);
    const { aggregateTrackingByDispatchLogIds } = await import("./haulzSummaryEmailTrack.js");
    const agg = await aggregateTrackingByDispatchLogIds(pool, [id]);
    const t = agg.get(id);
    return t ? { ...log, ...t } : log;
  } catch {
    return null;
  }
}

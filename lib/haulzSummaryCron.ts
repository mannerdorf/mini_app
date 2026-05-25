import type { Pool } from "pg";
import { normalizeCargoDateOnly } from "./cargoDateFilter.js";
import { loadCustomersDirectory, loadUsersWithCompanies } from "./haulzSummaryDirectories.js";
import { loadUnsubscribedSummaryEmails } from "./haulzSummaryUnsubscribe.js";
import { getInvoicePaymentFilterKey } from "./invoicePaymentFilter.js";
import {
  buildWeeklySummaryData,
  getPreviousCalendarWeekRange,
  renderWeeklySummaryHtml,
  sendWeeklySummaryEmail,
} from "./weeklySummary.js";

export type SummaryCronSchedule = "weekly" | "biweekly" | "monthly";
export type SummaryCronPeriodMode = "prev_week" | "prev_month" | "custom_days";

export type SummaryCronCriteria = {
  acceptance: boolean;
  delivery: boolean;
  unpaid_invoices: boolean;
};

export type SummaryCronSendJob = {
  status: "running" | "completed";
  period: { dateFrom: string; dateTo: string };
  recipients: SummaryCronRecipient[];
  cursor: number;
  sent: number;
  failed: number;
  errors: Array<{ targetLogin: string; inn: string; error: string }>;
  startedAt: string;
  updatedAt: string;
};

export type SummaryCronConfig = {
  enabled: boolean;
  schedule: SummaryCronSchedule;
  periodMode: SummaryCronPeriodMode;
  periodDays: number;
  criteria: SummaryCronCriteria;
  batchSize: number;
  emailPauseSec: number;
  batchPauseSec: number;
  spreadWindowHours: number;
  sendJob: SummaryCronSendJob | null;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastRunSummary: Record<string, unknown> | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type SummaryCronRecipient = {
  targetLogin: string;
  inn: string;
  companyName: string;
  reasons: string[];
};

const DEFAULT_CRITERIA: SummaryCronCriteria = {
  acceptance: true,
  delivery: true,
  unpaid_invoices: true,
};

function formatIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function normalizeInnCanon(inn: string): string {
  return String(inn ?? "").replace(/\D/g, "").trim() || String(inn ?? "").trim();
}

function perevozkiItemInn(item: Record<string, unknown>): string {
  const v =
    item.INN ??
    item.Inn ??
    item.inn ??
    item.CustomerINN ??
    item.CustomerInn ??
    item.customerInn ??
    item.INNCustomer ??
    item.InnCustomer ??
    item.ЗаказчикИНН ??
    "";
  return String(v).trim();
}

function normalizeStatus(state: unknown): string {
  if (state == null) return "";
  if (typeof state === "string") return state.trim();
  if (typeof state === "object") {
    const o = state as Record<string, unknown>;
    for (const k of ["Name", "name", "Value", "value", "State", "state", "Статус"]) {
      const v = o[k];
      if (v != null && typeof v !== "object") return String(v).trim();
    }
  }
  return String(state).trim();
}

function isDelivered(state: unknown): boolean {
  const s = normalizeStatus(state).toLowerCase();
  return s.includes("доставлен") || s.includes("заверш");
}

function invoiceInn(item: Record<string, unknown>): string {
  const v = item.INN ?? item.Inn ?? item.inn ?? "";
  return normalizeInnCanon(String(v));
}

function invoiceDate(item: Record<string, unknown>): string {
  return normalizeCargoDateOnly(item.DateDoc ?? item.Date ?? item.date);
}

function parseCriteria(raw: unknown): SummaryCronCriteria {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    acceptance: o.acceptance !== false,
    delivery: o.delivery !== false,
    unpaid_invoices: o.unpaid_invoices !== false,
  };
}

function parseSendJob(raw: unknown): SummaryCronSendJob | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.status !== "running" && o.status !== "completed") return null;
  const period = o.period as { dateFrom?: string; dateTo?: string } | undefined;
  const dateFrom = String(period?.dateFrom ?? "");
  const dateTo = String(period?.dateTo ?? "");
  if (!dateFrom || !dateTo) return null;
  const recipients = Array.isArray(o.recipients) ? (o.recipients as SummaryCronRecipient[]) : [];
  const errors = Array.isArray(o.errors)
    ? (o.errors as Array<{ targetLogin: string; inn: string; error: string }>)
    : [];
  return {
    status: o.status,
    period: { dateFrom, dateTo },
    recipients,
    cursor: Math.max(0, Number(o.cursor) || 0),
    sent: Math.max(0, Number(o.sent) || 0),
    failed: Math.max(0, Number(o.failed) || 0),
    errors,
    startedAt: String(o.startedAt ?? o.started_at ?? new Date().toISOString()),
    updatedAt: String(o.updatedAt ?? o.updated_at ?? new Date().toISOString()),
  };
}

function parseConfigRow(row: Record<string, unknown> | undefined): SummaryCronConfig {
  if (!row) {
    return {
      enabled: false,
      schedule: "weekly",
      periodMode: "prev_week",
      periodDays: 7,
      criteria: { ...DEFAULT_CRITERIA },
      batchSize: 6,
      emailPauseSec: 4,
      batchPauseSec: 120,
      spreadWindowHours: 4,
      sendJob: null,
      lastRunAt: null,
      lastRunStatus: null,
      lastRunSummary: null,
      updatedAt: null,
      updatedBy: null,
    };
  }
  const schedule = String(row.schedule ?? "weekly");
  const periodMode = String(row.period_mode ?? "prev_week");
  return {
    enabled: !!row.enabled,
    schedule: schedule === "biweekly" || schedule === "monthly" ? schedule : "weekly",
    periodMode:
      periodMode === "prev_month" || periodMode === "custom_days" ? (periodMode as SummaryCronPeriodMode) : "prev_week",
    periodDays: Math.max(1, Math.min(90, Number(row.period_days) || 7)),
    criteria: parseCriteria(row.criteria),
    batchSize: Math.max(1, Math.min(30, Number(row.batch_size) || 6)),
    emailPauseSec: Math.max(1, Math.min(60, Number(row.email_pause_sec) || 4)),
    batchPauseSec: Math.max(10, Math.min(600, Number(row.batch_pause_sec) || 120)),
    spreadWindowHours: Math.max(1, Math.min(12, Number(row.spread_window_hours) || 4)),
    sendJob: parseSendJob(row.send_job),
    lastRunAt: row.last_run_at ? new Date(String(row.last_run_at)).toISOString() : null,
    lastRunStatus: row.last_run_status ? String(row.last_run_status) : null,
    lastRunSummary:
      row.last_run_summary && typeof row.last_run_summary === "object"
        ? (row.last_run_summary as Record<string, unknown>)
        : null,
    updatedAt: row.updated_at ? new Date(String(row.updated_at)).toISOString() : null,
    updatedBy: row.updated_by ? String(row.updated_by) : null,
  };
}

export function resolveSummaryCronPeriod(config: Pick<SummaryCronConfig, "periodMode" | "periodDays">): {
  dateFrom: string;
  dateTo: string;
} {
  if (config.periodMode === "prev_week") {
    return getPreviousCalendarWeekRange();
  }
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  if (config.periodMode === "prev_month") {
    const firstThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastPrev = new Date(firstThisMonth);
    lastPrev.setDate(0);
    const firstPrev = new Date(lastPrev.getFullYear(), lastPrev.getMonth(), 1);
    return { dateFrom: formatIsoDate(firstPrev), dateTo: formatIsoDate(lastPrev) };
  }
  const days = Math.max(1, config.periodDays || 7);
  const dateTo = new Date(now);
  dateTo.setDate(now.getDate() - 1);
  const dateFrom = new Date(dateTo);
  dateFrom.setDate(dateTo.getDate() - (days - 1));
  return { dateFrom: formatIsoDate(dateFrom), dateTo: formatIsoDate(dateTo) };
}

export async function loadSummaryCronConfig(pool: Pool): Promise<SummaryCronConfig> {
  try {
    const { rows } = await pool.query(`SELECT * FROM haulz_summary_cron_config WHERE id = 1 LIMIT 1`);
    return parseConfigRow(rows[0] as Record<string, unknown> | undefined);
  } catch {
    return parseConfigRow(undefined);
  }
}

export async function saveSummaryCronConfig(
  pool: Pool,
  patch: Partial<SummaryCronConfig> & { updatedBy?: string },
): Promise<SummaryCronConfig> {
  const current = await loadSummaryCronConfig(pool);
  const next: SummaryCronConfig = {
    ...current,
    ...patch,
    criteria: patch.criteria ? { ...current.criteria, ...patch.criteria } : current.criteria,
    batchSize: patch.batchSize ?? current.batchSize,
    emailPauseSec: patch.emailPauseSec ?? current.emailPauseSec,
    batchPauseSec: patch.batchPauseSec ?? current.batchPauseSec,
    spreadWindowHours: patch.spreadWindowHours ?? current.spreadWindowHours,
  };
  await pool.query(
    `INSERT INTO haulz_summary_cron_config (
       id, enabled, schedule, period_mode, period_days, criteria,
       batch_size, email_pause_sec, batch_pause_sec, spread_window_hours,
       updated_at, updated_by
     ) VALUES (1, $1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, now(), $10)
     ON CONFLICT (id) DO UPDATE SET
       enabled = EXCLUDED.enabled,
       schedule = EXCLUDED.schedule,
       period_mode = EXCLUDED.period_mode,
       period_days = EXCLUDED.period_days,
       criteria = EXCLUDED.criteria,
       batch_size = EXCLUDED.batch_size,
       email_pause_sec = EXCLUDED.email_pause_sec,
       batch_pause_sec = EXCLUDED.batch_pause_sec,
       spread_window_hours = EXCLUDED.spread_window_hours,
       updated_at = now(),
       updated_by = EXCLUDED.updated_by`,
    [
      next.enabled,
      next.schedule,
      next.periodMode,
      next.periodDays,
      JSON.stringify(next.criteria),
      next.batchSize,
      next.emailPauseSec,
      next.batchPauseSec,
      next.spreadWindowHours,
      patch.updatedBy || next.updatedBy || null,
    ],
  );
  return loadSummaryCronConfig(pool);
}

type InnFlags = { acceptance: boolean; delivery: boolean; unpaid: boolean };

async function buildInnActivityIndex(
  pool: Pool,
  dateFrom: string,
  dateTo: string,
): Promise<Map<string, InnFlags>> {
  const index = new Map<string, InnFlags>();

  const ensure = (inn: string): InnFlags => {
    const key = normalizeInnCanon(inn);
    if (!index.has(key)) index.set(key, { acceptance: false, delivery: false, unpaid: false });
    return index.get(key)!;
  };

  let perevozki: unknown[] = [];
  let invoices: unknown[] = [];
  try {
    const pRow = await pool.query<{ data: unknown }>(`SELECT data FROM cache_perevozki WHERE id = 1`);
    perevozki = Array.isArray(pRow.rows[0]?.data) ? (pRow.rows[0].data as unknown[]) : [];
  } catch {
    /* ignore */
  }
  try {
    const iRow = await pool.query<{ data: unknown }>(`SELECT data FROM cache_invoices WHERE id = 1`);
    invoices = Array.isArray(iRow.rows[0]?.data) ? (iRow.rows[0].data as unknown[]) : [];
  } catch {
    /* ignore */
  }

  for (const row of perevozki) {
    const item = row as Record<string, unknown>;
    const inn = normalizeInnCanon(perevozkiItemInn(item));
    if (!inn) continue;
    const flags = ensure(inn);
    const datePrih = normalizeCargoDateOnly(item.DatePrih);
    if (datePrih && datePrih >= dateFrom && datePrih <= dateTo) flags.acceptance = true;
    const dateVr = normalizeCargoDateOnly(item.DateVr);
    if (isDelivered(item.State) && dateVr && dateVr >= dateFrom && dateVr <= dateTo) flags.delivery = true;
  }

  for (const row of invoices) {
    const inv = row as Record<string, unknown>;
    const inn = invoiceInn(inv);
    if (!inn) continue;
    const d = invoiceDate(inv);
    if (!d || d < dateFrom || d > dateTo) continue;
    if (getInvoicePaymentFilterKey(inv) !== "unpaid") continue;
    ensure(inn).unpaid = true;
  }

  return index;
}

export async function buildSummaryCronRecipients(
  pool: Pool,
  params: { dateFrom: string; dateTo: string; criteria: SummaryCronCriteria },
): Promise<SummaryCronRecipient[]> {
  const activity = await buildInnActivityIndex(pool, params.dateFrom, params.dateTo);
  const users = await loadUsersWithCompanies(pool);
  const customers = await loadCustomersDirectory(pool);
  const nameByInn = new Map(customers.map((c) => [c.inn, c.name]));

  const recipients: SummaryCronRecipient[] = [];
  const seen = new Set<string>();
  const unsubscribed = await loadUnsubscribedSummaryEmails(pool);

  for (const user of users) {
    const login = String(user.login || "").trim().toLowerCase();
    if (!login || unsubscribed.has(login)) continue;
    let companies = user.companies;
    if (user.access_all_inns && customers.length > 0) {
      companies = customers.map((c) => ({ inn: c.inn, name: c.name || nameByInn.get(c.inn) || c.inn }));
    }
    for (const company of companies) {
      const inn = String(company.inn || "").trim();
      if (!inn) continue;
      const flags = activity.get(normalizeInnCanon(inn));
      if (!flags) continue;
      const reasons: string[] = [];
      if (params.criteria.acceptance && flags.acceptance) reasons.push("приёмки");
      if (params.criteria.delivery && flags.delivery) reasons.push("доставки");
      if (params.criteria.unpaid_invoices && flags.unpaid) reasons.push("неоплаченные счета");
      if (reasons.length === 0) continue;
      const key = `${login.toLowerCase()}|${inn}`;
      if (seen.has(key)) continue;
      seen.add(key);
      recipients.push({
        targetLogin: login,
        inn,
        companyName: company.name || nameByInn.get(inn) || inn,
        reasons,
      });
    }
  }

  return recipients.sort(
    (a, b) => a.targetLogin.localeCompare(b.targetLogin, "ru") || a.companyName.localeCompare(b.companyName, "ru"),
  );
}

export function isSummaryCronSpreadWindow(config: SummaryCronConfig, now = new Date()): boolean {
  if (now.getUTCDay() !== 1) return false;
  const startHour = 6;
  const endHour = startHour + config.spreadWindowHours;
  const h = now.getUTCHours();
  return h >= startHour && h < endHour;
}

export function shouldRunSummaryCronNow(config: SummaryCronConfig, now = new Date()): boolean {
  if (!config.enabled) return false;
  if (config.sendJob?.status === "running") return isSummaryCronSpreadWindow(config, now);
  if (!config.lastRunAt) return now.getUTCDay() === 1;
  const last = new Date(config.lastRunAt);
  if (Number.isNaN(last.getTime())) return now.getUTCDay() === 1;
  const hoursSince = (now.getTime() - last.getTime()) / 3600000;
  if (config.schedule === "weekly") return hoursSince >= 24 * 6 && now.getUTCDay() === 1;
  if (config.schedule === "biweekly") return hoursSince >= 24 * 13 && now.getUTCDay() === 1;
  return hoursSince >= 24 * 27 && now.getUTCDate() <= 3;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

async function persistSendJob(pool: Pool, job: SummaryCronSendJob | null): Promise<void> {
  try {
    await pool.query(`UPDATE haulz_summary_cron_config SET send_job = $1::jsonb WHERE id = 1`, [
      job ? JSON.stringify(job) : null,
    ]);
  } catch {
    /* ignore */
  }
}

async function finalizeSendRun(
  pool: Pool,
  job: SummaryCronSendJob,
  status: string,
): Promise<void> {
  const summary = {
    sent: job.sent,
    failed: job.failed,
    recipients: job.recipients.length,
    period: job.period,
    errors: job.errors.slice(0, 20),
    batches: Math.ceil(job.recipients.length / Math.max(1, job.recipients.length)),
  };
  try {
    await pool.query(
      `UPDATE haulz_summary_cron_config SET
         send_job = NULL,
         last_run_at = now(),
         last_run_status = $1,
         last_run_summary = $2::jsonb
       WHERE id = 1`,
      [status, JSON.stringify(summary)],
    );
  } catch {
    /* ignore */
  }
}

async function sendOneSummaryEmail(
  pool: Pool,
  r: SummaryCronRecipient,
  period: { dateFrom: string; dateTo: string },
): Promise<{ ok: boolean; error?: string; skippedUnsubscribed?: boolean }> {
  const { isSummaryEmailUnsubscribed } = await import("./haulzSummaryUnsubscribe.js");
  if (await isSummaryEmailUnsubscribed(pool, r.targetLogin)) {
    return { ok: false, skippedUnsubscribed: true, error: "отписан от рассылки" };
  }
  const data = await buildWeeklySummaryData(pool, {
    inn: r.inn,
    companyName: r.companyName,
    targetLogin: r.targetLogin,
    dateFrom: period.dateFrom,
    dateTo: period.dateTo,
  });
  const html = renderWeeklySummaryHtml(data);
  const subject = `HAULZ: сводка за ${data.periodLabel}`;
  return sendWeeklySummaryEmail(pool, r.targetLogin, subject, html);
}

async function processSendJobBatch(
  pool: Pool,
  config: SummaryCronConfig,
  job: SummaryCronSendJob,
): Promise<{ job: SummaryCronSendJob; batchSent: number; batchFailed: number; done: boolean }> {
  const batch = job.recipients.slice(job.cursor, job.cursor + config.batchSize);
  let batchSent = 0;
  let batchFailed = 0;

  for (let i = 0; i < batch.length; i += 1) {
    const r = batch[i];
    try {
      const sendResult = await sendOneSummaryEmail(pool, r, job.period);
      if (sendResult.ok) {
        job.sent += 1;
        batchSent += 1;
      } else if (sendResult.skippedUnsubscribed) {
        /* пропуск без ошибки */
      } else {
        job.failed += 1;
        batchFailed += 1;
        job.errors.push({ targetLogin: r.targetLogin, inn: r.inn, error: sendResult.error || "send failed" });
      }
    } catch (e: unknown) {
      job.failed += 1;
      batchFailed += 1;
      job.errors.push({ targetLogin: r.targetLogin, inn: r.inn, error: (e as Error)?.message || "error" });
    }
    job.cursor += 1;
    if (i < batch.length - 1) await sleepMs(config.emailPauseSec * 1000);
  }

  job.updatedAt = new Date().toISOString();
  const done = job.cursor >= job.recipients.length;
  if (done) {
    job.status = "completed";
    const status = job.failed === 0 ? "ok" : job.sent > 0 ? "partial" : "failed";
    await finalizeSendRun(pool, job, status);
    await persistSendJob(pool, null);
  } else {
    await persistSendJob(pool, job);
  }

  return { job, batchSent, batchFailed, done };
}

async function startSendJob(
  pool: Pool,
  config: SummaryCronConfig,
  recipients: SummaryCronRecipient[],
  period: { dateFrom: string; dateTo: string },
): Promise<SummaryCronSendJob> {
  const job: SummaryCronSendJob = {
    status: "running",
    period,
    recipients,
    cursor: 0,
    sent: 0,
    failed: 0,
    errors: [],
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await persistSendJob(pool, job);
  return job;
}

export type SummaryCronRunResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  period: { dateFrom: string; dateTo: string };
  sent: number;
  failed: number;
  recipients: number;
  batchSent?: number;
  jobRunning?: boolean;
  jobProgress?: { cursor: number; total: number };
  errors: Array<{ targetLogin: string; inn: string; error: string }>;
};

function runResultFromJob(
  job: SummaryCronSendJob,
  extra: Partial<SummaryCronRunResult> = {},
): SummaryCronRunResult {
  return {
    ok: job.failed === 0,
    period: job.period,
    sent: job.sent,
    failed: job.failed,
    recipients: job.recipients.length,
    jobProgress: { cursor: job.cursor, total: job.recipients.length },
    errors: job.errors.slice(-20),
    ...extra,
  };
}

export async function runPartnerSummaryCron(
  pool: Pool,
  options: { force?: boolean; dryRun?: boolean } = {},
): Promise<SummaryCronRunResult> {
  const config = await loadSummaryCronConfig(pool);
  const period = resolveSummaryCronPeriod(config);

  if (options.dryRun) {
    const recipients = await buildSummaryCronRecipients(pool, {
      dateFrom: period.dateFrom,
      dateTo: period.dateTo,
      criteria: config.criteria,
    });
    return {
      ok: true,
      period,
      sent: 0,
      failed: 0,
      recipients: recipients.length,
      errors: [],
    };
  }

  if (!config.enabled && !options.force) {
    return {
      ok: true,
      skipped: true,
      reason: "Автоотправка выключена",
      period,
      sent: 0,
      failed: 0,
      recipients: 0,
      errors: [],
    };
  }

  let job = config.sendJob?.status === "running" ? config.sendJob : null;

  if (options.force) {
    if (!job) {
      const recipients = await buildSummaryCronRecipients(pool, {
        dateFrom: period.dateFrom,
        dateTo: period.dateTo,
        criteria: config.criteria,
      });
      if (recipients.length === 0) {
        return { ok: true, period, sent: 0, failed: 0, recipients: 0, errors: [] };
      }
      job = await startSendJob(pool, config, recipients, period);
    }
    const deadline = Date.now() + 270_000;
    let lastBatch = { batchSent: 0, batchFailed: 0, done: false };
    while (!lastBatch.done && Date.now() < deadline) {
      lastBatch = await processSendJobBatch(pool, config, job);
      job = lastBatch.job;
      if (!lastBatch.done) await sleepMs(config.batchPauseSec * 1000);
    }
    return runResultFromJob(job, {
      batchSent: lastBatch.batchSent,
      jobRunning: !lastBatch.done,
      reason: lastBatch.done ? undefined : "Отправка продолжится по cron (партиями)",
    });
  }

  if (job) {
    if (!isSummaryCronSpreadWindow(config)) {
      return runResultFromJob(job, {
        ok: true,
        skipped: true,
        reason: "Ожидание окна рассылки (понедельник)",
        jobRunning: true,
      });
    }
    const { job: updated, batchSent, done } = await processSendJobBatch(pool, config, job);
    return runResultFromJob(updated, {
      batchSent,
      jobRunning: !done,
      skipped: false,
    });
  }

  if (!shouldRunSummaryCronNow(config)) {
    return {
      ok: true,
      skipped: true,
      reason: config.enabled ? "Ещё не наступило время по расписанию" : "Автоотправка выключена",
      period,
      sent: 0,
      failed: 0,
      recipients: 0,
      errors: [],
    };
  }

  if (!isSummaryCronSpreadWindow(config)) {
    return {
      ok: true,
      skipped: true,
      reason: "Вне окна рассылки (понедельник, утро по UTC)",
      period,
      sent: 0,
      failed: 0,
      recipients: 0,
      errors: [],
    };
  }

  const recipients = await buildSummaryCronRecipients(pool, {
    dateFrom: period.dateFrom,
    dateTo: period.dateTo,
    criteria: config.criteria,
  });
  if (recipients.length === 0) {
    await finalizeSendRun(
      pool,
      {
        status: "completed",
        period,
        recipients: [],
        cursor: 0,
        sent: 0,
        failed: 0,
        errors: [],
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      "ok",
    );
    return { ok: true, period, sent: 0, failed: 0, recipients: 0, errors: [] };
  }

  job = await startSendJob(pool, config, recipients, period);
  const { job: updated, batchSent, done } = await processSendJobBatch(pool, config, job);
  return runResultFromJob(updated, { batchSent, jobRunning: !done });
}

import type { Pool } from "pg";
import { normalizeCargoDateOnly } from "./cargoDateFilter.js";
import { loadCustomersDirectory, loadUsersWithCompanies } from "./haulzSummaryDirectories.js";
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

export type SummaryCronConfig = {
  enabled: boolean;
  schedule: SummaryCronSchedule;
  periodMode: SummaryCronPeriodMode;
  periodDays: number;
  criteria: SummaryCronCriteria;
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

function parseConfigRow(row: Record<string, unknown> | undefined): SummaryCronConfig {
  if (!row) {
    return {
      enabled: false,
      schedule: "weekly",
      periodMode: "prev_week",
      periodDays: 7,
      criteria: { ...DEFAULT_CRITERIA },
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
  };
  await pool.query(
    `INSERT INTO haulz_summary_cron_config (
       id, enabled, schedule, period_mode, period_days, criteria, updated_at, updated_by
     ) VALUES (1, $1, $2, $3, $4, $5::jsonb, now(), $6)
     ON CONFLICT (id) DO UPDATE SET
       enabled = EXCLUDED.enabled,
       schedule = EXCLUDED.schedule,
       period_mode = EXCLUDED.period_mode,
       period_days = EXCLUDED.period_days,
       criteria = EXCLUDED.criteria,
       updated_at = now(),
       updated_by = EXCLUDED.updated_by`,
    [
      next.enabled,
      next.schedule,
      next.periodMode,
      next.periodDays,
      JSON.stringify(next.criteria),
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

  for (const user of users) {
    const login = String(user.login || "").trim();
    if (!login) continue;
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

export function shouldRunSummaryCronNow(config: SummaryCronConfig, now = new Date()): boolean {
  if (!config.enabled) return false;
  if (!config.lastRunAt) return true;
  const last = new Date(config.lastRunAt);
  if (Number.isNaN(last.getTime())) return true;
  const hoursSince = (now.getTime() - last.getTime()) / 3600000;
  if (config.schedule === "weekly") return hoursSince >= 24 * 6 && now.getDay() === 1;
  if (config.schedule === "biweekly") return hoursSince >= 24 * 13 && now.getDay() === 1;
  return hoursSince >= 24 * 27 && now.getDate() <= 3;
}

export type SummaryCronRunResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  period: { dateFrom: string; dateTo: string };
  sent: number;
  failed: number;
  recipients: number;
  errors: Array<{ targetLogin: string; inn: string; error: string }>;
};

export async function runPartnerSummaryCron(
  pool: Pool,
  options: { force?: boolean; dryRun?: boolean } = {},
): Promise<SummaryCronRunResult> {
  const config = await loadSummaryCronConfig(pool);
  if (!options.force && !shouldRunSummaryCronNow(config)) {
    return {
      ok: true,
      skipped: true,
      reason: config.enabled ? "Ещё не наступило время по расписанию" : "Автоотправка выключена",
      period: resolveSummaryCronPeriod(config),
      sent: 0,
      failed: 0,
      recipients: 0,
      errors: [],
    };
  }

  const period = resolveSummaryCronPeriod(config);
  const recipients = await buildSummaryCronRecipients(pool, {
    dateFrom: period.dateFrom,
    dateTo: period.dateTo,
    criteria: config.criteria,
  });

  if (options.dryRun) {
    return {
      ok: true,
      period,
      sent: 0,
      failed: 0,
      recipients: recipients.length,
      errors: [],
    };
  }

  let sent = 0;
  let failed = 0;
  const errors: Array<{ targetLogin: string; inn: string; error: string }> = [];

  for (const r of recipients) {
    try {
      const data = await buildWeeklySummaryData(pool, {
        inn: r.inn,
        companyName: r.companyName,
        targetLogin: r.targetLogin,
        dateFrom: period.dateFrom,
        dateTo: period.dateTo,
      });
      const html = renderWeeklySummaryHtml(data);
      const subject = `HAULZ: сводка за ${data.periodLabel}`;
      const sendResult = await sendWeeklySummaryEmail(pool, r.targetLogin, subject, html);
      if (sendResult.ok) sent += 1;
      else {
        failed += 1;
        errors.push({ targetLogin: r.targetLogin, inn: r.inn, error: sendResult.error || "send failed" });
      }
    } catch (e: unknown) {
      failed += 1;
      errors.push({ targetLogin: r.targetLogin, inn: r.inn, error: (e as Error)?.message || "error" });
    }
  }

  const status = failed === 0 ? "ok" : sent > 0 ? "partial" : "failed";
  const summary = { sent, failed, recipients: recipients.length, period, errors: errors.slice(0, 20) };

  try {
    await pool.query(
      `UPDATE haulz_summary_cron_config SET last_run_at = now(), last_run_status = $1, last_run_summary = $2::jsonb WHERE id = 1`,
      [status, JSON.stringify(summary)],
    );
  } catch {
    /* table may not exist yet */
  }

  return { ok: failed === 0, period, sent, failed, recipients: recipients.length, errors };
}

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../api/_db.js";
import { verifyPassword } from "./passwordUtils.js";
import { verifyAdminToken, getAdminTokenFromRequest } from "./adminAuth.js";
import {
  buildSummaryCronRecipients,
  cancelPartnerSummarySendJob,
  loadSummaryCronConfig,
  resolveSummaryCronPeriod,
  runPartnerSummaryCron,
  saveSummaryCronConfig,
  serializeSendJobForApi,
  type SummaryCronConfig,
  type SummaryCronCriteria,
} from "./haulzSummaryCron.js";
import { getDispatchLogById, listDispatchLogs } from "./haulzSummaryDispatchLog.js";
import { loadHaulzSummaryDirectories } from "./haulzSummaryDirectories.js";
import {
  buildWeeklySummaryData,
  getPreviousCalendarWeekRange,
  renderWeeklySummaryHtml,
  sendWeeklySummaryEmail,
} from "./weeklySummary.js";

export type HaulzSummarySandboxBody = {
  action?: string;
  login?: string;
  password?: string;
  targetLogin?: string;
  inn?: string;
  companyName?: string;
  dateFrom?: string;
  dateTo?: string;
  cron?: Partial<SummaryCronConfig>;
};

export function parseHaulzSummarySandboxBody(req: VercelRequest): HaulzSummarySandboxBody {
  let body: unknown = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return {};
    }
  }
  return (body && typeof body === "object" ? body : {}) as HaulzSummarySandboxBody;
}

const SANDBOX_ACTIONS = new Set([
  "users",
  "preview",
  "send",
  "cron_get",
  "cron_save",
  "cron_recipients",
  "cron_run",
  "cron_stop",
  "cron_logs",
]);

export function isHaulzSummarySandboxAction(action: unknown): boolean {
  return SANDBOX_ACTIONS.has(String(action ?? "").trim().toLowerCase());
}

function normalizeLogin(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export type HaulzSummarySandboxAuthResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

export async function assertHaulzSummarySandboxAccess(
  req: VercelRequest,
  credentials: { login?: string; password?: string },
): Promise<HaulzSummarySandboxAuthResult> {
  if (verifyAdminToken(getAdminTokenFromRequest(req))) {
    return { ok: true };
  }
  const login = normalizeLogin(credentials.login);
  const password = String(credentials.password ?? "");
  if (!login || !password) {
    return { ok: false, status: 401, error: "Требуется авторизация админа или логин/пароль HAULZ" };
  }
  try {
    const pool = getPool();
    const { rows } = await pool.query<{
      password_hash: string;
      active: boolean;
      permissions: Record<string, boolean> | null;
    }>(
      "SELECT password_hash, active, permissions FROM registered_users WHERE lower(trim(login)) = $1 LIMIT 1",
      [login],
    );
    const row = rows[0];
    if (!row?.active || !verifyPassword(password, row.password_hash)) {
      return { ok: false, status: 401, error: "Неверный логин или пароль" };
    }
    const perms = row.permissions && typeof row.permissions === "object" ? row.permissions : {};
    if (perms.haulz !== true || perms.service_mode !== true) {
      return { ok: false, status: 403, error: "Недостаточно прав (нужны HAULZ и служебный режим)" };
    }
    return { ok: true };
  } catch {
    return { ok: false, status: 500, error: "Ошибка проверки доступа" };
  }
}

export { loadHaulzSummaryDirectories };

function parseCronPatch(body: HaulzSummarySandboxBody): Partial<SummaryCronConfig> & { updatedBy?: string } {
  const c = body.cron;
  if (!c || typeof c !== "object") return {};
  const patch: Partial<SummaryCronConfig> & { updatedBy?: string } = {};
  if (typeof c.enabled === "boolean") patch.enabled = c.enabled;
  if (c.schedule === "weekly" || c.schedule === "biweekly" || c.schedule === "monthly") patch.schedule = c.schedule;
  if (c.periodMode === "prev_week" || c.periodMode === "prev_month" || c.periodMode === "custom_days") {
    patch.periodMode = c.periodMode;
  }
  if (typeof c.periodDays === "number" && Number.isFinite(c.periodDays)) {
    patch.periodDays = Math.max(1, Math.min(90, Math.round(c.periodDays)));
  }
  if (c.criteria && typeof c.criteria === "object") {
    const cr = c.criteria as SummaryCronCriteria;
    patch.criteria = {
      acceptance: cr.acceptance !== false,
      delivery: cr.delivery !== false,
      unpaid_invoices: cr.unpaid_invoices !== false,
    };
  }
  if (typeof c.batchSize === "number" && Number.isFinite(c.batchSize)) {
    patch.batchSize = Math.max(1, Math.min(30, Math.round(c.batchSize)));
  }
  if (typeof c.emailPauseSec === "number" && Number.isFinite(c.emailPauseSec)) {
    patch.emailPauseSec = Math.max(1, Math.min(60, Math.round(c.emailPauseSec)));
  }
  if (typeof c.batchPauseSec === "number" && Number.isFinite(c.batchPauseSec)) {
    patch.batchPauseSec = Math.max(10, Math.min(600, Math.round(c.batchPauseSec)));
  }
  if (typeof c.spreadWindowHours === "number" && Number.isFinite(c.spreadWindowHours)) {
    patch.spreadWindowHours = Math.max(1, Math.min(12, Math.round(c.spreadWindowHours)));
  }
  if (body.login) patch.updatedBy = String(body.login).trim();
  return patch;
}

/** Песочница «Самери»: users / preview / send / cron_*. */
export async function handleHaulzSummarySandboxRequest(
  req: VercelRequest,
  res: VercelResponse,
  requestId: string,
): Promise<boolean> {
  const body = parseHaulzSummarySandboxBody(req);
  if (!isHaulzSummarySandboxAction(body.action)) {
    return false;
  }

  const auth = await assertHaulzSummarySandboxAccess(req, {
    login: body.login,
    password: body.password,
  });
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.error, request_id: requestId });
    return true;
  }

  const action = String(body.action).trim().toLowerCase();

  try {
    const pool = getPool();

    if (action === "users") {
      const { users, customers, defaultPeriod } = await loadHaulzSummaryDirectories(pool);
      const cronConfig = await loadSummaryCronConfig(pool);
      res.status(200).json({ users, customers, defaultPeriod, cronConfig, request_id: requestId });
      return true;
    }

    if (action === "cron_get") {
      const cronConfig = await loadSummaryCronConfig(pool);
      const period = resolveSummaryCronPeriod(cronConfig);
      const sendJob = serializeSendJobForApi(cronConfig.sendJob);
      let activeLog = null;
      if (cronConfig.sendJob?.logId) {
        activeLog = await getDispatchLogById(pool, cronConfig.sendJob.logId);
      }
      res.status(200).json({ cronConfig, period, sendJob, activeLog, request_id: requestId });
      return true;
    }

    if (action === "cron_logs") {
      const limit = Math.max(1, Math.min(100, Number(body.limit) || 30));
      const logs = await listDispatchLogs(pool, limit);
      res.status(200).json({ logs, request_id: requestId });
      return true;
    }

    if (action === "cron_save") {
      const saved = await saveSummaryCronConfig(pool, parseCronPatch(body));
      const period = resolveSummaryCronPeriod(saved);
      res.status(200).json({ cronConfig: saved, period, request_id: requestId });
      return true;
    }

    if (action === "cron_recipients") {
      const cronConfig = await loadSummaryCronConfig(pool);
      const defaultPeriod = getPreviousCalendarWeekRange();
      const dateFrom = ISO_DAY.test(String(body.dateFrom ?? "")) ? String(body.dateFrom) : resolveSummaryCronPeriod(cronConfig).dateFrom;
      const dateTo = ISO_DAY.test(String(body.dateTo ?? "")) ? String(body.dateTo) : resolveSummaryCronPeriod(cronConfig).dateTo;
      const criteria = body.cron?.criteria ? parseCronPatch(body).criteria! : cronConfig.criteria;
      const recipients = await buildSummaryCronRecipients(pool, {
        dateFrom: dateFrom || defaultPeriod.dateFrom,
        dateTo: dateTo || defaultPeriod.dateTo,
        criteria: criteria || cronConfig.criteria,
      });
      res.status(200).json({
        recipients,
        period: { dateFrom, dateTo },
        count: recipients.length,
        request_id: requestId,
      });
      return true;
    }

    if (action === "cron_run") {
      const result = await runPartnerSummaryCron(pool, { force: true });
      const cronConfig = await loadSummaryCronConfig(pool);
      const sendJob = serializeSendJobForApi(cronConfig.sendJob);
      res.status(200).json({ ...result, sendJob, request_id: requestId });
      return true;
    }

    if (action === "cron_stop") {
      const result = await cancelPartnerSummarySendJob(pool);
      const cronConfig = await loadSummaryCronConfig(pool);
      const sendJob = serializeSendJobForApi(cronConfig.sendJob);
      res.status(result.ok ? 200 : 400).json({ ...result, sendJob, request_id: requestId });
      return true;
    }

    const targetLogin = normalizeLogin(body.targetLogin);
    const inn = String(body.inn ?? "").trim();
    const companyName = String(body.companyName ?? "").trim();
    if (!targetLogin) {
      res.status(400).json({ error: "Укажите targetLogin", request_id: requestId });
      return true;
    }
    if (!inn) {
      res.status(400).json({ error: "Укажите inn контрагента", request_id: requestId });
      return true;
    }

    const defaultPeriod = getPreviousCalendarWeekRange();
    const dateFrom = ISO_DAY.test(String(body.dateFrom ?? "")) ? String(body.dateFrom) : defaultPeriod.dateFrom;
    const dateTo = ISO_DAY.test(String(body.dateTo ?? "")) ? String(body.dateTo) : defaultPeriod.dateTo;
    if (dateFrom > dateTo) {
      res.status(400).json({ error: "dateFrom не может быть больше dateTo", request_id: requestId });
      return true;
    }

    const data = await buildWeeklySummaryData(pool, {
      inn,
      companyName: companyName || inn,
      targetLogin,
      dateFrom,
      dateTo,
    });
    const html = renderWeeklySummaryHtml(data);
    const subject = `HAULZ: сводка за ${data.periodLabel}`;

    if (action === "preview") {
      res.status(200).json({ data, html, subject, request_id: requestId });
      return true;
    }

    if (action === "send") {
      const { isSummaryEmailUnsubscribed } = await import("./haulzSummaryUnsubscribe.js");
      if (await isSummaryEmailUnsubscribed(pool, targetLogin)) {
        res.status(400).json({ error: "Получатель отписан от рассылки", request_id: requestId });
        return true;
      }
      const sendResult = await sendWeeklySummaryEmail(pool, targetLogin, subject, html);
      if (!sendResult.ok) {
        res.status(500).json({ error: sendResult.error || "Ошибка отправки", request_id: requestId });
        return true;
      }
      res.status(200).json({ ok: true, sentTo: targetLogin, subject, request_id: requestId });
      return true;
    }

    res.status(400).json({ error: "Неизвестный action", request_id: requestId });
    return true;
  } catch (e: unknown) {
    const err = e as Error;
    res.status(500).json({ error: err?.message || "Ошибка", request_id: requestId });
    return true;
  }
}

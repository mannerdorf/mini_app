import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Mail, Eye, Play, Users, Save, RefreshCw, ScrollText, Square, ListChecks } from "lucide-react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import type { Account } from "../types";
import { getPreviousCalendarWeekRangeClient } from "../lib/weeklySummaryClient";

const SUMMARY_API_PATHS = ["/api/invoices", "/api/admin-weekly-summary", "/api/perevozki"] as const;
/** Cron/рассылка — сначала лёгкий endpoint, чтобы не упираться в таймаут invoices. */
const SUMMARY_CRON_API_PATHS = ["/api/admin-weekly-summary", "/api/invoices", "/api/perevozki"] as const;

const SUMMARY_FORM_STORAGE_PREFIX = "haulz.summarySandbox.lastSend";

type SavedSummaryForm = {
  targetLogin: string;
  inn: string;
  companyName: string;
  dateFrom: string;
  dateTo: string;
};

function summaryFormStorageKey(operatorLogin: string): string {
  return `${SUMMARY_FORM_STORAGE_PREFIX}.${operatorLogin.trim().toLowerCase()}`;
}

function loadSavedSummaryForm(operatorLogin: string): SavedSummaryForm | null {
  if (!operatorLogin.trim()) return null;
  try {
    const raw = localStorage.getItem(summaryFormStorageKey(operatorLogin));
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<SavedSummaryForm>;
    if (!data.targetLogin || !data.inn) return null;
    return {
      targetLogin: String(data.targetLogin).trim(),
      inn: String(data.inn).trim(),
      companyName: String(data.companyName ?? "").trim(),
      dateFrom: String(data.dateFrom ?? "").trim(),
      dateTo: String(data.dateTo ?? "").trim(),
    };
  } catch {
    return null;
  }
}

function saveSavedSummaryForm(operatorLogin: string, form: SavedSummaryForm): void {
  if (!operatorLogin.trim()) return;
  try {
    localStorage.setItem(summaryFormStorageKey(operatorLogin), JSON.stringify(form));
  } catch {
    /* ignore quota */
  }
}

type CompanyOption = { inn: string; name: string };

type SandboxUser = {
  id: number;
  login: string;
  company_name?: string;
  access_all_inns?: boolean;
  companies: CompanyOption[];
};

type CustomerDirectoryRow = {
  inn: string;
  name: string;
  email?: string;
};

type SummaryCronCriteria = {
  acceptance: boolean;
  delivery: boolean;
  unpaid_invoices: boolean;
};

type SummaryCronConfig = {
  enabled: boolean;
  schedule: "weekly" | "biweekly" | "monthly";
  periodMode: "prev_week" | "prev_month" | "custom_days";
  periodDays: number;
  criteria: SummaryCronCriteria;
  batchSize: number;
  emailPauseSec: number;
  batchPauseSec: number;
  spreadWindowHours: number;
  sendJob?: SummarySendJob | null;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastRunSummary: Record<string, unknown> | null;
};

type SummarySendJob = {
  status: string;
  cursor: number;
  sent: number;
  failed: number;
  skippedUnsubscribed: number;
  total: number;
  progressPct: number;
  startedAt: string;
  updatedAt?: string;
  trigger: "auto" | "manual";
  logId?: number;
  period?: { dateFrom: string; dateTo: string };
};

type DispatchLogRow = {
  id: number;
  startedAt: string;
  finishedAt: string | null;
  updatedAt: string;
  trigger: "auto" | "manual";
  status: string;
  period: { dateFrom: string; dateTo: string };
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

type DispatchRecipientRow = {
  id: number;
  targetLogin: string;
  inn: string;
  companyName: string;
  reasons: string[];
  status: string;
  error: string | null;
  messageId: string | null;
  sentAt: string | null;
  openCount: number;
  clickCount: number;
};

type CronRecipient = {
  targetLogin: string;
  inn: string;
  companyName: string;
  reasons: string[];
};

type DirectoryPayload = {
  users?: SandboxUser[];
  customers?: CustomerDirectoryRow[];
  defaultPeriod?: { dateFrom: string; dateTo: string };
  cronConfig?: SummaryCronConfig;
  sendJob?: SummarySendJob | null;
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: "0.82rem",
  fontWeight: 600,
  color: "var(--color-text-primary)",
};

function isDirectoryPayload(data: unknown): data is DirectoryPayload {
  return !!data && typeof data === "object" && !Array.isArray(data) && ("users" in data || "customers" in data);
}

type Props = {
  activeAccount: Account | null;
  onBack: () => void;
};

async function fetchSummaryDirectories(login: string, password: string): Promise<DirectoryPayload> {
  const headers = { "x-login": login, "x-password": password };

  const companiesRes = await fetch("/api/companies?sandbox=1", { headers });
  const companiesData = (await companiesRes.json().catch(() => ({}))) as DirectoryPayload & { error?: string };
  if (companiesRes.ok && isDirectoryPayload(companiesData)) {
    return companiesData;
  }
  if (!companiesRes.ok && companiesData.error) {
    throw new Error(companiesData.error);
  }

  let lastErr = "Справочники недоступны. Задеплойте api/companies.ts на Vercel (режим ?sandbox=1).";
  for (const path of SUMMARY_API_PATHS) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ login, password, isRegisteredUser: true, action: "users" }),
    });
    const data = (await res.json().catch(() => ({}))) as DirectoryPayload & { error?: string; path?: string };
    if (res.ok && isDirectoryPayload(data)) return data;
    const msg = data.error || `HTTP ${res.status}`;
    lastErr = msg;
    if (msg !== "API route not found" && !String(data.path || "").includes("not found")) {
      throw new Error(msg);
    }
  }
  throw new Error(lastErr);
}

async function postSummaryApi<T extends Record<string, unknown>>(
  paths: readonly string[],
  body: Record<string, unknown>,
  login: string,
  password: string,
): Promise<T> {
  let lastErr = "Ошибка запроса";
  for (const path of paths) {
    const res = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-login": login,
        "x-password": password,
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string; path?: string };
    if (res.ok) {
      if (body.action === "users" && !isDirectoryPayload(data)) {
        lastErr = "Устаревший API: обновите сервер (haulz-summary / invoices action=users)";
        continue;
      }
      return data;
    }
    const msg = data.error || `HTTP ${res.status}`;
    lastErr = msg;
    if (msg !== "API route not found" && !String(data.path || "").includes("not found")) {
      throw new Error(msg);
    }
  }
  throw new Error(lastErr);
}

export function HaulzSummarySandboxPage({ activeAccount, onBack }: Props) {
  const defaultPeriod = useMemo(() => getPreviousCalendarWeekRangeClient(), []);
  const operatorLogin = activeAccount?.login?.trim() ?? "";
  const savedForm = useMemo(() => loadSavedSummaryForm(operatorLogin), [operatorLogin]);

  const [users, setUsers] = useState<SandboxUser[]>([]);
  const [customers, setCustomers] = useState<CustomerDirectoryRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");

  const [targetLogin, setTargetLogin] = useState(savedForm?.targetLogin ?? "");
  const [inn, setInn] = useState(savedForm?.inn ?? "");
  const [companyName, setCompanyName] = useState(savedForm?.companyName ?? "");
  const [dateFrom, setDateFrom] = useState(savedForm?.dateFrom || defaultPeriod.dateFrom);
  const [dateTo, setDateTo] = useState(savedForm?.dateTo || defaultPeriod.dateTo);

  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewSubject, setPreviewSubject] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [sendLoading, setSendLoading] = useState(false);
  const [sendMessage, setSendMessage] = useState<string | null>(null);

  const [cronEnabled, setCronEnabled] = useState(false);
  const [cronSchedule, setCronSchedule] = useState<SummaryCronConfig["schedule"]>("weekly");
  const [cronPeriodMode, setCronPeriodMode] = useState<SummaryCronConfig["periodMode"]>("prev_week");
  const [cronPeriodDays, setCronPeriodDays] = useState(7);
  const [cronCriteria, setCronCriteria] = useState<SummaryCronCriteria>({
    acceptance: true,
    delivery: true,
    unpaid_invoices: true,
  });
  const [cronLastRun, setCronLastRun] = useState<string | null>(null);
  const [cronLastStatus, setCronLastStatus] = useState<string | null>(null);
  const [cronRecipients, setCronRecipients] = useState<CronRecipient[]>([]);
  const [cronRecipientsPeriod, setCronRecipientsPeriod] = useState<{ dateFrom: string; dateTo: string } | null>(null);
  const [cronBusy, setCronBusy] = useState<string | null>(null);
  const [cronMessage, setCronMessage] = useState<string | null>(null);
  const [activeSendJob, setActiveSendJob] = useState<SummarySendJob | null>(null);
  const [dispatchLogs, setDispatchLogs] = useState<DispatchLogRow[]>([]);
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);
  const [recipientsByLogId, setRecipientsByLogId] = useState<Record<number, DispatchRecipientRow[]>>({});
  const [loadingRecipientsLogId, setLoadingRecipientsLogId] = useState<number | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);

  const authBody = useMemo(() => {
    if (!activeAccount?.login || !activeAccount?.password) return null;
    return {
      login: activeAccount.login,
      password: activeAccount.password,
      isRegisteredUser: activeAccount.isRegisteredUser === true,
    };
  }, [activeAccount?.login, activeAccount?.password, activeAccount?.isRegisteredUser]);

  const selectedUser = useMemo(
    () => users.find((u) => u.login.toLowerCase() === targetLogin.toLowerCase()),
    [users, targetLogin],
  );

  const companyOptions = useMemo((): CompanyOption[] => {
    if (!selectedUser) return [];
    const nameByInn = new Map(customers.map((c) => [c.inn, c.name]));
    if (selectedUser.access_all_inns && customers.length > 0) {
      return customers.map((c) => ({ inn: c.inn, name: c.name || nameByInn.get(c.inn) || c.inn }));
    }
    return selectedUser.companies.map((c) => ({
      inn: c.inn,
      name: c.name || nameByInn.get(c.inn) || c.inn,
    }));
  }, [selectedUser, customers]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.login.toLowerCase().includes(q) ||
        (u.company_name || "").toLowerCase().includes(q),
    );
  }, [users, userSearch]);

  const filteredCompanyOptions = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return companyOptions;
    return companyOptions.filter(
      (c) => c.inn.toLowerCase().includes(q) || c.name.toLowerCase().includes(q),
    );
  }, [companyOptions, customerSearch]);

  const normalizeSendJobForUi = (job: SummarySendJob & { recipients?: unknown[] }): SummarySendJob => {
    const total =
      job.total ??
      (Array.isArray(job.recipients) ? job.recipients.length : 0);
    const cursor = Math.max(0, Number(job.cursor) || 0);
    return {
      ...job,
      total,
      progressPct:
        job.progressPct ??
        (total > 0 ? Math.min(100, Math.round((cursor / total) * 100)) : 0),
      skippedUnsubscribed: job.skippedUnsubscribed ?? 0,
    };
  };

  const sendJobFromDispatchLog = (log: DispatchLogRow): SummarySendJob => ({
    status: "running",
    cursor: log.cursorPos,
    sent: log.sent,
    failed: log.failed,
    skippedUnsubscribed: log.skippedUnsubscribed,
    total: log.recipientsTotal,
    progressPct: log.progressPct,
    startedAt: log.startedAt,
    trigger: log.trigger,
    logId: log.id,
    period: log.period,
  });

  const applyCronConfig = (cfg: SummaryCronConfig) => {
    setCronEnabled(!!cfg.enabled);
    setCronSchedule(cfg.schedule);
    setCronPeriodMode(cfg.periodMode);
    setCronPeriodDays(cfg.periodDays);
    setCronCriteria(cfg.criteria);
    setCronLastRun(cfg.lastRunAt);
    setCronLastStatus(cfg.lastRunStatus);
    if (cfg.sendJob?.status === "running") {
      setActiveSendJob(normalizeSendJobForUi(cfg.sendJob as SummarySendJob & { recipients?: unknown[] }));
    }
  };

  const fetchUsers = useCallback(async () => {
    if (!authBody) return;
    setLoadingUsers(true);
    setUsersError(null);
    try {
      const data = await fetchSummaryDirectories(authBody.login, authBody.password);
      const list = Array.isArray(data.users) ? data.users : [];
      const cust = Array.isArray(data.customers) ? data.customers : [];
      setUsers(list);
      setCustomers(cust);
      if (data.cronConfig) {
        applyCronConfig(data.cronConfig);
      }
      if (data.sendJob) {
        setActiveSendJob(data.sendJob);
      } else if (data.cronConfig?.sendJob) {
        setActiveSendJob(normalizeSendJobForUi(data.cronConfig.sendJob));
      }
      if (!savedForm && data.defaultPeriod?.dateFrom && data.defaultPeriod?.dateTo) {
        setDateFrom(data.defaultPeriod.dateFrom);
        setDateTo(data.defaultPeriod.dateTo);
      }
      if (savedForm?.targetLogin) {
        const ok = list.some((u) => u.login.toLowerCase() === savedForm.targetLogin.toLowerCase());
        if (!ok) {
          setTargetLogin("");
          setInn("");
          setCompanyName("");
        }
      }
      if (list.length === 0) {
        setUsersError("Нет активных пользователей в registered_users.");
      } else if (cust.length === 0) {
        setUsersError("Справочник cache_customers пуст. Запустите cron refresh-cache.");
      }
    } catch (e: unknown) {
      setUsersError((e as Error)?.message || "Ошибка");
      setUsers([]);
      setCustomers([]);
    } finally {
      setLoadingUsers(false);
    }
  }, [authBody, savedForm]);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (!targetLogin) {
      setInn("");
      setCompanyName("");
      setCustomerSearch("");
      return;
    }
    const first = companyOptions[0];
    if (!first) return;
    const matched = inn ? companyOptions.find((x) => x.inn === inn) : undefined;
    if (matched) {
      setCompanyName(matched.name || "");
      return;
    }
    setInn(first.inn);
    setCompanyName(first.name || "");
  }, [targetLogin, companyOptions, inn]);

  const statusLabel = (status: string) => {
    if (status === "ok" || status === "completed") return "Успешно";
    if (status === "partial") return "Частично";
    if (status === "failed") return "Ошибка";
    if (status === "running") return "Идёт рассылка";
    if (status === "cancelled") return "Остановлена";
    return status || "—";
  };

  const recipientStatusLabel = (status: string) => {
    if (status === "sent") return "Отправлено";
    if (status === "failed") return "Ошибка";
    if (status === "skipped_unsubscribed") return "Отписка";
    if (status === "cancelled") return "Не отправлено";
    if (status === "pending") return "В очереди";
    return status || "—";
  };

  const recipientStatusColor = (status: string): string | undefined => {
    if (status === "sent") return "#059669";
    if (status === "failed") return "#b91c1c";
    if (status === "skipped_unsubscribed") return "#b45309";
    if (status === "cancelled") return "var(--color-text-secondary)";
    if (status === "pending") return "#2563eb";
    return undefined;
  };

  const refreshCronStatus = useCallback(async () => {
    if (!authBody) return;
    try {
      const data = await postSummaryApi<{
        cronConfig: SummaryCronConfig;
        sendJob: SummarySendJob | null;
        activeLog: DispatchLogRow | null;
      }>(SUMMARY_API_PATHS, { ...authBody, action: "cron_get" }, authBody.login, authBody.password);
      if (data.cronConfig) applyCronConfig(data.cronConfig);
      const nextJob = data.sendJob ?? (data.cronConfig?.sendJob ? normalizeSendJobForUi(data.cronConfig.sendJob as SummarySendJob & { recipients?: unknown[] }) : null);
      setActiveSendJob(nextJob?.status === "running" ? nextJob : null);
      if (data.activeLog) {
        setDispatchLogs((prev) => {
          const rest = prev.filter((l) => l.id !== data.activeLog!.id);
          return [data.activeLog!, ...rest];
        });
      }
    } catch {
      /* ignore poll errors */
    }
  }, [authBody]);

  const loadDispatchRecipients = useCallback(
    async (logId: number, force = false) => {
      if (!authBody || !logId) return;
      if (!force && recipientsByLogId[logId] !== undefined) return;
      setLoadingRecipientsLogId(logId);
      try {
        const data = await postSummaryApi<{ recipients: DispatchRecipientRow[]; count: number }>(
          SUMMARY_API_PATHS,
          { ...authBody, action: "cron_dispatch_recipients", logId },
          authBody.login,
          authBody.password,
        );
        const recipients = Array.isArray(data.recipients) ? data.recipients : [];
        setRecipientsByLogId((prev) => ({ ...prev, [logId]: recipients }));
      } catch {
        setRecipientsByLogId((prev) => ({ ...prev, [logId]: [] }));
      } finally {
        setLoadingRecipientsLogId((cur) => (cur === logId ? null : cur));
      }
    },
    [authBody, recipientsByLogId],
  );

  const loadDispatchLogs = useCallback(async () => {
    if (!authBody) return;
    setLogsLoading(true);
    try {
      const data = await postSummaryApi<{ logs: DispatchLogRow[] }>(
        SUMMARY_API_PATHS,
        { ...authBody, action: "cron_logs", limit: 40 },
        authBody.login,
        authBody.password,
      );
      const logs = Array.isArray(data.logs) ? data.logs : [];
      setDispatchLogs(logs);
      if (logs.some((l) => l.isRunning)) {
        void refreshCronStatus();
      }
    } catch {
      setDispatchLogs([]);
    } finally {
      setLogsLoading(false);
    }
  }, [authBody, refreshCronStatus]);

  useEffect(() => {
    if (!authBody) return;
    void loadDispatchLogs();
    void refreshCronStatus();
  }, [authBody, loadDispatchLogs, refreshCronStatus]);

  const runningDispatchLog = useMemo(
    () => dispatchLogs.find((l) => l.isRunning) ?? null,
    [dispatchLogs],
  );

  const sendJobRunning = activeSendJob?.status === "running" || Boolean(runningDispatchLog);

  const progressSendJob = useMemo((): SummarySendJob | null => {
    if (activeSendJob?.status === "running") return activeSendJob;
    if (runningDispatchLog) return sendJobFromDispatchLog(runningDispatchLog);
    return null;
  }, [activeSendJob, runningDispatchLog]);

  const recipientListSummary = useMemo(() => {
    const users = new Set<string>();
    const companies = new Set<string>();
    let acceptance = 0;
    let delivery = 0;
    let unpaid = 0;
    for (const r of cronRecipients) {
      users.add(r.targetLogin.toLowerCase());
      companies.add(r.inn);
      if (r.reasons.some((x) => x.includes("приём"))) acceptance += 1;
      if (r.reasons.some((x) => x.includes("достав"))) delivery += 1;
      if (r.reasons.some((x) => x.includes("счет") || x.includes("счёт"))) unpaid += 1;
    }
    return {
      users: users.size,
      companies: companies.size,
      acceptance,
      delivery,
      unpaid,
      total: cronRecipients.length,
    };
  }, [cronRecipients]);

  const continueCronSend = useCallback(async () => {
    if (!authBody) return;
    try {
      const data = await postSummaryApi<{
        jobRunning?: boolean;
        sendJob?: SummarySendJob | null;
        skipped?: boolean;
      }>(SUMMARY_CRON_API_PATHS, { ...authBody, action: "cron_continue" }, authBody.login, authBody.password);
      if (data.sendJob) {
        setActiveSendJob(data.sendJob.status === "running" ? data.sendJob : null);
      } else if (!data.jobRunning) {
        setActiveSendJob(null);
      }
      void loadDispatchLogs();
    } catch {
      /* ignore background continue errors */
    }
  }, [authBody, loadDispatchLogs]);

  useEffect(() => {
    if (!sendJobRunning || !authBody) return;
    void continueCronSend();
    const statusTimer = window.setInterval(() => {
      void refreshCronStatus();
      void loadDispatchLogs();
    }, 4000);
    const continueTimer = window.setInterval(() => {
      void continueCronSend();
    }, 20_000);
    return () => {
      window.clearInterval(statusTimer);
      window.clearInterval(continueTimer);
    };
  }, [sendJobRunning, authBody, refreshCronStatus, loadDispatchLogs, continueCronSend]);

  useEffect(() => {
    if (!sendJobRunning) {
      void loadDispatchLogs();
    }
  }, [sendJobRunning, loadDispatchLogs]);

  const cronPayload = () => ({
    ...authBody,
    cron: {
      enabled: cronEnabled,
      schedule: cronSchedule,
      periodMode: cronPeriodMode,
      periodDays: cronPeriodDays,
      criteria: cronCriteria,
    },
  });

  const saveCronRules = async () => {
    if (!authBody) return;
    setCronBusy("save");
    setCronMessage(null);
    try {
      const data = await postSummaryApi<{ cronConfig: SummaryCronConfig }>(
        SUMMARY_API_PATHS,
        { ...cronPayload(), action: "cron_save" },
        authBody.login,
        authBody.password,
      );
      if (data.cronConfig) applyCronConfig(data.cronConfig);
      setCronMessage("Правила сохранены");
    } catch (e: unknown) {
      setCronMessage((e as Error)?.message || "Ошибка");
    } finally {
      setCronBusy(null);
    }
  };

  const loadCronRecipients = async () => {
    if (!authBody) return;
    setCronBusy("recipients");
    setCronMessage(null);
    try {
      const data = await postSummaryApi<{ recipients: CronRecipient[]; count: number; period: { dateFrom: string; dateTo: string } }>(
        SUMMARY_API_PATHS,
        { ...cronPayload(), action: "cron_recipients" },
        authBody.login,
        authBody.password,
      );
      setCronRecipients(Array.isArray(data.recipients) ? data.recipients : []);
      setCronRecipientsPeriod(data.period?.dateFrom && data.period?.dateTo ? data.period : null);
      setCronMessage(`В выборке: ${data.count ?? 0} писем (период ${data.period?.dateFrom} — ${data.period?.dateTo})`);
    } catch (e: unknown) {
      setCronMessage((e as Error)?.message || "Ошибка");
      setCronRecipients([]);
      setCronRecipientsPeriod(null);
    } finally {
      setCronBusy(null);
    }
  };

  const stopCronSend = async () => {
    if (!authBody) return;
    if (!window.confirm("Остановить рассылку? Уже отправленные письма не отзываются.")) return;
    setCronBusy("stop");
    setCronMessage(null);
    try {
      const data = await postSummaryApi<{
        ok: boolean;
        message?: string;
        sent?: number;
        failed?: number;
        recipients?: number;
        sendJob?: SummarySendJob | null;
      }>(SUMMARY_CRON_API_PATHS, { ...authBody, action: "cron_stop" }, authBody.login, authBody.password);
      setActiveSendJob(data.sendJob ?? null);
      setCronMessage(
        data.ok
          ? `${data.message || "Рассылка остановлена"}: отправлено ${data.sent ?? 0} из ${data.recipients ?? 0}.`
          : data.message || "Не удалось остановить",
      );
      void refreshCronStatus();
      void loadDispatchLogs();
    } catch (e: unknown) {
      setCronMessage((e as Error)?.message || "Ошибка остановки");
    } finally {
      setCronBusy(null);
    }
  };

  const runCronNow = async () => {
    if (!authBody) return;
    if (!window.confirm("Отправить сводки всем из выборки сейчас?")) return;
    setCronBusy("run");
    setCronMessage(null);
    try {
      const data = await postSummaryApi<{
        sent: number;
        failed: number;
        recipients: number;
        jobRunning?: boolean;
        sendJob?: SummarySendJob | null;
        errors?: Array<{ error: string }>;
      }>(SUMMARY_CRON_API_PATHS, { ...authBody, action: "cron_run" }, authBody.login, authBody.password);
      if (data.sendJob) setActiveSendJob(data.sendJob);
      const running = data.jobRunning || data.sendJob?.status === "running";
      setCronMessage(
        running
          ? `Рассылка запущена: ${data.sendJob?.sent ?? data.sent ?? 0} из ${data.sendJob?.total ?? data.recipients ?? 0}. Прогресс обновляется автоматически.`
          : `Готово: отправлено ${data.sent ?? 0}, ошибок ${data.failed ?? 0}, в выборке ${data.recipients ?? 0}`,
      );
      void fetchUsers();
      void refreshCronStatus();
      void loadDispatchLogs();
      if (running) void continueCronSend();
    } catch (e: unknown) {
      const msg = (e as Error)?.message || "Ошибка";
      setCronMessage(msg.includes("504") ? `${msg} — проверяем, могла ли рассылка стартовать…` : msg);
      void refreshCronStatus();
      void loadDispatchLogs();
      void continueCronSend();
    } finally {
      setCronBusy(null);
    }
  };

  const callApi = async (action: "preview" | "send") => {
    if (!authBody || !targetLogin || !inn) return;
    const payload = {
      ...authBody,
      action,
      targetLogin,
      inn,
      companyName,
      dateFrom,
      dateTo,
    };
    if (action === "preview") {
      setPreviewLoading(true);
      setPreviewError(null);
      setSendMessage(null);
    } else {
      setSendLoading(true);
      setSendMessage(null);
    }
    try {
      const data = await postSummaryApi<{ html?: string; subject?: string; sentTo?: string }>(
        SUMMARY_API_PATHS,
        payload,
        authBody.login,
        authBody.password,
      );
      if (action === "preview") {
        setPreviewHtml(typeof data.html === "string" ? data.html : null);
        setPreviewSubject(typeof data.subject === "string" ? data.subject : "");
      } else {
        setSendMessage(`Письмо отправлено на ${data.sentTo || targetLogin}`);
        saveSavedSummaryForm(operatorLogin, {
          targetLogin,
          inn,
          companyName,
          dateFrom,
          dateTo,
        });
      }
    } catch (e: unknown) {
      const msg = (e as Error)?.message || "Ошибка";
      if (action === "preview") setPreviewError(msg);
      else setSendMessage(msg);
    } finally {
      if (action === "preview") setPreviewLoading(false);
      else setSendLoading(false);
    }
  };

  if (!authBody) {
    return (
      <div className="w-full">
        <Typography.Body>Нет данных для авторизации.</Typography.Body>
        <Button className="filter-button" onClick={onBack} style={{ marginTop: "1rem" }}>
          Назад
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full">
      <Flex align="center" style={{ marginBottom: "1rem", gap: "0.75rem" }}>
        <Button className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }} aria-label="Назад">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Typography.Headline className="text-page-title">Отчёт — песочница</Typography.Headline>
      </Flex>

      <Typography.Body style={{ fontSize: "0.88rem", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
        Справочники: пользователи из БД, контрагенты из cache_customers (с учётом привязок и email). Период — тот же фильтр даты,
        что в разделе «Грузы» (DatePrih и др.). По умолчанию — прошлая календарная неделя.
      </Typography.Body>

      {usersError && (
        <Panel
          className="cargo-card"
          style={{ marginBottom: "0.75rem", padding: "0.75rem", borderColor: "#fecaca", background: "#fef2f2" }}
        >
          <Typography.Body style={{ color: "#b91c1c", fontSize: "0.88rem" }}>{usersError}</Typography.Body>
        </Panel>
      )}

      <Panel className="cargo-card haulz-summary-sandbox" style={{ padding: "var(--pad-card, 1rem)", marginBottom: "1rem" }}>
        <Flex direction="column" gap="0.75rem" className="form-row-same-height">
          <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            <Typography.Body style={LABEL_STYLE}>
              Пользователь (email входа) {users.length > 0 ? `· ${users.length}` : ""}
            </Typography.Body>
            {users.length > 0 && (
              <input
                type="search"
                className="admin-form-input"
                placeholder="Поиск по email или компании"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                disabled={loadingUsers}
              />
            )}
            <select
              className="admin-form-input"
              value={targetLogin}
              onChange={(e) => {
                setTargetLogin(e.target.value);
                setInn("");
                setCompanyName("");
                setUserSearch("");
                setPreviewHtml(null);
              }}
              disabled={loadingUsers}
              style={{ width: "100%" }}
            >
              <option value="">— выберите —</option>
              {filteredUsers.map((u) => (
                <option key={u.id} value={u.login}>
                  {u.login}
                  {u.company_name ? ` (${u.company_name})` : ""}
                </option>
              ))}
            </select>
            {userSearch.trim() && filteredUsers.length === 0 && (
              <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                Ничего не найдено
              </Typography.Body>
            )}
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            <Typography.Body style={LABEL_STYLE}>
              Контрагент (cache_customers)
              {companyOptions.length > 0 ? ` · ${companyOptions.length}` : customers.length > 0 ? ` · справ. ${customers.length}` : ""}
            </Typography.Body>
            {targetLogin && companyOptions.length > 0 && (
              <input
                type="search"
                className="admin-form-input"
                placeholder="Поиск по ИНН или названию"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
              />
            )}
            <select
              className="admin-form-input"
              value={inn}
              onChange={(e) => {
                const v = e.target.value;
                setInn(v);
                const c = companyOptions.find((x) => x.inn === v);
                setCompanyName(c?.name || "");
                setPreviewHtml(null);
              }}
              disabled={!targetLogin || companyOptions.length === 0}
              style={{ width: "100%" }}
            >
              <option value="">— выберите ИНН —</option>
              {filteredCompanyOptions.map((c) => (
                <option key={c.inn} value={c.inn}>
                  {c.name || c.inn} · {c.inn}
                </option>
              ))}
            </select>
            {targetLogin && companyOptions.length === 0 && !loadingUsers && (
              <Typography.Body style={{ fontSize: "0.8rem", color: "#b45309" }}>
                Нет контрагентов для пользователя. Проверьте account_companies, email в cache_customers или право «все ИНН».
              </Typography.Body>
            )}
          </label>

          <Flex gap="0.5rem" wrap="wrap">
            <label style={{ flex: "1 1 140px", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <Typography.Body style={LABEL_STYLE}>С</Typography.Body>
              <input
                type="date"
                className="admin-form-input"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPreviewHtml(null);
                }}
              />
            </label>
            <label style={{ flex: "1 1 140px", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <Typography.Body style={LABEL_STYLE}>По</Typography.Body>
              <input
                type="date"
                className="admin-form-input"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPreviewHtml(null);
                }}
              />
            </label>
          </Flex>

          <Flex gap="0.5rem" wrap="wrap">
            <Button
              type="button"
              className="button-primary"
              disabled={!targetLogin || !inn || previewLoading}
              onClick={() => void callApi("preview")}
            >
              {previewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
              <span style={{ marginLeft: "0.35rem" }}>Предпросмотр</span>
            </Button>
            <Button
              type="button"
              className="button-primary"
              disabled={!targetLogin || !inn || sendLoading || !previewHtml}
              onClick={() => void callApi("send")}
            >
              {sendLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              <span style={{ marginLeft: "0.35rem" }}>Отправить</span>
            </Button>
            <Button type="button" className="filter-button" disabled={loadingUsers} onClick={() => void fetchUsers()}>
              Обновить справочники
            </Button>
          </Flex>

          {previewError && (
            <Typography.Body style={{ color: "#b91c1c", fontSize: "0.88rem" }}>{previewError}</Typography.Body>
          )}
          {sendMessage && (
            <Typography.Body style={{ color: sendMessage.includes("отправлено") ? "#059669" : "#b91c1c", fontSize: "0.88rem" }}>
              {sendMessage}
            </Typography.Body>
          )}
          {previewSubject && (
            <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>
              Тема: {previewSubject}
            </Typography.Body>
          )}
        </Flex>
      </Panel>

      <Panel className="cargo-card haulz-summary-sandbox" style={{ padding: "var(--pad-card, 1rem)", marginBottom: "1rem" }}>
        <Typography.Body style={{ ...LABEL_STYLE, marginBottom: "0.5rem" }}>Автоотправка (cron)</Typography.Body>
        <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
          Vercel: понедельник 09:00 МСК (если включено). В выборку попадают пары логин + контрагент (ИНН): не более одного письма
          на пару за рассылку и не более одного получателя на ИНН. Служебные аккаунты (access_all_inns, service_mode) исключены.
          Критерии: приёмки, доставки или неоплаченные счета за период.
        </Typography.Body>
        <Flex direction="column" gap="0.65rem" className="form-row-same-height">
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--color-text-primary)" }}>
            <input type="checkbox" checked={cronEnabled} onChange={(e) => setCronEnabled(e.target.checked)} />
            <span style={{ fontSize: "0.88rem" }}>Автоотправка включена</span>
          </label>
          <Flex gap="0.5rem" wrap="wrap">
            <label style={{ flex: "1 1 160px", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <Typography.Body style={LABEL_STYLE}>Как часто</Typography.Body>
              <select className="admin-form-input" value={cronSchedule} onChange={(e) => setCronSchedule(e.target.value as SummaryCronConfig["schedule"])}>
                <option value="weekly">Раз в неделю</option>
                <option value="biweekly">Раз в 2 недели</option>
                <option value="monthly">Раз в месяц</option>
              </select>
            </label>
            <label style={{ flex: "1 1 160px", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <Typography.Body style={LABEL_STYLE}>Период в письме</Typography.Body>
              <select className="admin-form-input" value={cronPeriodMode} onChange={(e) => setCronPeriodMode(e.target.value as SummaryCronConfig["periodMode"])}>
                <option value="prev_week">Прошлая неделя</option>
                <option value="prev_month">Прошлый месяц</option>
                <option value="custom_days">Последние N дней</option>
              </select>
            </label>
            {cronPeriodMode === "custom_days" && (
              <label style={{ flex: "0 1 100px", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                <Typography.Body style={LABEL_STYLE}>Дней</Typography.Body>
                <input
                  type="number"
                  min={1}
                  max={90}
                  className="admin-form-input"
                  value={cronPeriodDays}
                  onChange={(e) => setCronPeriodDays(Math.max(1, Math.min(90, Number(e.target.value) || 7)))}
                />
              </label>
            )}
          </Flex>
          <Flex gap="0.75rem" wrap="wrap" style={{ color: "var(--color-text-primary)", fontSize: "0.88rem" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <input
                type="checkbox"
                checked={cronCriteria.acceptance}
                onChange={(e) => setCronCriteria((c) => ({ ...c, acceptance: e.target.checked }))}
              />
              Приёмки
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <input
                type="checkbox"
                checked={cronCriteria.delivery}
                onChange={(e) => setCronCriteria((c) => ({ ...c, delivery: e.target.checked }))}
              />
              Доставки
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <input
                type="checkbox"
                checked={cronCriteria.unpaid_invoices}
                onChange={(e) => setCronCriteria((c) => ({ ...c, unpaid_invoices: e.target.checked }))}
              />
              Неоплаченные счета
            </label>
          </Flex>
          {cronLastRun && (
            <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
              Последний запуск: {new Date(cronLastRun).toLocaleString("ru-RU")}
              {cronLastStatus ? ` · ${cronLastStatus}` : ""}
            </Typography.Body>
          )}
          <Flex gap="0.5rem" wrap="wrap">
            <Button type="button" className="button-primary" disabled={!!cronBusy} onClick={() => void saveCronRules()}>
              {cronBusy === "save" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span style={{ marginLeft: "0.35rem" }}>Сохранить правила</span>
            </Button>
            <Button type="button" className="filter-button" disabled={!!cronBusy} onClick={() => void loadCronRecipients()}>
              {cronBusy === "recipients" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
              <span style={{ marginLeft: "0.35rem" }}>Показать выборку</span>
            </Button>
            <Button type="button" className="button-primary" disabled={!!cronBusy} onClick={() => void runCronNow()}>
              {cronBusy === "run" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              <span style={{ marginLeft: "0.35rem" }}>Отправить сейчас</span>
            </Button>
          </Flex>
          {cronMessage && (
            <Typography.Body style={{ fontSize: "0.88rem", color: cronMessage.includes("Ошиб") ? "#b91c1c" : "#059669" }}>
              {cronMessage}
            </Typography.Body>
          )}
          {cronRecipients.length > 0 && (
            <div style={{ maxHeight: "200px", overflow: "auto", border: "1px solid var(--color-border)", borderRadius: "8px", padding: "0.5rem" }}>
              <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.8rem", color: "var(--color-text-primary)" }}>
                {cronRecipients.slice(0, 50).map((r) => (
                  <li key={`${r.targetLogin}-${r.inn}`}>
                    {r.targetLogin} · {r.companyName} ({r.inn}) — {r.reasons.join(", ")}
                  </li>
                ))}
              </ul>
              {cronRecipients.length > 50 && (
                <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginTop: "0.35rem" }}>
                  … и ещё {cronRecipients.length - 50}
                </Typography.Body>
              )}
            </div>
          )}
        </Flex>
      </Panel>

      <Panel className="cargo-card haulz-summary-sandbox" style={{ padding: "var(--pad-card, 1rem)", marginBottom: "1rem" }}>
        <Flex align="center" justify="space-between" wrap="wrap" gap="0.5rem" style={{ marginBottom: "0.65rem" }}>
          <Flex align="center" gap="0.4rem">
            <ScrollText className="w-4 h-4" style={{ color: "var(--color-text-secondary)" }} />
            <Typography.Body style={{ ...LABEL_STYLE, margin: 0 }}>Журнал рассылок</Typography.Body>
          </Flex>
          <Flex align="center" gap="0.5rem" wrap="wrap">
            <Button
              type="button"
              className="button-primary"
              disabled={!authBody || cronBusy === "recipients" || !!cronBusy}
              onClick={() => void loadCronRecipients()}
            >
              {cronBusy === "recipients" ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListChecks className="w-4 h-4" />}
              <span style={{ marginLeft: "0.35rem" }}>Сформировать список для рассылки</span>
            </Button>
            {sendJobRunning ? (
              <Button
                type="button"
                className="filter-button"
                disabled={cronBusy === "stop"}
                onClick={(e) => {
                  e.stopPropagation();
                  void stopCronSend();
                }}
                style={{ color: "#b91c1c", borderColor: "rgba(185,28,28,0.35)", fontWeight: 600 }}
              >
                {cronBusy === "stop" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
                <span style={{ marginLeft: "0.35rem" }}>Остановить рассылку</span>
              </Button>
            ) : null}
            <Button type="button" className="filter-button" disabled={logsLoading} onClick={() => void loadDispatchLogs()}>
              {logsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              <span style={{ marginLeft: "0.35rem" }}>Обновить</span>
            </Button>
          </Flex>
        </Flex>

        {(cronRecipientsPeriod || cronRecipients.length > 0) && (
          <div
            style={{
              marginBottom: "0.85rem",
              padding: "0.65rem 0.75rem",
              borderRadius: "8px",
              background: "var(--color-bg-hover)",
              border: "1px solid var(--color-border)",
            }}
          >
            <Typography.Body style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-text-primary)" }}>
              Список для рассылки: {recipientListSummary.total} писем
              {cronRecipientsPeriod ? ` · период ${cronRecipientsPeriod.dateFrom} — ${cronRecipientsPeriod.dateTo}` : ""}
            </Typography.Body>
            {recipientListSummary.total > 0 ? (
              <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginTop: "0.3rem" }}>
                Пользователей: {recipientListSummary.users} · контрагентов: {recipientListSummary.companies} · приёмки:{" "}
                {recipientListSummary.acceptance} · доставки: {recipientListSummary.delivery} · счета: {recipientListSummary.unpaid}
              </Typography.Body>
            ) : (
              <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginTop: "0.3rem" }}>
                По текущим правилам и периоду получателей нет.
              </Typography.Body>
            )}
            {cronRecipients.length > 0 ? (
              <details style={{ marginTop: "0.45rem" }}>
                <summary style={{ cursor: "pointer", fontSize: "0.78rem", color: "var(--color-primary-blue)" }}>
                  Показать первые {Math.min(50, cronRecipients.length)} адресатов
                </summary>
                <ul style={{ margin: "0.35rem 0 0", paddingLeft: "1.1rem", fontSize: "0.76rem", color: "var(--color-text-primary)" }}>
                  {cronRecipients.slice(0, 50).map((r) => (
                    <li key={`${r.targetLogin}-${r.inn}`}>
                      {r.targetLogin} · {r.companyName} ({r.inn}) — {r.reasons.join(", ")}
                    </li>
                  ))}
                </ul>
                {cronRecipients.length > 50 ? (
                  <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginTop: "0.25rem" }}>
                    … и ещё {cronRecipients.length - 50}
                  </Typography.Body>
                ) : null}
              </details>
            ) : null}
          </div>
        )}

        {sendJobRunning && progressSendJob && (
          <div style={{ marginBottom: "0.85rem", padding: "0.65rem 0.75rem", borderRadius: "8px", background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.25)" }}>
            <Typography.Body style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-text-primary)" }}>
              Рассылка в процессе ({progressSendJob.trigger === "manual" ? "ручная" : "авто"})
            </Typography.Body>
            <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginTop: "0.25rem" }}>
              {progressSendJob.sent} отправлено · {progressSendJob.failed} ошибок · {progressSendJob.skippedUnsubscribed} отписок ·{" "}
              {progressSendJob.cursor} / {progressSendJob.total}
            </Typography.Body>
            <div style={{ marginTop: "0.45rem", height: "8px", borderRadius: "999px", background: "var(--color-border)", overflow: "hidden" }}>
              <div
                style={{
                  width: `${progressSendJob.progressPct}%`,
                  height: "100%",
                  background: "linear-gradient(90deg,#1e3a8a,#2563eb)",
                  transition: "width 0.4s ease",
                }}
              />
            </div>
            <Flex align="center" justify="space-between" wrap="wrap" gap="0.5rem" style={{ marginTop: "0.45rem" }}>
              <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", margin: 0 }}>
                Обновление каждые 4 с, отправка — каждые 20 с. Отчёт на info@haulz.pro — после завершения или остановки.
              </Typography.Body>
              <Button
                type="button"
                className="filter-button"
                disabled={cronBusy === "stop"}
                onClick={() => void stopCronSend()}
                style={{ fontSize: "0.78rem", color: "#b91c1c", borderColor: "rgba(185,28,28,0.35)", fontWeight: 600 }}
              >
                {cronBusy === "stop" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
                <span style={{ marginLeft: "0.3rem" }}>Остановить рассылку</span>
              </Button>
            </Flex>
          </div>
        )}

        {dispatchLogs.length === 0 && !logsLoading ? (
          <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>
            Запусков пока нет. Примените миграции 070–073 и отправьте рассылку.
          </Typography.Body>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left" }}>
                  <th style={{ padding: "0.35rem 0.4rem" }}>Старт</th>
                  <th style={{ padding: "0.35rem 0.4rem" }}>Тип</th>
                  <th style={{ padding: "0.35rem 0.4rem" }}>Статус</th>
                  <th style={{ padding: "0.35rem 0.4rem" }}>Период</th>
                  <th style={{ padding: "0.35rem 0.4rem", textAlign: "right" }}>В выборке</th>
                  <th style={{ padding: "0.35rem 0.4rem", textAlign: "right" }}>Отпр.</th>
                  <th style={{ padding: "0.35rem 0.4rem", textAlign: "right" }}>Ошиб.</th>
                  <th style={{ padding: "0.35rem 0.4rem", textAlign: "right" }}>Отписка</th>
                  <th style={{ padding: "0.35rem 0.4rem", textAlign: "right" }} title="Уникальных писем с открытием">Открыт.</th>
                  <th style={{ padding: "0.35rem 0.4rem", textAlign: "right" }}>Клики</th>
                </tr>
              </thead>
              <tbody>
                {dispatchLogs.map((log) => (
                  <React.Fragment key={log.id}>
                    <tr
                      style={{ borderBottom: "1px solid var(--color-border)", cursor: "pointer" }}
                      onClick={() => setExpandedLogId((id) => (id === log.id ? null : log.id))}
                    >
                      <td style={{ padding: "0.4rem" }}>{new Date(log.startedAt).toLocaleString("ru-RU")}</td>
                      <td style={{ padding: "0.4rem" }}>{log.trigger === "manual" ? "Ручная" : "Авто"}</td>
                      <td style={{ padding: "0.4rem" }}>
                        {log.isRunning ? `${statusLabel(log.status)} (${log.progressPct}%)` : statusLabel(log.status)}
                      </td>
                      <td style={{ padding: "0.4rem", whiteSpace: "nowrap" }}>
                        {log.period.dateFrom} — {log.period.dateTo}
                      </td>
                      <td style={{ padding: "0.4rem", textAlign: "right" }}>{log.recipientsTotal}</td>
                      <td style={{ padding: "0.4rem", textAlign: "right", color: "#059669" }}>{log.sent}</td>
                      <td style={{ padding: "0.4rem", textAlign: "right", color: log.failed ? "#b91c1c" : undefined }}>{log.failed}</td>
                      <td style={{ padding: "0.4rem", textAlign: "right" }}>{log.skippedUnsubscribed}</td>
                      <td style={{ padding: "0.4rem", textAlign: "right" }}>
                        {log.trackingOpenedEmails}
                        {log.trackingOpens > log.trackingOpenedEmails ? (
                          <span style={{ color: "var(--color-text-secondary)", fontSize: "0.72rem" }}> ({log.trackingOpens})</span>
                        ) : null}
                      </td>
                      <td style={{ padding: "0.4rem", textAlign: "right" }}>{log.trackingClicks}</td>
                    </tr>
                    {expandedLogId === log.id && (
                      <tr>
                        <td colSpan={10} style={{ padding: "0.5rem 0.65rem", background: "var(--color-bg-hover)", fontSize: "0.76rem" }}>
                          <div>
                            Пользователей: {log.uniqueUsers} · контрагентов: {log.uniqueCompanies} · приёмки: {log.reasonBreakdown.acceptance} ·
                            доставки: {log.reasonBreakdown.delivery} · счета: {log.reasonBreakdown.unpaid}
                          </div>
                          <div style={{ marginTop: "0.25rem" }}>
                            Трекинг: открыли {log.trackingOpenedEmails} писем ({log.trackingOpens} загрузок пикселя), кликнули в{" "}
                            {log.trackingClickedEmails} ({log.trackingClicks} переходов). Ссылки и отписка не трекаются.
                          </div>
                          {log.errors.length > 0 ? (
                            <ul style={{ margin: "0.35rem 0 0", paddingLeft: "1.1rem" }}>
                              {log.errors.map((e, i) => (
                                <li key={`${e.targetLogin}-${e.inn}-${i}`}>
                                  {e.targetLogin} · {e.inn}: {e.error}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <Typography.Body style={{ marginTop: "0.35rem", color: "var(--color-text-secondary)" }}>Ошибок нет.</Typography.Body>
                          )}
                          <details
                            style={{ marginTop: "0.55rem" }}
                            onClick={(e) => e.stopPropagation()}
                            onToggle={(e) => {
                              if ((e.currentTarget as HTMLDetailsElement).open) {
                                void loadDispatchRecipients(log.id, log.isRunning);
                              }
                            }}
                          >
                            <summary style={{ cursor: "pointer", fontWeight: 600, userSelect: "none" }}>
                              Адреса рассылки ({log.recipientsTotal})
                            </summary>
                            {loadingRecipientsLogId === log.id && recipientsByLogId[log.id] === undefined ? (
                              <Typography.Body style={{ marginTop: "0.35rem", color: "var(--color-text-secondary)" }}>
                                Загрузка…
                              </Typography.Body>
                            ) : recipientsByLogId[log.id]?.length ? (
                              <div style={{ marginTop: "0.4rem", overflowX: "auto" }}>
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.74rem" }}>
                                  <thead>
                                    <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left" }}>
                                      <th style={{ padding: "0.3rem 0.35rem" }}>Email</th>
                                      <th style={{ padding: "0.3rem 0.35rem" }}>Контрагент</th>
                                      <th style={{ padding: "0.3rem 0.35rem" }}>Причина</th>
                                      <th style={{ padding: "0.3rem 0.35rem" }}>Статус</th>
                                      <th style={{ padding: "0.3rem 0.35rem", textAlign: "right" }}>Открыт.</th>
                                      <th style={{ padding: "0.3rem 0.35rem", textAlign: "right" }}>Клики</th>
                                      <th style={{ padding: "0.3rem 0.35rem" }}>Ошибка</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {recipientsByLogId[log.id]!.map((r) => (
                                      <tr key={r.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                                        <td style={{ padding: "0.32rem 0.35rem", whiteSpace: "nowrap" }}>{r.targetLogin}</td>
                                        <td style={{ padding: "0.32rem 0.35rem" }}>
                                          {r.companyName || "—"}
                                          {r.inn ? (
                                            <span style={{ color: "var(--color-text-secondary)", marginLeft: "0.25rem" }}>({r.inn})</span>
                                          ) : null}
                                        </td>
                                        <td style={{ padding: "0.32rem 0.35rem" }}>{r.reasons.join(", ") || "—"}</td>
                                        <td style={{ padding: "0.32rem 0.35rem", color: recipientStatusColor(r.status), whiteSpace: "nowrap" }}>
                                          {recipientStatusLabel(r.status)}
                                        </td>
                                        <td style={{ padding: "0.32rem 0.35rem", textAlign: "right" }}>{r.openCount || "—"}</td>
                                        <td style={{ padding: "0.32rem 0.35rem", textAlign: "right" }}>{r.clickCount || "—"}</td>
                                        <td style={{ padding: "0.32rem 0.35rem", color: r.error ? "#b91c1c" : "var(--color-text-secondary)" }}>
                                          {r.error || "—"}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : recipientsByLogId[log.id] !== undefined ? (
                              <Typography.Body style={{ marginTop: "0.35rem", color: "var(--color-text-secondary)" }}>
                                Детализация недоступна для этой рассылки (старый запуск или миграция 073 не применена).
                              </Typography.Body>
                            ) : null}
                          </details>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Typography.Body style={{ marginTop: "0.65rem", fontSize: "0.78rem", color: "var(--color-text-secondary)", lineHeight: 1.45 }}>
          Трекинг включён: пиксель <code>/api/haulz-summary-email-open</code>, клики через{" "}
          <code>/api/haulz-summary-email-click</code>. Нужны миграции 070–073. «Спам» по ящику SMTP не показывает — только ESP/Postmaster.
        </Typography.Body>
      </Panel>

      {previewHtml && (
        <Panel className="cargo-card" style={{ padding: 0, overflow: "hidden" }}>
          <iframe
            title="Предпросмотр письма"
            srcDoc={previewHtml}
            style={{ width: "100%", minHeight: "480px", border: "none", background: "#f3f4f6" }}
            sandbox=""
          />
        </Panel>
      )}

      {loadingUsers && (
        <Flex align="center" gap="0.5rem" style={{ marginTop: "0.5rem" }}>
          <Loader2 className="w-4 h-4 animate-spin" />
          <Typography.Body style={{ fontSize: "0.85rem" }}>Загрузка справочников…</Typography.Body>
        </Flex>
      )}
    </div>
  );
}

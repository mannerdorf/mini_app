import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Mail, Eye, Play, Users, Save } from "lucide-react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import type { Account } from "../types";
import { getPreviousCalendarWeekRangeClient } from "../lib/weeklySummaryClient";

const SUMMARY_API_PATHS = ["/api/invoices", "/api/admin-weekly-summary", "/api/perevozki"] as const;

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
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastRunSummary: Record<string, unknown> | null;
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
  const [cronBusy, setCronBusy] = useState<string | null>(null);
  const [cronMessage, setCronMessage] = useState<string | null>(null);

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
        setCronEnabled(!!data.cronConfig.enabled);
        setCronSchedule(data.cronConfig.schedule || "weekly");
        setCronPeriodMode(data.cronConfig.periodMode || "prev_week");
        setCronPeriodDays(data.cronConfig.periodDays || 7);
        setCronCriteria(data.cronConfig.criteria || { acceptance: true, delivery: true, unpaid_invoices: true });
        setCronLastRun(data.cronConfig.lastRunAt);
        setCronLastStatus(data.cronConfig.lastRunStatus);
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

  const applyCronConfig = (cfg: SummaryCronConfig) => {
    setCronEnabled(!!cfg.enabled);
    setCronSchedule(cfg.schedule);
    setCronPeriodMode(cfg.periodMode);
    setCronPeriodDays(cfg.periodDays);
    setCronCriteria(cfg.criteria);
    setCronLastRun(cfg.lastRunAt);
    setCronLastStatus(cfg.lastRunStatus);
  };

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
        { ...cronPayload(), action: "cron_recipients", dateFrom, dateTo },
        authBody.login,
        authBody.password,
      );
      setCronRecipients(Array.isArray(data.recipients) ? data.recipients : []);
      setCronMessage(`В выборке: ${data.count ?? 0} писем (период ${data.period?.dateFrom} — ${data.period?.dateTo})`);
    } catch (e: unknown) {
      setCronMessage((e as Error)?.message || "Ошибка");
      setCronRecipients([]);
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
      const data = await postSummaryApi<{ sent: number; failed: number; recipients: number; errors?: Array<{ error: string }> }>(
        SUMMARY_API_PATHS,
        { ...authBody, action: "cron_run" },
        authBody.login,
        authBody.password,
      );
      setCronMessage(`Готово: отправлено ${data.sent ?? 0}, ошибок ${data.failed ?? 0}, в выборке ${data.recipients ?? 0}`);
      void fetchUsers();
    } catch (e: unknown) {
      setCronMessage((e as Error)?.message || "Ошибка");
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
        <Typography.Headline className="text-page-title">Самери — песочница</Typography.Headline>
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
          Vercel: понедельник 09:00 МСК (если включено). В выборку попадают пары пользователь + контрагент, если за период были
          приёмки, доставки или есть неоплаченные счета.
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

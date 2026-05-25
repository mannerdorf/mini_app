import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Mail, Eye } from "lucide-react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import type { Account } from "../types";
import { getPreviousCalendarWeekRangeClient } from "../lib/weeklySummaryClient";

const SUMMARY_API_PATHS = ["/api/invoices", "/api/admin-weekly-summary", "/api/perevozki"] as const;

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

type DirectoryPayload = {
  users?: SandboxUser[];
  customers?: CustomerDirectoryRow[];
  defaultPeriod?: { dateFrom: string; dateTo: string };
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
  const [users, setUsers] = useState<SandboxUser[]>([]);
  const [customers, setCustomers] = useState<CustomerDirectoryRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");

  const [targetLogin, setTargetLogin] = useState("");
  const [inn, setInn] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [dateFrom, setDateFrom] = useState(defaultPeriod.dateFrom);
  const [dateTo, setDateTo] = useState(defaultPeriod.dateTo);

  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewSubject, setPreviewSubject] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [sendLoading, setSendLoading] = useState(false);
  const [sendMessage, setSendMessage] = useState<string | null>(null);

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
      if (data.defaultPeriod?.dateFrom && data.defaultPeriod?.dateTo) {
        setDateFrom(data.defaultPeriod.dateFrom);
        setDateTo(data.defaultPeriod.dateTo);
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
  }, [authBody]);

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
    if (first && !inn) {
      setInn(first.inn);
      setCompanyName(first.name || "");
    }
  }, [targetLogin, companyOptions, inn]);

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
        Справочники: пользователи из БД, контрагенты из cache_customers (с учётом привязок и email). По умолчанию — прошлая
        календарная неделя.
      </Typography.Body>

      {usersError && (
        <Panel style={{ marginBottom: "0.75rem", padding: "0.75rem", borderColor: "#fecaca", background: "#fef2f2" }}>
          <Typography.Body style={{ color: "#b91c1c", fontSize: "0.88rem" }}>{usersError}</Typography.Body>
        </Panel>
      )}

      <Panel style={{ padding: "1rem", marginBottom: "1rem" }}>
        <Flex direction="column" gap="0.75rem">
          <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            <Typography.Body style={{ fontSize: "0.82rem", fontWeight: 600 }}>
              Пользователь (email входа) {users.length > 0 ? `· ${users.length}` : ""}
            </Typography.Body>
            <select
              className="admin-form-input"
              value={targetLogin}
              onChange={(e) => {
                setTargetLogin(e.target.value);
                setInn("");
                setCompanyName("");
                setPreviewHtml(null);
              }}
              disabled={loadingUsers}
              style={{ width: "100%" }}
            >
              <option value="">— выберите —</option>
              {users.map((u) => (
                <option key={u.id} value={u.login}>
                  {u.login}
                  {u.company_name ? ` (${u.company_name})` : ""}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            <Typography.Body style={{ fontSize: "0.82rem", fontWeight: 600 }}>
              Контрагент (cache_customers)
              {companyOptions.length > 0 ? ` · ${companyOptions.length}` : customers.length > 0 ? ` · справ. ${customers.length}` : ""}
            </Typography.Body>
            {targetLogin && companyOptions.length > 8 && (
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
              <Typography.Body style={{ fontSize: "0.82rem", fontWeight: 600 }}>С</Typography.Body>
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
              <Typography.Body style={{ fontSize: "0.82rem", fontWeight: 600 }}>По</Typography.Body>
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

      {previewHtml && (
        <Panel style={{ padding: 0, overflow: "hidden" }}>
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

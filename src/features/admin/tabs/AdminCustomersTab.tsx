import React, { useCallback, useEffect, useState } from "react";
import { Button, Flex, Panel, Typography, Input } from "@maxhub/max-ui";
import { ChevronDown, ChevronUp, ChevronsUpDown, Download, Loader2 } from "lucide-react";
import { searchAdminCustomers, postAdminRefreshCustomersCache } from "../../../api/client/admin/customers";
import { registerAdminUser } from "../../../api/client/admin/users";
import { fetchAdminAutoRegisterCandidates, runAdminAutoRegisterBatch } from "../../../api/client/admin/autoRegister";
import { SyncDebugPanel } from "../lib/SyncDebugPanel";
import { buildSyncDebugFromError, buildSyncDebugFromResponse } from "../lib/syncDebug";

export type AdminCustomersTabUser = {
  id: number;
  login?: string;
  inn?: string;
  companies?: { inn: string; name?: string }[];
};

type AdminCustomersTabProps = {
  adminToken: string;
  isSuperAdmin: boolean;
  users: AdminCustomersTabUser[];
  onUsersRefresh: () => Promise<void>;
  onError: (msg: string | null) => void;
};

export function AdminCustomersTab({ adminToken, isSuperAdmin, users, onUsersRefresh, onError }: AdminCustomersTabProps) {
  const [customersList, setCustomersList] = useState<{ inn: string; customer_name: string; email: string }[]>([]);
  const [customersSearch, setCustomersSearch] = useState("");
  const [customersShowOnlyWithoutEmail, setCustomersShowOnlyWithoutEmail] = useState(false);
  const [customersSortBy, setCustomersSortBy] = useState<"inn" | "customer_name" | "email">("customer_name");
  const [customersSortOrder, setCustomersSortOrder] = useState<"asc" | "desc">("asc");
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customersFetchTrigger, setCustomersFetchTrigger] = useState(0);
  const [customersSyncLoading, setCustomersSyncLoading] = useState(false);
  const [customersSyncMessage, setCustomersSyncMessage] = useState<string | null>(null);
  const [customersSyncDebugRequest, setCustomersSyncDebugRequest] = useState("");
  const [customersSyncDebugResponse, setCustomersSyncDebugResponse] = useState("");
  const [registeringCustomerInn, setRegisteringCustomerInn] = useState<string | null>(null);
  const [autoRegisterCandidates, setAutoRegisterCandidates] = useState<{ inn: string; customer_name: string; email: string }[]>([]);
  const [autoRegisterStats, setAutoRegisterStats] = useState<{ total: number; withEmail: number; validEmail: number; alreadyRegistered: number } | null>(null);
  const [autoRegisterLoading, setAutoRegisterLoading] = useState(false);
  const [autoRegisterApplying, setAutoRegisterApplying] = useState(false);
  const [autoRegisterAutoModeEnabled, setAutoRegisterAutoModeEnabled] = useState(false);
  const [autoRegisterFetchTrigger, setAutoRegisterFetchTrigger] = useState(0);
  const [autoRegisterBatchSize, setAutoRegisterBatchSize] = useState<number>(20);
  const [autoRegisterResult, setAutoRegisterResult] = useState<{
    processed: number;
    created: number;
    skipped_existing: number;
    email_sent: number;
    email_failed: number;
    remaining_candidates?: number;
    run_limit?: number;
    email_delay_ms?: number;
    email_jitter_ms?: number;
  } | null>(null);

  useEffect(() => {
    setCustomersLoading(true);
    const query = customersSearch.trim();
    searchAdminCustomers(adminToken, { q: query, limit: query.length >= 2 ? 500 : 2000 })
      .then(setCustomersList)
      .catch(() => setCustomersList([]))
      .finally(() => setCustomersLoading(false));
  }, [customersSearch, adminToken, customersFetchTrigger]);

  useEffect(() => {
    setAutoRegisterLoading(true);
    fetchAdminAutoRegisterCandidates(adminToken, { q: customersSearch.trim() })
      .then((data) => {
        setAutoRegisterCandidates(data.candidates);
        setAutoRegisterStats(data.stats);
        setAutoRegisterAutoModeEnabled(data.auto_mode_enabled);
        setAutoRegisterResult(null);
      })
      .catch((e: unknown) => {
        setAutoRegisterCandidates([]);
        setAutoRegisterStats(null);
        onError((e as Error)?.message || "Ошибка загрузки кандидатов");
      })
      .finally(() => setAutoRegisterLoading(false));
  }, [customersSearch, adminToken, autoRegisterFetchTrigger, onError]);

  useEffect(() => {
    void onUsersRefresh();
  }, [onUsersRefresh]);

  const handleExportCustomers = useCallback(() => {
    const filtered = customersShowOnlyWithoutEmail
      ? customersList.filter((c) => !c.email || String(c.email).trim() === "")
      : customersList;
    const sorted = [...filtered].sort((a, b) => {
      const key = customersSortBy;
      const va = (key === "inn" ? a.inn : key === "customer_name" ? (a.customer_name || "") : (a.email || "")).toLowerCase();
      const vb = (key === "inn" ? b.inn : key === "customer_name" ? (b.customer_name || "") : (b.email || "")).toLowerCase();
      const cmp = va.localeCompare(vb, "ru");
      return customersSortOrder === "asc" ? cmp : -cmp;
    });
    const escapeCsv = (s: string) => {
      const t = String(s ?? "").trim();
      if (/[",\r\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
      return t;
    };
    const header = "ИНН;Наименование;Email";
    const rows = sorted.map((c) => [c.inn, c.customer_name || "", c.email || ""].map(escapeCsv).join(";"));
    const csv = "\uFEFF" + header + "\r\n" + rows.join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `заказчики_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [customersList, customersShowOnlyWithoutEmail, customersSortBy, customersSortOrder]);

  const runCustomersCacheRefresh = async (dryRun: boolean) => {
    setCustomersSyncLoading(true);
    setCustomersSyncMessage(null);
    setCustomersSyncDebugRequest("");
    setCustomersSyncDebugResponse("");
    const endpoint = "/api/admin-refresh-customers-cache";
    const base = typeof window !== "undefined" ? window.location.origin : "";
    const internalCurl = dryRun
      ? `curl -X POST "${base}${endpoint}" -H "Authorization: Bearer <adminToken>" -H "Content-Type: application/json" -d '{"dryRun":true}'`
      : `curl -X POST "${base}${endpoint}" -H "Authorization: Bearer <adminToken>" -H "Content-Type: application/json" -d '{}'`;
    let gotHttpResponse = false;
    try {
      const { ok, status, data, text } = await postAdminRefreshCustomersCache(adminToken, { dryRun });
      const debug = buildSyncDebugFromResponse(status, text, data, internalCurl);
      setCustomersSyncDebugRequest(debug.debugRequest);
      setCustomersSyncDebugResponse(debug.debugResponse);
      gotHttpResponse = true;
      if (!ok) throw new Error(data.error || (dryRun ? "Не удалось выполнить Getcustomers" : "Не удалось обновить справочник заказчиков"));
      if (dryRun) {
        setCustomersSyncMessage(`Getcustomers (dry-run): ${Number(data.customers_count || 0)} записей, кэш не изменён`);
      } else {
        setCustomersSyncMessage(`Обновлено: ${Number(data.customers_count || 0)} записей`);
        setCustomersFetchTrigger((n) => n + 1);
      }
    } catch (e: unknown) {
      setCustomersSyncMessage((e as Error)?.message || (dryRun ? "Не удалось выполнить Getcustomers" : "Не удалось обновить справочник заказчиков"));
      if (!gotHttpResponse) {
        const errDebug = buildSyncDebugFromError(internalCurl, (e as Error)?.message || "Неизвестная ошибка");
        setCustomersSyncDebugRequest(errDebug.debugRequest);
        setCustomersSyncDebugResponse(errDebug.debugResponse);
      }
    } finally {
      setCustomersSyncLoading(false);
    }
  };

  const filtered = customersShowOnlyWithoutEmail
    ? customersList.filter((c) => !c.email || String(c.email).trim() === "")
    : customersList;
  const sorted = [...filtered].sort((a, b) => {
    const key = customersSortBy;
    const va = (key === "inn" ? a.inn : key === "customer_name" ? (a.customer_name || "") : (a.email || "")).toLowerCase();
    const vb = (key === "inn" ? b.inn : key === "customer_name" ? (b.customer_name || "") : (b.email || "")).toLowerCase();
    const cmp = va.localeCompare(vb, "ru");
    return customersSortOrder === "asc" ? cmp : -cmp;
  });
  const toggleSort = (col: "inn" | "customer_name" | "email") => {
    if (customersSortBy === col) setCustomersSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else { setCustomersSortBy(col); setCustomersSortOrder("asc"); }
  };
  const thStyle: React.CSSProperties = { padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" };
  const thClass = "sortable-th";
  const customerIsRegistered = (c: { inn: string; email?: string }) => {
    const email = (c.email || "").trim().toLowerCase();
    if (!email) return false;
    return users.some((u) => u.login?.toLowerCase() === email || u.inn === c.inn || (u.companies?.some((comp) => comp.inn === c.inn) ?? false));
  };

  return (
    <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
      <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Справочник заказчиков</Typography.Body>
      <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
        Данные из <code style={{ fontSize: "0.75rem" }}>GETAPI?metod=Getcustomers</code> (сервисный логин 1С), кэш обновляется кроном каждые 15 минут.
      </Typography.Body>
      <Flex gap="var(--element-gap, 0.75rem)" align="center" wrap="wrap" style={{ marginBottom: "var(--space-3, 0.75rem)" }}>
        <label htmlFor="customers-search" className="visually-hidden">Поиск заказчиков по ИНН или наименованию</label>
        <Input
          id="customers-search"
          type="text"
          placeholder="Поиск по ИНН или наименованию..."
          value={customersSearch}
          onChange={(e) => setCustomersSearch(e.target.value)}
          className="admin-form-input"
          style={{ maxWidth: "24rem" }}
          aria-label="Поиск по ИНН или наименованию"
        />
        <label htmlFor="customers-only-without-email" style={{ display: "flex", alignItems: "center", gap: "0.35rem", cursor: "pointer", fontSize: "0.9rem" }}>
          <input
            id="customers-only-without-email"
            type="checkbox"
            checked={customersShowOnlyWithoutEmail}
            onChange={(e) => setCustomersShowOnlyWithoutEmail(e.target.checked)}
          />
          <Typography.Body>Только без email</Typography.Body>
        </label>
        <Button
          type="button"
          className="filter-button"
          disabled={customersLoading}
          onClick={() => {
            setCustomersSyncMessage(null);
            setCustomersFetchTrigger((n) => n + 1);
          }}
          style={{ marginLeft: "auto" }}
        >
          {customersLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ verticalAlign: "middle", marginRight: "0.35rem" }} /> : null}
          Обновить
        </Button>
        {isSuperAdmin && (
          <>
            <Button type="button" className="filter-button" disabled={customersSyncLoading} onClick={() => void runCustomersCacheRefresh(true)}>
              {customersSyncLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ verticalAlign: "middle", marginRight: "0.35rem" }} /> : null}
              Тест Getcustomers
            </Button>
            <Button type="button" className="button-primary" disabled={customersSyncLoading} onClick={() => void runCustomersCacheRefresh(false)}>
              {customersSyncLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ verticalAlign: "middle", marginRight: "0.35rem" }} /> : null}
              Обновить из 1С
            </Button>
          </>
        )}
        {isSuperAdmin && (
          <Button
            type="button"
            className="filter-button"
            disabled={customersLoading || customersList.length === 0}
            onClick={handleExportCustomers}
            aria-label="Выгрузить заказчиков в CSV"
          >
            <Download className="w-4 h-4" style={{ verticalAlign: "middle", marginRight: "0.35rem" }} />
            Выгрузить
          </Button>
        )}
      </Flex>
      {customersSyncMessage && (
        <Typography.Body style={{ marginBottom: "0.65rem", fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>
          {customersSyncMessage}
        </Typography.Body>
      )}
      <SyncDebugPanel debugRequest={customersSyncDebugRequest} debugResponse={customersSyncDebugResponse} />
      <Panel className="cargo-card" style={{ padding: "0.75rem", marginBottom: "0.75rem", border: "1px dashed var(--color-border)" }}>
        <Flex align="center" justify="space-between" wrap="wrap" gap="0.5rem" style={{ marginBottom: "0.5rem" }}>
          <Typography.Body style={{ fontWeight: 600 }}>Dry-run: кандидаты на автосоздание</Typography.Body>
          <Flex align="center" gap="0.5rem" wrap="wrap">
            <Typography.Body style={{ fontSize: "0.8rem", color: autoRegisterAutoModeEnabled ? "var(--color-success-status)" : "var(--color-text-secondary)" }}>
              Auto-mode: {autoRegisterAutoModeEnabled ? "включен" : "выключен (AUTO_REGISTER_FROM_CUSTOMERS=false)"}
            </Typography.Body>
            <Button
              type="button"
              className="filter-button"
              onClick={() => setAutoRegisterFetchTrigger((n) => n + 1)}
              disabled={autoRegisterLoading}
              style={{ padding: "0.35rem 0.6rem", fontSize: "0.8rem" }}
            >
              {autoRegisterLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ marginRight: "0.25rem" }} /> : null}
              Обновить dry-run
            </Button>
            {isSuperAdmin && autoRegisterAutoModeEnabled && autoRegisterCandidates.length > 0 && (
              <>
                <select
                  className="admin-form-input"
                  value={String(autoRegisterBatchSize)}
                  onChange={(e) => setAutoRegisterBatchSize(Math.max(1, Math.min(200, parseInt(e.target.value, 10) || 20)))}
                  style={{ padding: "0.25rem 0.5rem", fontSize: "0.8rem" }}
                  aria-label="Размер партии авто-регистрации"
                >
                  <option value="10">Партия: 10</option>
                  <option value="20">Партия: 20</option>
                  <option value="50">Партия: 50</option>
                  <option value="100">Партия: 100</option>
                </select>
                <Button
                  type="button"
                  className="button-primary"
                  onClick={async () => {
                    setAutoRegisterApplying(true);
                    onError(null);
                    setAutoRegisterResult(null);
                    try {
                      const data = await runAdminAutoRegisterBatch(adminToken, autoRegisterBatchSize);
                      setAutoRegisterResult(data);
                      await onUsersRefresh();
                      setAutoRegisterFetchTrigger((n) => n + 1);
                    } catch (e: unknown) {
                      onError((e as Error)?.message || "Ошибка авто-регистрации");
                    } finally {
                      setAutoRegisterApplying(false);
                    }
                  }}
                  disabled={autoRegisterApplying}
                  style={{ padding: "0.35rem 0.6rem", fontSize: "0.8rem" }}
                >
                  {autoRegisterApplying ? <Loader2 className="w-4 h-4 animate-spin" style={{ marginRight: "0.25rem" }} /> : null}
                  Авто-режим: запустить партию
                </Button>
              </>
            )}
          </Flex>
        </Flex>
        <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.45rem" }}>
          Кандидат: валидный email из справочника и отсутствие пользователя с таким login/email.
        </Typography.Body>
        {autoRegisterStats && (
          <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.45rem" }}>
            Всего в справочнике: {autoRegisterStats.total}; с email: {autoRegisterStats.withEmail}; валидных email: {autoRegisterStats.validEmail}; уже зарегистрированы: {autoRegisterStats.alreadyRegistered}; кандидаты: {autoRegisterCandidates.length}
          </Typography.Body>
        )}
        {autoRegisterResult && (
          <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.45rem" }}>
            Результат партии: обработано {autoRegisterResult.processed}, создано {autoRegisterResult.created}, пропущено {autoRegisterResult.skipped_existing}, email отправлено {autoRegisterResult.email_sent}, ошибок email {autoRegisterResult.email_failed}, осталось кандидатов {autoRegisterResult.remaining_candidates ?? 0}. Пауза между письмами: {autoRegisterResult.email_delay_ms ?? 0}ms + jitter {autoRegisterResult.email_jitter_ms ?? 0}ms.
          </Typography.Body>
        )}
        {autoRegisterLoading ? (
          <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>Загрузка кандидатов…</Typography.Body>
        ) : autoRegisterCandidates.length === 0 ? (
          <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>Кандидатов нет.</Typography.Body>
        ) : (
          <div style={{ overflowX: "auto", maxHeight: "12rem", overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
              <thead>
                <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                  <th style={{ padding: "0.35rem 0.5rem", textAlign: "left", fontWeight: 600 }}>ИНН</th>
                  <th style={{ padding: "0.35rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Наименование</th>
                  <th style={{ padding: "0.35rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Email</th>
                </tr>
              </thead>
              <tbody>
                {autoRegisterCandidates.slice(0, 200).map((c) => (
                  <tr key={`${c.inn}-${c.email}`} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "0.35rem 0.5rem" }}>{c.inn || "—"}</td>
                    <td style={{ padding: "0.35rem 0.5rem" }}>{c.customer_name || "—"}</td>
                    <td style={{ padding: "0.35rem 0.5rem", color: "var(--color-text-secondary)" }}>{c.email || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {customersLoading ? (
        <Flex align="center" gap="0.5rem">
          <Loader2 className="w-4 h-4 animate-spin" />
          <Typography.Body>Загрузка...</Typography.Body>
        </Flex>
      ) : customersList.length === 0 ? (
        <Typography.Body style={{ color: "var(--color-text-secondary)" }}>
          {customersSearch.trim().length >= 2 ? "Нет совпадений" : "Справочник пуст"}
        </Typography.Body>
      ) : (
        <>
          <div style={{ overflowX: "auto", maxHeight: "60vh", overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
              <thead>
                <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                  <th className={thClass} style={thStyle} onClick={() => toggleSort("inn")} role="columnheader" aria-sort={customersSortBy === "inn" ? (customersSortOrder === "asc" ? "ascending" : "descending") : undefined} title="Нажмите для сортировки">
                    ИНН {customersSortBy === "inn" ? (customersSortOrder === "asc" ? <ChevronUp size={14} style={{ verticalAlign: "middle", marginLeft: 2 }} /> : <ChevronDown size={14} style={{ verticalAlign: "middle", marginLeft: 2 }} />) : <ChevronsUpDown size={14} style={{ verticalAlign: "middle", marginLeft: 2, opacity: 0.5 }} />}
                  </th>
                  <th className={thClass} style={thStyle} onClick={() => toggleSort("customer_name")} role="columnheader" aria-sort={customersSortBy === "customer_name" ? (customersSortOrder === "asc" ? "ascending" : "descending") : undefined} title="Нажмите для сортировки">
                    Наименование {customersSortBy === "customer_name" ? (customersSortOrder === "asc" ? <ChevronUp size={14} style={{ verticalAlign: "middle", marginLeft: 2 }} /> : <ChevronDown size={14} style={{ verticalAlign: "middle", marginLeft: 2 }} />) : <ChevronsUpDown size={14} style={{ verticalAlign: "middle", marginLeft: 2, opacity: 0.5 }} />}
                  </th>
                  <th className={thClass} style={thStyle} onClick={() => toggleSort("email")} role="columnheader" aria-sort={customersSortBy === "email" ? (customersSortOrder === "asc" ? "ascending" : "descending") : undefined} title="Нажмите для сортировки">
                    Email {customersSortBy === "email" ? (customersSortOrder === "asc" ? <ChevronUp size={14} style={{ verticalAlign: "middle", marginLeft: 2 }} /> : <ChevronDown size={14} style={{ verticalAlign: "middle", marginLeft: 2 }} />) : <ChevronsUpDown size={14} style={{ verticalAlign: "middle", marginLeft: 2, opacity: 0.5 }} />}
                  </th>
                  <th style={{ ...thStyle, cursor: "default", minWidth: "10rem" }}>Действия</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c) => {
                  const hasEmail = !!(c.email && String(c.email).trim());
                  const isRegistered = customerIsRegistered(c);
                  const canRegister = hasEmail && !isRegistered;
                  const isRegistering = registeringCustomerInn === c.inn;
                  return (
                    <tr key={c.inn} style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td style={{ padding: "0.5rem 0.75rem" }}>{c.inn}</td>
                      <td style={{ padding: "0.5rem 0.75rem" }}>{c.customer_name || "—"}</td>
                      <td style={{ padding: "0.5rem 0.75rem", color: "var(--color-text-secondary)" }}>{c.email || "—"}</td>
                      <td style={{ padding: "0.5rem 0.75rem" }}>
                        {canRegister ? (
                          <Button
                            type="button"
                            className="filter-button"
                            style={{ padding: "0.35rem 0.6rem", fontSize: "0.8rem" }}
                            disabled={isRegistering}
                            onClick={async () => {
                              setRegisteringCustomerInn(c.inn);
                              onError(null);
                              try {
                                await registerAdminUser(adminToken, {
                                  email: c.email?.trim(),
                                  inn: c.inn,
                                  company_name: c.customer_name || "",
                                  send_email: true,
                                });
                                await onUsersRefresh();
                              } catch (e: unknown) {
                                onError((e as Error)?.message ?? "Ошибка");
                              } finally {
                                setRegisteringCustomerInn(null);
                              }
                            }}
                          >
                            {isRegistering ? <Loader2 className="w-4 h-4 animate-spin" style={{ verticalAlign: "middle", marginRight: "0.25rem" }} /> : null}
                            Зарегистрировать
                          </Button>
                        ) : isRegistered ? (
                          <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>В списке пользователей</Typography.Body>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginTop: "0.5rem" }}>
            Записей: {sorted.length}{customersShowOnlyWithoutEmail && sorted.length !== customersList.length ? ` (из ${customersList.length})` : ""}
          </Typography.Body>
        </>
      )}
    </Panel>
  );
}

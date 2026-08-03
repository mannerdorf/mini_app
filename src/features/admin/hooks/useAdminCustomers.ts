import { useCallback, useEffect, useMemo, useState } from "react";
import { searchAdminCustomers, postAdminRefreshCustomersCache } from "../../../api/client/admin/customers";
import { registerAdminUser } from "../../../api/client/admin/users";
import { fetchAdminAutoRegisterCandidates, runAdminAutoRegisterBatch } from "../../../api/client/admin/autoRegister";
import { buildSyncDebugFromError, buildSyncDebugFromResponse } from "../lib/syncDebug";
import {
  customerIsRegistered,
  exportCustomersCsv,
  filterCustomersWithoutEmail,
  sortCustomers,
  type AdminCustomerRow,
  type AdminCustomersSortBy,
  type AdminCustomersTabUser,
} from "../lib/adminCustomersHelpers";

type Params = {
  adminToken: string;
  isSuperAdmin: boolean;
  users: AdminCustomersTabUser[];
  onUsersRefresh: () => Promise<void>;
  onError: (msg: string | null) => void;
};

export function useAdminCustomers({ adminToken, isSuperAdmin, users, onUsersRefresh, onError }: Params) {
  const [list, setList] = useState<AdminCustomerRow[]>([]);
  const [search, setSearch] = useState("");
  const [showOnlyWithoutEmail, setShowOnlyWithoutEmail] = useState(false);
  const [sortBy, setSortBy] = useState<AdminCustomersSortBy>("customer_name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [loading, setLoading] = useState(false);
  const [fetchTrigger, setFetchTrigger] = useState(0);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncDebugRequest, setSyncDebugRequest] = useState("");
  const [syncDebugResponse, setSyncDebugResponse] = useState("");
  const [registeringInn, setRegisteringInn] = useState<string | null>(null);
  const [autoRegisterCandidates, setAutoRegisterCandidates] = useState<AdminCustomerRow[]>([]);
  const [autoRegisterStats, setAutoRegisterStats] = useState<{ total: number; withEmail: number; validEmail: number; alreadyRegistered: number } | null>(null);
  const [autoRegisterLoading, setAutoRegisterLoading] = useState(false);
  const [autoRegisterApplying, setAutoRegisterApplying] = useState(false);
  const [autoRegisterAutoModeEnabled, setAutoRegisterAutoModeEnabled] = useState(false);
  const [autoRegisterFetchTrigger, setAutoRegisterFetchTrigger] = useState(0);
  const [autoRegisterBatchSize, setAutoRegisterBatchSize] = useState(20);
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
    setLoading(true);
    const query = search.trim();
    searchAdminCustomers(adminToken, { q: query, limit: query.length >= 2 ? 500 : 2000 })
      .then(setList)
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, [search, adminToken, fetchTrigger]);

  useEffect(() => {
    setAutoRegisterLoading(true);
    fetchAdminAutoRegisterCandidates(adminToken, { q: search.trim() })
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
  }, [search, adminToken, autoRegisterFetchTrigger, onError]);

  useEffect(() => {
    void onUsersRefresh();
  }, [onUsersRefresh]);

  const sorted = useMemo(
    () => sortCustomers(filterCustomersWithoutEmail(list, showOnlyWithoutEmail), sortBy, sortOrder),
    [list, showOnlyWithoutEmail, sortBy, sortOrder],
  );

  const toggleSort = useCallback((col: AdminCustomersSortBy) => {
    if (sortBy === col) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSortBy(col);
      setSortOrder("asc");
    }
  }, [sortBy]);

  const refreshList = useCallback(() => {
    setSyncMessage(null);
    setFetchTrigger((n) => n + 1);
  }, []);

  const handleExport = useCallback(() => {
    exportCustomersCsv(sorted);
  }, [sorted]);

  const runCacheRefresh = useCallback(async (dryRun: boolean) => {
    setSyncLoading(true);
    setSyncMessage(null);
    setSyncDebugRequest("");
    setSyncDebugResponse("");
    const endpoint = "/api/admin-refresh-customers-cache";
    const base = typeof window !== "undefined" ? window.location.origin : "";
    const internalCurl = dryRun
      ? `curl -X POST "${base}${endpoint}" -H "Authorization: Bearer <adminToken>" -H "Content-Type: application/json" -d '{"dryRun":true}'`
      : `curl -X POST "${base}${endpoint}" -H "Authorization: Bearer <adminToken>" -H "Content-Type: application/json" -d '{}'`;
    let gotHttpResponse = false;
    try {
      const { ok, status, data, text } = await postAdminRefreshCustomersCache(adminToken, { dryRun });
      const debug = buildSyncDebugFromResponse(status, text, data, internalCurl);
      setSyncDebugRequest(debug.debugRequest);
      setSyncDebugResponse(debug.debugResponse);
      gotHttpResponse = true;
      if (!ok) throw new Error(data.error || (dryRun ? "Не удалось выполнить Getcustomers" : "Не удалось обновить справочник заказчиков"));
      if (dryRun) {
        setSyncMessage(`Getcustomers (dry-run): ${Number(data.customers_count || 0)} записей, кэш не изменён`);
      } else {
        setSyncMessage(`Обновлено: ${Number(data.customers_count || 0)} записей`);
        setFetchTrigger((n) => n + 1);
      }
    } catch (e: unknown) {
      setSyncMessage((e as Error)?.message || (dryRun ? "Не удалось выполнить Getcustomers" : "Не удалось обновить справочник заказчиков"));
      if (!gotHttpResponse) {
        const errDebug = buildSyncDebugFromError(internalCurl, (e as Error)?.message || "Неизвестная ошибка");
        setSyncDebugRequest(errDebug.debugRequest);
        setSyncDebugResponse(errDebug.debugResponse);
      }
    } finally {
      setSyncLoading(false);
    }
  }, [adminToken]);

  const registerCustomer = useCallback(async (c: AdminCustomerRow) => {
    setRegisteringInn(c.inn);
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
      setRegisteringInn(null);
    }
  }, [adminToken, onError, onUsersRefresh]);

  const runAutoRegisterBatch = useCallback(async () => {
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
  }, [adminToken, autoRegisterBatchSize, onError, onUsersRefresh]);

  const isCustomerRegistered = useCallback(
    (c: AdminCustomerRow) => customerIsRegistered(c, users),
    [users],
  );

  return {
    isSuperAdmin,
    list,
    search,
    setSearch,
    showOnlyWithoutEmail,
    setShowOnlyWithoutEmail,
    sortBy,
    sortOrder,
    loading,
    sorted,
    syncLoading,
    syncMessage,
    syncDebugRequest,
    syncDebugResponse,
    registeringInn,
    autoRegisterCandidates,
    autoRegisterStats,
    autoRegisterLoading,
    autoRegisterApplying,
    autoRegisterAutoModeEnabled,
    autoRegisterBatchSize,
    setAutoRegisterBatchSize,
    autoRegisterResult,
    toggleSort,
    refreshList,
    handleExport,
    runCacheRefresh,
    registerCustomer,
    runAutoRegisterBatch,
    refreshAutoRegister: () => setAutoRegisterFetchTrigger((n) => n + 1),
    isCustomerRegistered,
  };
}

export type AdminCustomersState = ReturnType<typeof useAdminCustomers>;

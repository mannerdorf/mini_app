import { useEffect, useRef } from "react";
import { postAuthRegisteredLogin } from "../api/client/auth";
import { normalizePermissions, useAuth } from "../contexts/AuthContext";
import { useAppShell } from "../contexts/AppShellContext";
import {
  hasStaleActiveCustomerInn,
  isSingleRegisteredCustomerAccount,
  normalizeAccountCustomerSelection,
} from "../lib/accountCustomer";
import { getClientPlatform } from "../lib/clientPlatform";
import { WB_TAB, isWildberriesTab } from "../wb/appWb";
import type { Account, CustomerOption, Tab } from "../types";

export function useRegisteredAccountSync(isWbOnlyUser: boolean, isRedReturnsOnlyUser = false) {
  const { accounts, setAccounts, activeAccount } = useAuth();
  const { activeTab, setActiveTab } = useAppShell();

  const registeredLoginRefreshInFlightRef = useRef(false);
  const syncedRegisteredAccountsRef = useRef<Set<string>>(new Set());
  const profileRefreshInFlightRef = useRef(false);

  useEffect(() => {
    if (!activeAccount?.isRegisteredUser || !activeAccount?.permissions) return;
    const perms = activeAccount.permissions;
    if (isRedReturnsOnlyUser) return;
    if (isWbOnlyUser) {
      if (!isWildberriesTab(activeTab)) setActiveTab(WB_TAB);
      return;
    }
    const canHome = true;
    const canCargo = true;
    const canDocs = !!(
      perms.doc_invoices ||
      perms.doc_acts ||
      perms.doc_orders ||
      perms.doc_sendings ||
      perms.doc_claims ||
      perms.doc_contracts ||
      perms.doc_acts_settlement ||
      perms.doc_tariffs
    );
    const canExpenseRequests = !!(perms.supervisor && perms.haulz);
    const isAllowed =
      activeTab === "profile"
        ? true
        : activeTab === "cargo"
          ? canCargo
          : activeTab === "docs"
            ? canDocs
            : activeTab === "expense_requests"
              ? canExpenseRequests
              : activeTab === "dashboard" || activeTab === "home"
                ? canHome
                : true;
    if (isAllowed) return;
    const fallback: Tab = canHome
      ? "dashboard"
      : canDocs
        ? "docs"
        : canCargo
          ? "cargo"
          : canExpenseRequests
            ? "expense_requests"
            : "profile";
    if (fallback !== activeTab) setActiveTab(fallback);
  }, [activeAccount?.id, activeAccount?.isRegisteredUser, activeAccount?.permissions, activeTab, isWbOnlyUser, isRedReturnsOnlyUser, setActiveTab]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!activeAccount?.isRegisteredUser || !activeAccount.login || !activeAccount.password) return;
    const section = String(activeTab);
    const login = activeAccount.login;
    const password = activeAccount.password;
    const t = window.setTimeout(() => {
      void fetch("/api/app-activity-beacon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          login,
          password,
          section,
          platform: getClientPlatform().platform,
        }),
        keepalive: true,
      }).catch(() => {});
    }, 650);
    return () => window.clearTimeout(t);
  }, [activeTab, activeAccount?.isRegisteredUser, activeAccount?.login, activeAccount?.password]);

  useEffect(() => {
    if (typeof window === "undefined" || accounts.length === 0) return;
    const needRefresh = accounts.filter(
      (acc) =>
        acc.isRegisteredUser &&
        acc.password &&
        (!acc.customers?.length ||
          !acc.activeCustomerInn ||
          acc.inCustomerDirectory === undefined ||
          hasStaleActiveCustomerInn(acc)),
    );
    if (needRefresh.length === 0) return;
    if (registeredLoginRefreshInFlightRef.current) return;
    registeredLoginRefreshInFlightRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const updates: {
          id: string;
          customers: CustomerOption[];
          activeCustomerInn: string | null;
          customer: string | null;
          accessAllInns: boolean;
          inCustomerDirectory?: boolean;
          permissions?: Record<string, boolean>;
          financialAccess?: boolean;
        }[] = [];
        for (const acc of needRefresh) {
          try {
            const { ok, data } = await postAuthRegisteredLogin({
              email: acc.login.trim().toLowerCase(),
              password: acc.password,
              activity: "silent",
            });
            if (cancelled || !ok || !data?.ok || !data?.user) continue;
            const u = data.user as Record<string, unknown>;
            const customers: CustomerOption[] = u.inn ? [{ name: (u.companyName as string) || (u.inn as string), inn: u.inn as string }] : [];
            updates.push({
              id: acc.id,
              customers,
              activeCustomerInn: (u.inn as string) ?? null,
              customer: (u.companyName as string) ?? null,
              accessAllInns: !!u.accessAllInns,
              inCustomerDirectory: !!u.inCustomerDirectory,
              permissions: normalizePermissions(u.permissions),
              financialAccess: u.financialAccess as boolean | undefined,
            });
          } catch {
            // ignore
          }
        }
        if (cancelled || updates.length === 0) return;
        setAccounts((prev) =>
          prev.map((a) => {
            const up = updates.find((u) => u.id === a.id);
            if (!up) return a;
            const hadCustomers = (a.customers?.length ?? 0) > 0;
            const merged: Account = {
              ...a,
              customers:
                !up.accessAllInns && up.customers.length > 0
                  ? up.customers
                  : a.customers?.length
                    ? (a.customers ?? up.customers)
                    : up.customers,
              accessAllInns: up.accessAllInns,
              inCustomerDirectory: up.inCustomerDirectory,
              ...(up.permissions != null ? { permissions: up.permissions } : {}),
              ...(up.financialAccess != null ? { financialAccess: up.financialAccess } : {}),
            };
            if (!up.accessAllInns && up.customers.length === 1) {
              merged.activeCustomerInn = up.customers[0].inn;
              merged.customer = up.customers[0].name ?? up.customer ?? undefined;
            } else if (!up.accessAllInns && up.activeCustomerInn) {
              merged.activeCustomerInn = up.activeCustomerInn ?? undefined;
              merged.customer = up.customer ?? merged.customer;
            } else {
              merged.activeCustomerInn = a.activeCustomerInn ?? up.activeCustomerInn ?? undefined;
              merged.customer = hadCustomers ? (a.customer ?? up.customer ?? undefined) : (up.customer ?? undefined);
            }
            return normalizeAccountCustomerSelection(merged);
          }),
        );
      } finally {
        registeredLoginRefreshInFlightRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accounts, setAccounts]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!activeAccount?.id || !activeAccount?.isRegisteredUser || !activeAccount?.login || !activeAccount?.password) return;
    if (syncedRegisteredAccountsRef.current.has(activeAccount.id)) return;
    syncedRegisteredAccountsRef.current.add(activeAccount.id);
    let cancelled = false;
    (async () => {
      try {
        const { ok, data } = await postAuthRegisteredLogin({
          email: activeAccount.login.trim().toLowerCase(),
          password: activeAccount.password,
          activity: "silent",
        });
        if (cancelled || !ok || !data?.ok || !data?.user) return;
        const user = data.user as Record<string, unknown>;
        const customers: CustomerOption[] = user.inn
          ? [{ name: (user.companyName as string) || (user.inn as string), inn: user.inn as string }]
          : [];
        const accessAllInns = !!user.accessAllInns;
        setAccounts((prev) =>
          prev.map((acc) => {
            if (acc.id !== activeAccount.id) return acc;
            const merged: Account = {
              ...acc,
              customers:
                !accessAllInns && customers.length > 0 ? customers : acc.customers?.length ? acc.customers : customers,
              accessAllInns,
              inCustomerDirectory: !!user.inCustomerDirectory,
              ...(normalizePermissions(user.permissions) ? { permissions: normalizePermissions(user.permissions) } : {}),
              ...(user.financialAccess != null ? { financialAccess: user.financialAccess as boolean } : {}),
            };
            if (!accessAllInns && customers.length === 1) {
              merged.activeCustomerInn = customers[0].inn;
              merged.customer = customers[0].name ?? (user.companyName as string | undefined);
            } else if (!accessAllInns && user.inn) {
              merged.activeCustomerInn = String(user.inn);
              merged.customer = (user.companyName as string | undefined) ?? merged.customer;
            } else {
              merged.activeCustomerInn = acc.activeCustomerInn ?? (user.inn as string | undefined) ?? undefined;
              merged.customer = acc.customer ?? (user.companyName as string | undefined) ?? undefined;
            }
            return normalizeAccountCustomerSelection(merged);
          }),
        );
      } catch {
        // ignore best-effort refresh errors
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeAccount?.id, activeAccount?.isRegisteredUser, activeAccount?.login, activeAccount?.password, setAccounts]);

  useEffect(() => {
    if (!activeAccount?.id) return;
    if (!isSingleRegisteredCustomerAccount(activeAccount) && !hasStaleActiveCustomerInn(activeAccount)) return;
    const normalized = normalizeAccountCustomerSelection(activeAccount);
    if (
      normalized.activeCustomerInn === activeAccount.activeCustomerInn &&
      normalized.customer === activeAccount.customer
    ) {
      return;
    }
    setAccounts((prev) => prev.map((a) => (a.id === activeAccount.id ? normalized : a)));
  }, [
    activeAccount?.id,
    activeAccount?.activeCustomerInn,
    activeAccount?.customer,
    activeAccount?.customers,
    activeAccount?.isRegisteredUser,
    activeAccount?.accessAllInns,
    setAccounts,
  ]);

  useEffect(() => {
    if (!activeAccount?.login || activeAccount.accessAllInns) return;
    if (isSingleRegisteredCustomerAccount(activeAccount) && (activeAccount.customers?.length ?? 0) === 1) return;
    const loginKey = activeAccount.login.trim().toLowerCase();
    let cancelled = false;
    fetch(`/api/companies?login=${encodeURIComponent(loginKey)}`)
      .then((r) => r.json())
      .then((data: { companies?: { login: string; inn: string; name: string }[] }) => {
        if (cancelled) return;
        const list = (data.companies ?? []).filter((c) => c.login === loginKey && (c.inn || "").trim());
        if (list.length !== 1) return;
        const only = list[0];
        if (only.inn === activeAccount.activeCustomerInn && only.name === activeAccount.customer) return;
        setAccounts((prev) =>
          prev.map((a) =>
            a.id === activeAccount.id ? { ...a, activeCustomerInn: only.inn, customer: only.name || a.customer } : a,
          ),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeAccount?.id, activeAccount?.login, activeAccount?.accessAllInns, activeAccount?.customers?.length, setAccounts]);

  useEffect(() => {
    if (activeTab !== "profile") return;
    if (!activeAccount?.id || !activeAccount?.isRegisteredUser || !activeAccount?.login || !activeAccount?.password) return;
    if (profileRefreshInFlightRef.current) return;
    profileRefreshInFlightRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const { ok, data } = await postAuthRegisteredLogin({
          email: activeAccount.login.trim().toLowerCase(),
          password: activeAccount.password,
          activity: "silent",
        });
        if (cancelled || !ok || !data?.ok || !data?.user) return;
        const user = data.user as Record<string, unknown>;
        setAccounts((prev) =>
          prev.map((acc) =>
            acc.id !== activeAccount.id
              ? acc
              : {
                  ...acc,
                  ...(normalizePermissions(user.permissions) ? { permissions: normalizePermissions(user.permissions) } : {}),
                  ...(user.financialAccess != null ? { financialAccess: user.financialAccess as boolean } : {}),
                  inCustomerDirectory:
                    user.inCustomerDirectory !== undefined ? !!user.inCustomerDirectory : acc.inCustomerDirectory,
                },
          ),
        );
      } catch {
        // ignore
      } finally {
        profileRefreshInFlightRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, activeAccount?.id, activeAccount?.isRegisteredUser, activeAccount?.login, activeAccount?.password, setAccounts]);
}

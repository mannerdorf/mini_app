import { useCallback } from "react";
import {
  ensureOk,
  readJsonOrText,
  extractErrorMessage,
  extractCustomerFromPerevozki,
  extractInnFromPerevozki,
  getExistingInns,
  dedupeCustomersByInn,
} from "../utils";
import { postCompaniesSave } from "../api/client/companies";
import { postGetCustomers, postPerevozkiList } from "../api/client/perevozkiClient";
import { recordLegalAcceptanceQuiet } from "../api/client/legal";
import { persistTwoFaSettingsSilent } from "../api/client/twoFa";
import { useAuth } from "../contexts/AuthContext";
import { useAppShell } from "../contexts/AppShellContext";
import * as dateUtils from "../lib/dateUtils";
import type { Account, CustomerOption } from "../types";

const { getDateRange } = dateUtils;

export function useAccountActions() {
  const {
    accounts,
    setAccounts,
    activeAccountId,
    setActiveAccountId,
    setSelectedAccountIds,
  } = useAuth();
  const { setActiveTab } = useAppShell();

  const persistTwoFactorSettings = useCallback(async (account: Account, patch: Partial<Account>) => {
    const login = account.login;
    if (!login) return;
    const enabled = patch.twoFactorEnabled ?? account.twoFactorEnabled ?? false;
    const method = patch.twoFactorMethod ?? account.twoFactorMethod ?? "google";
    const telegramLinked = patch.twoFactorTelegramLinked ?? account.twoFactorTelegramLinked ?? false;
    await persistTwoFaSettingsSilent({ login, enabled, method, telegramLinked });
  }, []);

  const handleRemoveAccount = useCallback(
    (accountId: string) => {
      const newAccounts = accounts.filter((acc) => acc.id !== accountId);
      setAccounts(newAccounts);
      setSelectedAccountIds((prev) => {
        const next = prev.filter((id) => id !== accountId);
        if (next.length === 0 && newAccounts.length > 0) return [newAccounts[0].id];
        return next;
      });
      if (activeAccountId === accountId) {
        if (newAccounts.length > 0) {
          setActiveAccountId(newAccounts[0].id);
        } else {
          setActiveAccountId(null);
          setActiveTab("cargo");
        }
      }
    },
    [accounts, activeAccountId, setAccounts, setActiveAccountId, setActiveTab, setSelectedAccountIds],
  );

  const handleSwitchAccount = useCallback(
    (accountId: string) => {
      setActiveAccountId(accountId);
      setSelectedAccountIds([accountId]);
    },
    [setActiveAccountId, setSelectedAccountIds],
  );

  const handleToggleSelectedAccount = useCallback(
    (accountId: string) => {
      setSelectedAccountIds((prev) => {
        const has = prev.includes(accountId);
        if (has) {
          if (prev.length <= 1) return prev;
          const next = prev.filter((id) => id !== accountId);
          setActiveAccountId(next[0] ?? null);
          return next;
        }
        const next = [...prev, accountId];
        if (prev.length === 0) setActiveAccountId(accountId);
        return next;
      });
    },
    [setActiveAccountId, setSelectedAccountIds],
  );

  const handleUpdateAccount = useCallback(
    (accountId: string, patch: Partial<Account>) => {
      let target: Account | null = null;
      setAccounts((prev) => {
        const next = prev.map((acc) => (acc.id === accountId ? { ...acc, ...patch } : acc));
        target = next.find((acc) => acc.id === accountId) || null;
        return next;
      });
      if (
        target &&
        ("twoFactorEnabled" in patch || "twoFactorMethod" in patch || "twoFactorTelegramLinked" in patch)
      ) {
        void persistTwoFactorSettings(target, patch);
      }
    },
    [persistTwoFactorSettings, setAccounts],
  );

  const handleAddAccount = useCallback(
    async (login: string, password: string) => {
      if (accounts.find((acc) => acc.login === login)) {
        throw new Error("Аккаунт с таким логином уже добавлен");
      }

      const loginKey = login.trim().toLowerCase();

      const { ok: customersOk, data: customersData } = await postGetCustomers(login, password);
      if (customersOk) {
        const rawList = Array.isArray(customersData?.customers)
          ? customersData.customers
          : Array.isArray(customersData?.Customers)
            ? customersData.Customers
            : [];
        const customers: CustomerOption[] = dedupeCustomersByInn(
          rawList
            .map((c: Record<string, unknown>) => ({
              name: String(c?.name ?? c?.Name ?? "").trim() || String(c?.Inn ?? c?.inn ?? ""),
              inn: String(c?.inn ?? c?.INN ?? c?.Inn ?? "").trim(),
            }))
            .filter((c: CustomerOption) => c.inn.length > 0),
        );
        if (customers.length > 0) {
          const existingInns = await getExistingInns(
            accounts.map((a) => (typeof a.login === "string" ? a.login.trim().toLowerCase() : "")).filter(Boolean),
          );
          const alreadyAdded = customers.find((c) => c.inn && existingInns.has(c.inn));
          if (alreadyAdded) {
            throw new Error("Компания уже в списке");
          }
          const accountId = `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const newAccount: Account = {
            login,
            password,
            id: accountId,
            customers,
            activeCustomerInn: customers[0].inn,
            customer: customers[0].name,
          };
          setAccounts((prev) => [...prev, newAccount]);
          setActiveAccountId(accountId);
          postCompaniesSave({ login: loginKey, customers })
            .then((data: unknown) => {
              const d = data as { saved?: number; warning?: string };
              if (d?.saved !== undefined && d.saved === 0 && d.warning) console.warn("companies-save:", d.warning);
            })
            .catch((err) => console.warn("companies-save error:", err));
          recordLegalAcceptanceQuiet(loginKey, password);
          return;
        }
      }

      const { dateFrom, dateTo } = getDateRange("все");
      const res = await postPerevozkiList({ login, password, dateFrom, dateTo });
      if (!res.ok) {
        let message = "Ошибка авторизации";
        try {
          const payload = await readJsonOrText(res);
          const extracted = extractErrorMessage(payload);
          if (extracted) message = extracted;
        } catch {
          /* ignore */
        }
        throw new Error(message);
      }
      const payload = await readJsonOrText(res);
      const detectedCustomer = extractCustomerFromPerevozki(payload);
      const detectedInn = extractInnFromPerevozki(payload);
      const existingInns = await getExistingInns(
        accounts.map((a) => (typeof a.login === "string" ? a.login.trim().toLowerCase() : "")).filter(Boolean),
      );
      if (detectedInn && existingInns.has(detectedInn)) {
        throw new Error("Компания уже в списке");
      }
      const accountId = `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const newAccount: Account = {
        login,
        password,
        id: accountId,
        customer: detectedCustomer || undefined,
        ...(detectedInn ? { activeCustomerInn: detectedInn } : {}),
      };
      setAccounts((prev) => [...prev, newAccount]);
      setActiveAccountId(accountId);
      const companyInn = detectedInn ?? "";
      const companyName = detectedCustomer || login.trim() || "Компания";
      postCompaniesSave({ login: loginKey, customers: [{ name: companyName, inn: companyInn }] }).catch(() => {});
      recordLegalAcceptanceQuiet(loginKey, password);
    },
    [accounts, setAccounts, setActiveAccountId],
  );

  return {
    handleRemoveAccount,
    handleSwitchAccount,
    handleToggleSelectedAccount,
    handleUpdateAccount,
    handleAddAccount,
  };
}

import { useCallback } from "react";
import { clearPickupForLogout } from "../features/pickup/client";
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

  const handleRemoveAccount = useCallback(
    async (accountId: string) => {
      const removed = accounts.find(acc => acc.id === accountId);
      if (!removed) return;
      // Another account entry with the same login still owns this offline work.
      if (!accounts.some(acc => acc.id !== accountId && acc.login.trim().toLowerCase() === removed.login.trim().toLowerCase())) {
        try {
          if (!await clearPickupForLogout([removed.login], () => window.confirm("Есть неотправленные отметки или черновики водителя. Удалить аккаунт вместе с этими данными? Нажмите «Отмена», чтобы сначала отправить их."))) return;
        } catch {
          window.alert("Не удалось очистить локальные данные. Удаление аккаунта отменено.");
          return;
        }
      }
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
      // Profile updates its local copy only after the server confirms a 2FA change.
      setAccounts(prev => prev.map(acc => acc.id === accountId ? {...acc,...patch} : acc));
    },
    [setAccounts],
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
            accounts,
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
          postCompaniesSave({ login: loginKey, password, customers })
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
        accounts,
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
      postCompaniesSave({ login: loginKey, password, customers: [{ name: companyName, inn: companyInn }] }).catch(() => {});
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

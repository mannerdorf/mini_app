import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Account, AccountPermissions, AuthData } from "../types";
import { getInitialAuthState } from "../lib/authState";
import { normalizeAccountCustomerSelection } from "../lib/accountCustomer";

const toBooleanPermission = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return undefined;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") return true;
    if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") return false;
  }
  return undefined;
};

const normalizePermissions = (raw: unknown): AccountPermissions | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const boolValue = toBooleanPermission(value);
    if (boolValue !== undefined) out[key] = boolValue;
  }
  if (out.dashboard === true) out.analytics = true;
  if (out.analytics !== true) out.dashboard = false;
  return out as AccountPermissions;
};

export type AuthContextValue = {
  accounts: Account[];
  setAccounts: React.Dispatch<React.SetStateAction<Account[]>>;
  activeAccountId: string | null;
  setActiveAccountId: React.Dispatch<React.SetStateAction<string | null>>;
  selectedAccountIds: string[];
  setSelectedAccountIds: React.Dispatch<React.SetStateAction<string[]>>;
  auth: AuthData | null;
  activeAccount: Account | null;
  selectedAuths: AuthData[];
  updateActiveAccountCustomer: (customer: string) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accounts, setAccounts] = useState<Account[]>(() => getInitialAuthState().accounts);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(() => getInitialAuthState().activeAccountId);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>(() => getInitialAuthState().selectedAccountIds);

  const auth = useMemo(() => {
    if (!activeAccountId) return null;
    const account = accounts.find((acc) => acc.id === activeAccountId);
    if (!account || typeof account.login !== "string" || typeof account.password !== "string") return null;
    const inn = account.activeCustomerInn ?? account.customers?.[0]?.inn ?? "";
    const forceInn = !!account.isRegisteredUser && !account.accessAllInns && !!inn;
    return {
      login: account.login,
      password: account.password,
      ...((forceInn || account.activeCustomerInn || inn) ? { inn: inn || account.activeCustomerInn || undefined } : {}),
      ...(account.isRegisteredUser ? { isRegisteredUser: true } : {}),
    };
  }, [accounts, activeAccountId]);

  const activeAccount = useMemo(() => {
    if (!activeAccountId) return null;
    return accounts.find((acc) => acc.id === activeAccountId) || null;
  }, [accounts, activeAccountId]);

  const selectedAuths = useMemo((): AuthData[] => {
    const ids =
      selectedAccountIds.length > 0
        ? selectedAccountIds
        : activeAccountId && accounts.some((a) => a.id === activeAccountId)
          ? [activeAccountId]
          : [];
    return ids
      .map((id) => accounts.find((acc) => acc.id === id))
      .filter((acc): acc is Account => !!acc)
      .map((acc) => {
        const inn = acc.activeCustomerInn ?? acc.customers?.[0]?.inn ?? "";
        return {
          login: acc.login,
          password: acc.password,
          ...(inn || acc.activeCustomerInn ? { inn: inn || acc.activeCustomerInn || undefined } : {}),
          ...(acc.isRegisteredUser ? { isRegisteredUser: true } : {}),
        };
      });
  }, [accounts, selectedAccountIds, activeAccountId]);

  useEffect(() => {
    if (accounts.length > 0 && selectedAccountIds.length === 0 && activeAccountId && accounts.some((a) => a.id === activeAccountId)) {
      setSelectedAccountIds([activeAccountId]);
    }
  }, [accounts.length, activeAccountId, selectedAccountIds.length]);

  useEffect(() => {
    setAccounts((prev) =>
      prev.map((acc) => {
        const withCustomer =
          acc.customers?.length && !acc.customer ? { ...acc, customer: acc.customers[0].name } : acc;
        const normalizedPerms = normalizePermissions(withCustomer.permissions);
        return normalizeAccountCustomerSelection({
          ...withCustomer,
          ...(normalizedPerms ? { permissions: normalizedPerms } : {}),
          inCustomerDirectory: undefined,
        });
      })
    );
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = window.localStorage.getItem("haulz.auth");
      if (window.localStorage.getItem("haulz.accounts")) return;
      if (!saved) return;
      const parsed = JSON.parse(saved) as AuthData;
      if (parsed?.login && parsed?.password) {
        const accountId = parsed.id || `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        setAccounts([{ login: parsed.login, password: parsed.password, id: accountId }]);
        setActiveAccountId(accountId);
        setSelectedAccountIds([accountId]);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || accounts.length === 0) return;
    try {
      window.localStorage.setItem(
        "haulz.accounts",
        JSON.stringify(accounts.map((acc) => normalizeAccountCustomerSelection(acc)))
      );
      if (activeAccountId) {
        window.localStorage.setItem("haulz.activeAccountId", activeAccountId);
      }
      if (selectedAccountIds.length > 0) {
        window.localStorage.setItem("haulz.selectedAccountIds", JSON.stringify(selectedAccountIds));
      }
    } catch {
      // ignore
    }
  }, [accounts, activeAccountId, selectedAccountIds]);

  const updateActiveAccountCustomer = useCallback(
    (customer: string) => {
      if (!activeAccountId || !customer) return;
      setAccounts((prev) => {
        const current = prev.find((acc) => acc.id === activeAccountId);
        if (!current || current.customer === customer) return prev;
        return prev.map((acc) => (acc.id === activeAccountId ? { ...acc, customer } : acc));
      });
    },
    [activeAccountId]
  );

  const value = useMemo(
    () => ({
      accounts,
      setAccounts,
      activeAccountId,
      setActiveAccountId,
      selectedAccountIds,
      setSelectedAccountIds,
      auth,
      activeAccount,
      selectedAuths,
      updateActiveAccountCustomer,
    }),
    [
      accounts,
      activeAccountId,
      selectedAccountIds,
      auth,
      activeAccount,
      selectedAuths,
      updateActiveAccountCustomer,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { normalizePermissions };

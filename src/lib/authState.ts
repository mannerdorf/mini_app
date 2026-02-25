/**
 * Восстановление состояния аккаунтов из localStorage при загрузке приложения.
 * Кэшируется на одну сессию, чтобы не парсить повторно.
 */
import type { Account, AuthData } from "../types";

export type InitialAuthState = {
    accounts: Account[];
    activeAccountId: string | null;
    selectedAccountIds: string[];
};

const EMPTY_AUTH_STATE: InitialAuthState = {
    accounts: [],
    activeAccountId: null,
    selectedAccountIds: [],
};

let initialAuthStateCache: InitialAuthState | undefined = undefined;

export function getInitialAuthState(): InitialAuthState {
    if (initialAuthStateCache !== undefined) return initialAuthStateCache;
    if (typeof window === "undefined") return EMPTY_AUTH_STATE;
    try {
        const savedAccounts = window.localStorage.getItem("haulz.accounts");
        if (savedAccounts) {
            let parsedAccounts = JSON.parse(savedAccounts) as unknown;
            if (!Array.isArray(parsedAccounts)) parsedAccounts = [];
            parsedAccounts = (parsedAccounts as Account[]).filter(
                (acc): acc is Account =>
                    acc != null &&
                    typeof acc === "object" &&
                    typeof (acc as Account).login === "string" &&
                    typeof (acc as Account).password === "string"
            );
            if (parsedAccounts.length > 0) {
                parsedAccounts = (parsedAccounts as Account[]).map((acc) => {
                    const withCustomer =
                        acc.customers?.length && !acc.customer
                            ? { ...acc, customer: acc.customers[0].name }
                            : acc;
                    return { ...withCustomer, inCustomerDirectory: undefined as boolean | undefined };
                });
                const savedActiveId = window.localStorage.getItem("haulz.activeAccountId");
                const activeId =
                    savedActiveId && (parsedAccounts as Account[]).some((acc) => acc.id === savedActiveId)
                        ? savedActiveId
                        : (parsedAccounts as Account[])[0].id;
                let selectedIds: string[] = [];
                const savedSelectedIds = window.localStorage.getItem("haulz.selectedAccountIds");
                if (savedSelectedIds) {
                    try {
                        const ids = JSON.parse(savedSelectedIds) as string[];
                        if (Array.isArray(ids) && ids.length > 0) {
                            const valid = ids.filter((id) =>
                                (parsedAccounts as Account[]).some((acc) => acc.id === id)
                            );
                            if (valid.length > 0) selectedIds = valid;
                        }
                    } catch {
                        // ignore
                    }
                }
                if (selectedIds.length === 0) selectedIds = activeId ? [activeId] : [];
                initialAuthStateCache = {
                    accounts: parsedAccounts as Account[],
                    activeAccountId: activeId,
                    selectedAccountIds: selectedIds,
                };
                return initialAuthStateCache;
            }
        }
        const saved = window.localStorage.getItem("haulz.auth");
        if (saved) {
            const parsed = JSON.parse(saved) as AuthData;
            if (parsed?.login && parsed?.password) {
                const accountId =
                    (parsed as AuthData & { id?: string }).id ||
                    `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                const account: Account = {
                    login: parsed.login,
                    password: parsed.password,
                    id: accountId,
                };
                initialAuthStateCache = {
                    accounts: [account],
                    activeAccountId: accountId,
                    selectedAccountIds: [accountId],
                };
                return initialAuthStateCache;
            }
        }
    } catch {
        // ignore
    }
    return EMPTY_AUTH_STATE;
}

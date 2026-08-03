import { useCallback, useEffect, useState } from "react";
import type { Account } from "../../../types";
import {
    deleteAccountingSverkiRequest,
    fetchAccountingExpenseRequests,
    fetchAccountingSverkiRequests,
    fetchProfileClaims,
    patchAccountingExpenseRequestStatus,
    postAccountingSverkiRequests,
} from "../../../api/client/profile/accounting";

export type AccountingExpenseRequestRow = {
    id: string;
    createdAt: string;
    department: string;
    docNumber?: string;
    docDate?: string;
    period?: string;
    categoryName: string;
    amount: number;
    comment: string;
    vehicleOrEmployee: string;
    status: string;
    login: string;
    attachments?: Array<{ id: number; fileName: string; mimeType: string | null }>;
};

export type AccountingClaimRow = {
    id: number;
    claimNumber?: string;
    cargoNumber?: string;
    description?: string;
    requestedAmount?: number;
    approvedAmount?: number;
    status?: string;
    slaDueAt?: string | null;
    createdAt?: string;
};

export type SverkiRequestRow = {
    id: number;
    login: string;
    customerInn: string;
    contract: string;
    periodFrom: string;
    periodTo: string;
    status: string;
    createdAt: string;
};

export type UseProfileAccountingParams = {
    activeAccount: Account | null;
    fetchEnabled: boolean;
};

export function useProfileAccounting({ activeAccount, fetchEnabled }: UseProfileAccountingParams) {
    const [accountingRequestsItems, setAccountingRequestsItems] = useState<Array<{ id: string; createdAt: string; department: string; docNumber?: string; docDate?: string; period?: string; categoryName: string; amount: number; comment: string; vehicleOrEmployee: string; status: string; login: string; attachments?: Array<{ id: number; fileName: string; mimeType: string | null }> }>>([]);
    const [selectedAccountingRequest, setSelectedAccountingRequest] = useState<typeof accountingRequestsItems[0] | null>(null);
    const [accountingRequestsLoading, setAccountingRequestsLoading] = useState(false);
    const [accountingRequestsError, setAccountingRequestsError] = useState<string | null>(null);
    const [accountingSubsection, setAccountingSubsection] = useState<"expense_requests" | "sverki" | "claims">("expense_requests");
    const [accountingClaimsItems, setAccountingClaimsItems] = useState<Array<{
        id: number;
        claimNumber?: string;
        cargoNumber?: string;
        description?: string;
        requestedAmount?: number;
        approvedAmount?: number;
        status?: string;
        slaDueAt?: string | null;
        createdAt?: string;
    }>>([]);
    const [accountingClaimsLoading, setAccountingClaimsLoading] = useState(false);
    const [accountingClaimsError, setAccountingClaimsError] = useState<string | null>(null);
    const [accountingClaimsView, setAccountingClaimsView] = useState<"new" | "in_progress" | "all">("all");
    const [accountingClaimsSearch, setAccountingClaimsSearch] = useState("");
    const [accountingClaimsStatusFilter, setAccountingClaimsStatusFilter] = useState("");
    const [sverkiRequests, setSverkiRequests] = useState<Array<{ id: number; login: string; customerInn: string; contract: string; periodFrom: string; periodTo: string; status: string; createdAt: string }>>([]);
    const [sverkiRequestsLoading, setSverkiRequestsLoading] = useState(false);
    const [sverkiRequestsUpdatingId, setSverkiRequestsUpdatingId] = useState<number | null>(null);
    const fetchAccountingRequests = useCallback(async () => {
        if (!activeAccount?.login || !activeAccount?.password || activeAccount?.permissions?.accounting !== true) return;
        setAccountingRequestsLoading(true);
        setAccountingRequestsError(null);
        const auth = { login: activeAccount.login, password: activeAccount.password };
        try {
            const data = await fetchAccountingExpenseRequests(auth);
            const items = Array.isArray(data.items)
                ? data.items.map((r: any) => ({
                    id: String(r.id ?? ""),
                    createdAt: r.createdAt ?? "",
                    department: r.department ?? "",
                    docNumber: r.docNumber,
                    docDate: r.docDate,
                    period: r.period,
                    categoryName: r.categoryName ?? r.categoryId ?? "",
                    amount: Number(r.amount) || 0,
                    comment: r.comment ?? "",
                    vehicleOrEmployee: r.vehicleOrEmployee ?? "",
                    status: r.status ?? "",
                    login: r.login ?? "",
                    attachments: Array.isArray(r.attachments) ? r.attachments : [],
                }))
                : [];
            setAccountingRequestsItems(items);
        } catch (e) {
            setAccountingRequestsError((e as Error)?.message || "Ошибка сети");
            setAccountingRequestsItems([]);
        } finally {
            setAccountingRequestsLoading(false);
        }
    }, [activeAccount?.login, activeAccount?.password, activeAccount?.permissions?.accounting]);

    const fetchSverkiRequests = useCallback(async () => {
        if (!activeAccount?.login || !activeAccount?.password || activeAccount?.permissions?.accounting !== true) return;
        setSverkiRequestsLoading(true);
        const auth = { login: activeAccount.login, password: activeAccount.password };
        try {
            const data = await fetchAccountingSverkiRequests(auth);
            setSverkiRequests(Array.isArray(data?.requests) ? data.requests : []);
        } catch {
            setSverkiRequests([]);
        } finally {
            setSverkiRequestsLoading(false);
        }
    }, [activeAccount?.login, activeAccount?.password, activeAccount?.permissions?.accounting]);

    const markSverkiRequestAsSent = useCallback(async (id: number) => {
        if (!activeAccount?.login || !activeAccount?.password) return;
        setSverkiRequestsUpdatingId(id);
        const auth = { login: activeAccount.login, password: activeAccount.password };
        try {
            await postAccountingSverkiRequests(auth, { id, status: "edo_sent" });
            setSverkiRequests((prev) => prev.map((r) => r.id === id ? { ...r, status: "edo_sent", updatedAt: new Date().toISOString() } as any : r));
        } finally {
            setSverkiRequestsUpdatingId(null);
        }
    }, [activeAccount?.login, activeAccount?.password]);

    const deleteSverkiRequest = useCallback(async (id: number) => {
        if (!window.confirm("Удалить заявку акта сверки? Действие нельзя отменить.")) return;
        if (!activeAccount?.login || !activeAccount?.password) return;
        setSverkiRequestsUpdatingId(id);
        const auth = { login: activeAccount.login, password: activeAccount.password };
        try {
            await deleteAccountingSverkiRequest(auth, id);
            setSverkiRequests((prev) => prev.filter((r) => r.id !== id));
        } finally {
            setSverkiRequestsUpdatingId(null);
        }
    }, [activeAccount?.login, activeAccount?.password]);

    const reloadAccountingClaims = useCallback(async () => {
        if (!activeAccount?.login || !activeAccount?.password || activeAccount?.permissions?.accounting !== true) return;
        setAccountingClaimsLoading(true);
        setAccountingClaimsError(null);
        const params = new URLSearchParams();
        const q = accountingClaimsSearch.trim();
        if (q) params.set("q", q);
        if (accountingClaimsStatusFilter) {
            params.set("status", accountingClaimsStatusFilter);
        } else if (accountingClaimsView === "new") {
            params.set("status", "new");
        }
        const selectedInn = String(activeAccount.activeCustomerInn || activeAccount.inn || "").trim();
        if (selectedInn) params.set("inn", selectedInn);
        const auth = { login: activeAccount.login, password: activeAccount.password };
        try {
            const data = await fetchProfileClaims(auth, params, { inn: selectedInn });
            const items = Array.isArray(data?.claims) ? data.claims : [];
            setAccountingClaimsItems(items);
        } catch (e) {
            setAccountingClaimsItems([]);
            setAccountingClaimsError((e as Error)?.message || "Ошибка сети");
        } finally {
            setAccountingClaimsLoading(false);
        }
    }, [
        activeAccount?.activeCustomerInn,
        activeAccount?.inn,
        activeAccount?.login,
        activeAccount?.password,
        activeAccount?.permissions?.accounting,
        accountingClaimsSearch,
        accountingClaimsStatusFilter,
        accountingClaimsView,
    ]);

    useEffect(() => {
        if (fetchEnabled && activeAccount?.permissions?.accounting === true) {
            void fetchAccountingRequests();
        }
    }, [fetchEnabled, activeAccount?.permissions?.accounting, fetchAccountingRequests]);

    useEffect(() => {
        if (fetchEnabled && accountingSubsection === "sverki" && activeAccount?.permissions?.accounting === true) {
            void fetchSverkiRequests();
        }
    }, [fetchEnabled, accountingSubsection, activeAccount?.permissions?.accounting, fetchSverkiRequests]);
    useEffect(() => {
        if (fetchEnabled && accountingSubsection === "claims" && activeAccount?.permissions?.accounting === true) {
            void reloadAccountingClaims();
        }
    }, [fetchEnabled, accountingSubsection, activeAccount?.permissions?.accounting, reloadAccountingClaims]);

    const patchExpenseRequestStatus = useCallback(async (itemId: string, status: "sent" | "paid") => {
        if (!activeAccount?.login || !activeAccount?.password) return;
        const auth = { login: activeAccount.login, password: activeAccount.password };
        try {
            await patchAccountingExpenseRequestStatus(auth, itemId, status);
            void fetchAccountingRequests();
        } catch (e) {
            setAccountingRequestsError((e as Error)?.message || "Ошибка сети");
        }
    }, [activeAccount?.login, activeAccount?.password, fetchAccountingRequests]);


    return {
        accountingRequestsItems,
        selectedAccountingRequest,
        setSelectedAccountingRequest,
        accountingRequestsLoading,
        accountingRequestsError,
        accountingSubsection,
        setAccountingSubsection,
        accountingClaimsItems,
        accountingClaimsLoading,
        accountingClaimsError,
        accountingClaimsView,
        setAccountingClaimsView,
        accountingClaimsSearch,
        setAccountingClaimsSearch,
        accountingClaimsStatusFilter,
        setAccountingClaimsStatusFilter,
        sverkiRequests,
        sverkiRequestsLoading,
        sverkiRequestsUpdatingId,
        fetchAccountingRequests,
        fetchSverkiRequests,
        markSverkiRequestAsSent,
        deleteSverkiRequest,
        reloadAccountingClaims,
        patchExpenseRequestStatus,
    };
}

export type ProfileAccountingState = ReturnType<typeof useProfileAccounting>;

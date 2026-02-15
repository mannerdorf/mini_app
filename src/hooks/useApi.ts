/**
 * SWR-based API hooks for caching. Prevents re-fetching on tab switch
 * when data is still fresh (staleTime 60s, cache 5min).
 */
import useSWR from "swr";
import { useCallback } from "react";
import { apiFetchJson } from "../utils";
import { PROXY_API_BASE_URL, PROXY_API_GETCUSTOMERS_URL, PROXY_API_INVOICES_URL, PROXY_API_ACTS_URL } from "../constants/config";
import type { AuthData, CargoItem, PerevozkiRole } from "../types";

/** SWR config: 60s consider fresh, 5min cache */
const SWR_OPTIONS = {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 60 * 1000,
    keepPreviousData: true,
} as const;

const mapNumber = (value: unknown): number => {
    if (value === null || value === undefined) return 0;
    if (typeof value === "number") return value;
    const parsed = parseFloat(String(value).replace(",", "."));
    return isNaN(parsed) ? 0 : parsed;
};

const mapCargoItem = (item: Record<string, unknown>, role?: PerevozkiRole): CargoItem => ({
    ...item,
    Number: item.Number as string,
    DatePrih: item.DatePrih as string,
    DateVr: item.DateVr as string,
    State: item.State as string,
    Mest: mapNumber(item.Mest),
    PW: mapNumber(item.PW),
    W: mapNumber(item.W),
    Value: mapNumber(item.Value),
    Sum: mapNumber(item.Sum),
    StateBill: item.StateBill as string,
    Sender: item.Sender as string,
    Customer: (item.Customer ?? item.customer) as string,
    ...(role ? { _role: role } : {}),
} as CargoItem);

type PerevozkiParams = {
    auth: AuthData | null;
    dateFrom: string;
    dateTo: string;
    useServiceRequest?: boolean;
    inn?: string | null;
    /** When false, no fetch (for conditional prev period) */
    enabled?: boolean;
};

async function fetcherPerevozki(params: PerevozkiParams): Promise<CargoItem[]> {
    const { auth, dateFrom, dateTo, useServiceRequest, inn } = params;
    if (!auth?.login || !auth?.password) return [];
    const body: Record<string, unknown> = {
        login: auth.login,
        password: auth.password,
        dateFrom,
        dateTo,
        ...(useServiceRequest ? { serviceMode: true } : {}),
        ...(inn ? { inn } : auth.inn ? { inn: auth.inn } : {}),
        ...(auth.isRegisteredUser ? { isRegisteredUser: true } : {}),
    };
    const data = await apiFetchJson<{ items?: unknown[] } | unknown[]>(PROXY_API_BASE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const list = Array.isArray(data) ? data : (data && typeof data === "object" && "items" in data ? (data as { items: unknown[] }).items : []);
    return list.map((item: Record<string, unknown>) => mapCargoItem(item, useServiceRequest ? "Customer" : undefined));
}

export function usePerevozki(params: PerevozkiParams) {
    const { auth, dateFrom, dateTo, useServiceRequest, inn } = params;
    const key = auth?.login && auth?.password
        ? ["perevozki", auth.login, dateFrom, dateTo, !!useServiceRequest, inn ?? auth.inn ?? ""]
        : null;
    const { data, error, isLoading, mutate } = useSWR<CargoItem[]>(
        key,
        () => fetcherPerevozki(params),
        SWR_OPTIONS
    );
    return {
        items: data ?? [],
        error: error?.message ?? null,
        loading: isLoading,
        mutate,
    };
}

type PerevozkiMultiRoleParams = PerevozkiParams & {
    roleCustomer?: boolean;
    roleSender?: boolean;
    roleReceiver?: boolean;
};

async function fetcherPerevozkiMulti(params: PerevozkiMultiRoleParams): Promise<CargoItem[]> {
    const { auth, dateFrom, dateTo, useServiceRequest, roleCustomer, roleSender, roleReceiver } = params;
    if (!auth?.login || !auth?.password) return [];

    if (useServiceRequest) {
        const list = await fetcherPerevozki({
            auth,
            dateFrom,
            dateTo,
            useServiceRequest: true,
            inn: params.inn ?? auth.inn ?? undefined,
        });
        return list.map((i) => ({ ...i, _role: "Customer" as PerevozkiRole }));
    }

    const modes: PerevozkiRole[] = [];
    if (roleCustomer) modes.push("Customer");
    if (roleSender) modes.push("Sender");
    if (roleReceiver) modes.push("Receiver");
    if (modes.length === 0) return [];

    const basePayload = {
        login: auth.login,
        password: auth.password,
        dateFrom,
        dateTo,
        ...(auth.inn ? { inn: auth.inn } : {}),
        ...(auth.isRegisteredUser ? { isRegisteredUser: true } : {}),
    };

    const allMapped: CargoItem[] = [];
    for (const mode of modes) {
        const data = await apiFetchJson<{ items?: unknown[] } | unknown[]>(PROXY_API_BASE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...basePayload, mode }),
        });
        const list = Array.isArray(data) ? data : (data && typeof data === "object" && "items" in data ? (data as { items: unknown[] }).items : []);
        allMapped.push(...list.map((item: Record<string, unknown>) => mapCargoItem(item, mode)));
    }

    const parseDateValue = (value: unknown): number => {
        if (!value) return 0;
        const d = new Date(String(value));
        return isNaN(d.getTime()) ? 0 : d.getTime();
    };
    const rolePriority: Record<PerevozkiRole, number> = { Customer: 3, Sender: 2, Receiver: 1 };
    const chooseBest = (a: CargoItem, b: CargoItem): CargoItem => {
        const aDate = parseDateValue(a.DatePrih) || parseDateValue(a.DateVr);
        const bDate = parseDateValue(b.DatePrih) || parseDateValue(b.DateVr);
        if (aDate !== bDate) return aDate >= bDate ? a : b;
        return (rolePriority[(a._role as PerevozkiRole) || "Receiver"] >= rolePriority[(b._role as PerevozkiRole) || "Receiver"]) ? a : b;
    };

    const byNumber = new Map<string, CargoItem>();
    allMapped.forEach((item) => {
        const key = String(item.Number || "").trim();
        if (!key) return;
        const existing = byNumber.get(key);
        byNumber.set(key, existing ? chooseBest(existing, item) : item);
    });
    return Array.from(byNumber.values());
}

export function usePerevozkiMulti(params: PerevozkiMultiRoleParams) {
    const { auth, dateFrom, dateTo, useServiceRequest, roleCustomer, roleSender, roleReceiver } = params;
    const inn = params.inn ?? auth?.inn ?? "";
    const key = auth?.login && auth?.password
        ? ["perevozki-multi", auth.login, dateFrom, dateTo, !!useServiceRequest, roleCustomer, roleSender, roleReceiver, inn]
        : null;
    const { data, error, isLoading, mutate } = useSWR<CargoItem[]>(
        key,
        () => fetcherPerevozkiMulti(params),
        SWR_OPTIONS
    );
    return {
        items: data ?? [],
        error: error?.message ?? null,
        loading: isLoading,
        mutate,
    };
}

/** Параметры загрузки перевозок по нескольким аккаунтам (объединённый список) */
type PerevozkiMultiAccountsParams = {
    auths: AuthData[];
    dateFrom: string;
    dateTo: string;
    useServiceRequest?: boolean;
    roleCustomer?: boolean;
    roleSender?: boolean;
    roleReceiver?: boolean;
};

const parseDateValueForMerge = (value: unknown): number => {
    if (!value) return 0;
    const d = new Date(String(value));
    return isNaN(d.getTime()) ? 0 : d.getTime();
};
const rolePriorityForMerge: Record<PerevozkiRole, number> = { Customer: 3, Sender: 2, Receiver: 1 };
const chooseBestItem = (a: CargoItem, b: CargoItem): CargoItem => {
    const aDate = parseDateValueForMerge(a.DatePrih) || parseDateValueForMerge(a.DateVr);
    const bDate = parseDateValueForMerge(b.DatePrih) || parseDateValueForMerge(b.DateVr);
    if (aDate !== bDate) return aDate >= bDate ? a : b;
    return (rolePriorityForMerge[(a._role as PerevozkiRole) || "Receiver"] >= rolePriorityForMerge[(b._role as PerevozkiRole) || "Receiver"]) ? a : b;
};

async function fetcherPerevozkiMultiAccounts(params: PerevozkiMultiAccountsParams): Promise<CargoItem[]> {
    const { auths, dateFrom, dateTo, useServiceRequest, roleCustomer, roleSender, roleReceiver } = params;
    if (!auths.length) return [];
    const validAuths = auths.filter((a) => a?.login && a?.password);
    if (!validAuths.length) return [];
    if (validAuths.length === 1) {
        return fetcherPerevozkiMulti({
            auth: validAuths[0],
            dateFrom,
            dateTo,
            useServiceRequest,
            roleCustomer,
            roleSender,
            roleReceiver,
            inn: validAuths[0].inn ?? undefined,
        });
    }
    const results = await Promise.all(
        validAuths.map((auth) =>
            fetcherPerevozkiMulti({
                auth,
                dateFrom,
                dateTo,
                useServiceRequest,
                roleCustomer,
                roleSender,
                roleReceiver,
                inn: auth.inn ?? undefined,
            })
        )
    );
    const byNumber = new Map<string, CargoItem>();
    for (const list of results) {
        for (const item of list) {
            const key = String(item.Number || "").trim();
            if (!key) continue;
            const existing = byNumber.get(key);
            byNumber.set(key, existing ? chooseBestItem(existing, item) : item);
        }
    }
    return Array.from(byNumber.values());
}

export function usePerevozkiMultiAccounts(params: PerevozkiMultiAccountsParams) {
    const { auths, dateFrom, dateTo, useServiceRequest, roleCustomer, roleSender, roleReceiver } = params;
    const key =
        auths.length > 0 && auths.every((a) => a?.login && a?.password)
            ? [
                  "perevozki-multi-accounts",
                  auths.map((a) => `${a.login}:${a.inn ?? ""}`).sort().join(","),
                  dateFrom,
                  dateTo,
                  !!useServiceRequest,
                  roleCustomer,
                  roleSender,
                  roleReceiver,
              ]
            : null;
    const { data, error, isLoading, mutate } = useSWR<CargoItem[]>(
        key,
        () => fetcherPerevozkiMultiAccounts(params),
        SWR_OPTIONS
    );
    return {
        items: data ?? [],
        error: error?.message ?? null,
        loading: isLoading,
        mutate,
    };
}

type InvoicesParams = {
    auth: AuthData | null;
    dateFrom: string;
    dateTo: string;
    activeInn?: string;
    useServiceRequest?: boolean;
};

async function fetcherInvoices(params: InvoicesParams): Promise<unknown[]> {
    const { auth, dateFrom, dateTo, activeInn, useServiceRequest } = params;
    if (!auth?.login || !auth?.password) return [];
    const data = await apiFetchJson<{ items?: unknown[]; Invoices?: unknown[]; invoices?: unknown[] } | unknown[]>(PROXY_API_INVOICES_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            login: auth.login,
            password: auth.password,
            dateFrom,
            dateTo,
            inn: activeInn || undefined,
            serviceMode: useServiceRequest,
            ...(auth.isRegisteredUser ? { isRegisteredUser: true } : {}),
        }),
    });
    const list = Array.isArray(data) ? data : (data && typeof data === "object" ? (data as Record<string, unknown>).items ?? (data as Record<string, unknown>).Invoices ?? (data as Record<string, unknown>).invoices ?? [] : []);
    return Array.isArray(list) ? list : [];
}

export function useInvoices(params: InvoicesParams) {
    const { auth, dateFrom, dateTo, activeInn, useServiceRequest } = params;
    const key = auth?.login && auth?.password
        ? ["invoices", auth.login, dateFrom, dateTo, activeInn ?? "", !!useServiceRequest]
        : null;
    const { data, error, isLoading, mutate } = useSWR<unknown[]>(
        key,
        () => fetcherInvoices(params),
        SWR_OPTIONS
    );
    return {
        items: data ?? [],
        error: error?.message ?? null,
        loading: isLoading,
        mutate,
    };
}

type ActsParams = {
    auth: AuthData | null;
    dateFrom: string;
    dateTo: string;
    activeInn?: string;
    useServiceRequest?: boolean;
};

async function fetcherActs(params: ActsParams): Promise<unknown[]> {
    const { auth, dateFrom, dateTo, activeInn, useServiceRequest } = params;
    if (!auth?.login || !auth?.password) return [];
    const data = await apiFetchJson<{ items?: unknown[]; Acts?: unknown[]; acts?: unknown[] } | unknown[]>(PROXY_API_ACTS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            login: auth.login,
            password: auth.password,
            dateFrom,
            dateTo,
            inn: activeInn || undefined,
            serviceMode: useServiceRequest,
            ...(auth.isRegisteredUser ? { isRegisteredUser: true } : {}),
        }),
    });
    const list = Array.isArray(data) ? data : (data && typeof data === "object" ? (data as Record<string, unknown>).items ?? (data as Record<string, unknown>).Acts ?? (data as Record<string, unknown>).acts ?? [] : []);
    return Array.isArray(list) ? list : [];
}

export function useActs(params: ActsParams) {
    const { auth, dateFrom, dateTo, activeInn, useServiceRequest } = params;
    const key = auth?.login && auth?.password
        ? ["acts", auth.login, dateFrom, dateTo, activeInn ?? "", !!useServiceRequest]
        : null;
    const { data, error, isLoading, mutate } = useSWR<unknown[]>(
        key,
        () => fetcherActs(params),
        SWR_OPTIONS
    );
    return {
        items: data ?? [],
        error: error?.message ?? null,
        loading: isLoading,
        mutate,
    };
}

type CustomersParams = { auth: AuthData | null };

async function fetcherCustomers(params: CustomersParams): Promise<{ name: string; inn: string }[]> {
    const { auth } = params;
    if (!auth?.login || !auth?.password) return [];
    const data = await apiFetchJson<{ customers?: unknown[]; items?: unknown[] } | unknown[]>(PROXY_API_GETCUSTOMERS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: auth.login, password: auth.password }),
    });
    const list = Array.isArray(data) ? data : (data && typeof data === "object" ? (data as Record<string, unknown>).customers ?? (data as Record<string, unknown>).items ?? [] : []);
    return (list || []).map((c: Record<string, unknown>) => ({
        name: String(c.name ?? c.Name ?? c.наименование ?? ""),
        inn: String(c.inn ?? c.INN ?? c.ИНН ?? ""),
    }));
}

export function useCustomers(params: CustomersParams) {
    const { auth } = params;
    const key = auth?.login && auth?.password ? ["customers", auth.login] : null;
    const { data, error, isLoading, mutate } = useSWR(
        key,
        () => fetcherCustomers(params),
        { ...SWR_OPTIONS, dedupingInterval: 2 * 60 * 1000 }
    );
    return {
        customers: data ?? [],
        error: error?.message ?? null,
        loading: isLoading,
        mutate,
    };
}

type PrevPeriodParams = PerevozkiParams & {
    dateFromPrev: string;
    dateToPrev: string;
    /** When false or no prev range, no fetch */
    enabled?: boolean;
};

/** Previous period cargo for service mode comparison (Dashboard/Cargo) */
export function usePrevPeriodPerevozki(params: PrevPeriodParams) {
    const { auth, dateFromPrev, dateToPrev, enabled = true } = params;
    const key = enabled && auth?.login && auth?.password
        ? ["perevozki-prev", auth.login, dateFromPrev, dateToPrev]
        : null;
    const { data, error, isLoading } = useSWR<CargoItem[]>(
        key,
        () => fetcherPerevozki({ ...params, dateFrom: dateFromPrev, dateTo: dateToPrev, useServiceRequest: true }),
        SWR_OPTIONS
    );
    return {
        items: data ?? [],
        error: error?.message ?? null,
        loading: isLoading,
    };
}

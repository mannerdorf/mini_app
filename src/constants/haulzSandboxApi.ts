import type { ApiInventoryItem } from "./miniAppApiInventory";

const AUTH_BODY = {
    login: "{{LOGIN}}",
    password: "{{PASSWORD}}",
};

/** POST /api/invoices — прокси GetIinvoices (1С DeliveryWebService). */
export const HAULZ_INVOICES_SANDBOX_API: ApiInventoryItem = {
    method: "POST",
    path: "/api/invoices",
    navLabel: "GetIinvoices (счета)",
    note: "Прокси к 1С DeliveryWebService/GetIinvoices. Тело JSON: login, password, dateFrom, dateTo (YYYY-MM-DD), inn (опционально), serviceMode (bool), isRegisteredUser (bool, опционально). Ответ — массив счетов или объект ошибки.",
    examples: [
        {
            id: "period-inn",
            label: "Период и ИНН",
            body: {
                ...AUTH_BODY,
                dateFrom: "2026-01-01",
                dateTo: "2026-01-31",
                inn: "{{INN}}",
                serviceMode: false,
            },
        },
        {
            id: "service-mode",
            label: "Служебный режим (все ИНН за период)",
            body: {
                ...AUTH_BODY,
                dateFrom: "2026-01-01",
                dateTo: "2026-01-31",
                serviceMode: true,
            },
        },
    ],
};

/** POST /api/getcustomers — прокси GETAPI?metod=Getcustomers. */
export const HAULZ_GETCUSTOMERS_SANDBOX_API: ApiInventoryItem = {
    method: "POST",
    path: "/api/getcustomers",
    navLabel: "Getcustomers (заказчики)",
    note: "Прокси к 1С GETAPI?metod=Getcustomers. Тело: login, password. Для CMS-пользователей добавьте isRegisteredUser: true — тогда вернутся компании из БД (account_companies / cache_customers), без вызова 1С. Ответ: { customers, source }.",
    examples: [
        {
            id: "registered",
            label: "CMS-пользователь (из БД)",
            body: { ...AUTH_BODY, isRegisteredUser: true },
        },
        {
            id: "1c",
            label: "Прямой запрос 1С (учётка PostB)",
            body: { ...AUTH_BODY, isRegisteredUser: false },
        },
    ],
};

/** POST /api/getcustomer — прокси GETAPI?metod=Getcustomers&Inn=… (субконто, баланс). */
export const HAULZ_GETCUSTOMER_SANDBOX_API: ApiInventoryItem = {
    method: "POST",
    path: "/api/getcustomer",
    navLabel: "Getcustomers + Inn (субконто)",
    note: "Прокси к 1С GETAPI?metod=Getcustomers&Inn=…. Тело: login, password, inn. Для CMS: isRegisteredUser: true. Ответ: { customer: { inn, name, balance, debtsCount, debts? } }, balance = ΣДТ − ΣКт.",
    examples: [
        {
            id: "inn",
            label: "Баланс по ИНН",
            body: { ...AUTH_BODY, inn: "{{INN}}", isRegisteredUser: true },
        },
    ],
};

/** POST /api/customer-balances — балансы по списку ИНН (для главной). */
export const HAULZ_CUSTOMER_BALANCES_SANDBOX_API: ApiInventoryItem = {
    method: "POST",
    path: "/api/customer-balances",
    navLabel: "Customer balances (главная)",
    note: "Пакетный Getcustomers по массиву inns. Тело: login, password, inns: string[], namesByInn?: Record<string,string>, isRegisteredUser?. Ответ: { balances, totalBalance }.",
    examples: [
        {
            id: "batch",
            label: "Несколько компаний",
            body: {
                ...AUTH_BODY,
                isRegisteredUser: true,
                inns: ["{{INN}}"],
                namesByInn: { "{{INN}}": "Компания" },
            },
        },
    ],
};

export const HAULZ_SANDBOX_APIS: ApiInventoryItem[] = [
    HAULZ_INVOICES_SANDBOX_API,
    HAULZ_GETCUSTOMERS_SANDBOX_API,
    HAULZ_GETCUSTOMER_SANDBOX_API,
    HAULZ_CUSTOMER_BALANCES_SANDBOX_API,
];

export function getHaulzSandboxApi(id: string): ApiInventoryItem {
    return HAULZ_SANDBOX_APIS.find((api) => api.path === id) ?? HAULZ_SANDBOX_APIS[0];
}

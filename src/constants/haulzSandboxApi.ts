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

export const HAULZ_SANDBOX_APIS: ApiInventoryItem[] = [
    HAULZ_INVOICES_SANDBOX_API,
    HAULZ_GETCUSTOMERS_SANDBOX_API,
];

export function getHaulzSandboxApi(id: string): ApiInventoryItem {
    return HAULZ_SANDBOX_APIS.find((api) => api.path === id) ?? HAULZ_SANDBOX_APIS[0];
}

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
    note: "Прокси к 1С GETAPI?metod=Getcustomers — список заказчиков (ИНН, наименование) для логина. Тело JSON: login, password. Ответ: { customers: [{ inn, name }] }.",
    examples: [
        {
            id: "auth",
            label: "Логин и пароль",
            body: { ...AUTH_BODY },
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

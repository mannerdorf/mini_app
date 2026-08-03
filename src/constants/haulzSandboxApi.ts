import type { ApiInventoryItem } from "./miniAppApiInventory";

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
                login: "{{LOGIN}}",
                password: "{{PASSWORD}}",
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
                login: "{{LOGIN}}",
                password: "{{PASSWORD}}",
                dateFrom: "2026-01-01",
                dateTo: "2026-01-31",
                serviceMode: true,
            },
        },
    ],
};

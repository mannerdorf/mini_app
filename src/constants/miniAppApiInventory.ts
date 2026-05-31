/**
 * Справочник Partner API v1 для раздела «Профиль → API» (консоль теста).
 * Авторизация только через Bearer haulz_… — отдельный scope на каждый тип данных.
 */

/** Плейсхолдер "{{INN}}" в body подставляется из контекста аккаунта в консоли теста. */
export type ApiTryExample = {
    id: string;
    label: string;
    query?: Record<string, string>;
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
};

export type ApiInventoryItem = {
    method: string;
    path: string;
    note: string;
    examples?: ApiTryExample[];
};

export type ApiInventorySection = { group: string; items: ApiInventoryItem[] };

const BODY_DATES_INN = {
    dateFrom: "2026-01-01",
    dateTo: "2026-01-31",
    inn: "{{INN}}",
    serviceMode: false,
};

const BODY_INN_ONLY = {
    inn: "{{INN}}",
};

const DOC_PERIOD_EXAMPLE = [{ id: "period", label: "Период и ИНН (Bearer)", body: { ...BODY_DATES_INN } }];
const DOC_INN_EXAMPLE = [{ id: "inn", label: "Фильтр по ИНН (Bearer)", body: { ...BODY_INN_ONLY } }];

export const MINI_APP_API_INVENTORY: ApiInventorySection[] = [
    {
        group: "Partner API v1",
        items: [
            {
                method: "GET",
                path: "/api/partner/v1/health",
                note: "Проверка доступности Partner API v1. Bearer опционален.",
                examples: [{ id: "health", label: "Health check", query: {} }],
            },
            {
                method: "POST",
                path: "/api/partner/v1/cargo",
                note: "Перевозки из кэша. Scope: cargo:read. Тело: dateFrom, dateTo, inn, serviceMode.",
                examples: DOC_PERIOD_EXAMPLE,
            },
            {
                method: "POST",
                path: "/api/partner/v1/invoices",
                note: "Счета из кэша (режим запроса). Scope: invoices:read. Тело: dateFrom, dateTo, inn.",
                examples: [
                    {
                        id: "inv-period",
                        label: "Период и ИНН",
                        body: { dateFrom: "2026-01-01", dateTo: "2026-01-31", inn: "{{INN}}" },
                    },
                ],
            },
            {
                method: "POST",
                path: "/api/partner/v1/acts",
                note: "УПД из кэша (режим запроса). Scope: acts:read. Тело: dateFrom, dateTo, inn.",
                examples: [
                    {
                        id: "acts-period",
                        label: "Период и ИНН",
                        body: { dateFrom: "2026-01-01", dateTo: "2026-01-31", inn: "{{INN}}" },
                    },
                ],
            },
            {
                method: "POST",
                path: "/api/partner/v1/orders",
                note: "Заявки из кэша (режим запроса). Scope: orders:read. Тело: dateFrom, dateTo, inn, serviceMode.",
                examples: DOC_PERIOD_EXAMPLE,
            },
            {
                method: "POST",
                path: "/api/partner/v1/claims",
                note: "Претензии пользователя (режим запроса). Scope: claims:read. Тело: dateFrom, dateTo, inn.",
                examples: [
                    {
                        id: "claims-period",
                        label: "Период и ИНН",
                        body: { dateFrom: "2026-01-01", dateTo: "2026-01-31", inn: "{{INN}}" },
                    },
                ],
            },
            {
                method: "POST",
                path: "/api/partner/v1/contracts",
                note: "Договоры из кэша (режим запроса). Scope: contracts:read. Тело: inn (опционально).",
                examples: DOC_INN_EXAMPLE,
            },
            {
                method: "POST",
                path: "/api/partner/v1/sverki",
                note: "Акты сверок из кэша (режим запроса). Scope: sverki:read. Тело: inn (опционально).",
                examples: DOC_INN_EXAMPLE,
            },
            {
                method: "POST",
                path: "/api/partner/v1/tariffs",
                note: "Тарифы из кэша (режим запроса). Scope: tariffs:read. Тело: inn (опционально).",
                examples: DOC_INN_EXAMPLE,
            },
        ],
    },
];

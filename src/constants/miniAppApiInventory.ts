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
    /** Короткая подпись в боковом меню каталога */
    navLabel: string;
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

const DOWNLOAD_BODY = (metod: string) => ({
    metod,
    number: "000123456",
    inn: "{{INN}}",
});

const DOWNLOAD_REESTR_BODY = {
    metod: "РеестрКсчету",
    number: "0000123456",
    dateDoc: "2026-01-15T12:00:00",
    inn: "{{INN}}",
};

export const MINI_APP_API_INVENTORY: ApiInventorySection[] = [
    {
        group: "Partner API v1",
        items: [
            {
                method: "GET",
                path: "/api/partner/v1/health",
                navLabel: "Health check",
                note: "Проверка доступности Partner API v1. Bearer опционален.",
                examples: [{ id: "health", label: "Health check", query: {} }],
            },
            {
                method: "POST",
                path: "/api/partner/v1/cargo",
                navLabel: "Перевозки",
                note: "Перевозки из кэша. Scope: cargo:read. Тело: dateFrom, dateTo, inn, serviceMode.",
                examples: DOC_PERIOD_EXAMPLE,
            },
            {
                method: "POST",
                path: "/api/partner/v1/invoices",
                navLabel: "Счета (список)",
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
                navLabel: "УПД (список)",
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
                navLabel: "Заявки",
                note: "Заявки из кэша (режим запроса). Scope: orders:read. Тело: dateFrom, dateTo, inn, serviceMode.",
                examples: DOC_PERIOD_EXAMPLE,
            },
            {
                method: "POST",
                path: "/api/partner/v1/claims",
                navLabel: "Претензии",
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
                navLabel: "Договоры",
                note: "Договоры из кэша (режим запроса). Scope: contracts:read. Тело: inn (опционально).",
                examples: DOC_INN_EXAMPLE,
            },
            {
                method: "POST",
                path: "/api/partner/v1/sverki",
                navLabel: "Акты сверок",
                note: "Акты сверок из кэша (режим запроса). Scope: sverki:read. Тело: inn (опционально).",
                examples: DOC_INN_EXAMPLE,
            },
            {
                method: "POST",
                path: "/api/partner/v1/tariffs",
                navLabel: "Тарифы",
                note: "Тарифы из кэша (режим запроса). Scope: tariffs:read. Тело: inn (опционально).",
                examples: DOC_INN_EXAMPLE,
            },
            {
                method: "POST",
                path: "/api/partner/v1/download",
                navLabel: "Скачать ЭР",
                note: "Скачать экспедиторскую расписку (PDF). Scope: documents:read. metod=ЭР, number — номер перевозки.",
                examples: [{ id: "dl-er", label: "ЭР по номеру перевозки", body: DOWNLOAD_BODY("ЭР") }],
            },
            {
                method: "POST",
                path: "/api/partner/v1/download",
                navLabel: "Скачать АПП",
                note: "Скачать АПП (PDF). Scope: documents:read. metod=АПП, number — номер перевозки.",
                examples: [{ id: "dl-app", label: "АПП по номеру перевозки", body: DOWNLOAD_BODY("АПП") }],
            },
            {
                method: "POST",
                path: "/api/partner/v1/download",
                navLabel: "Скачать счёт",
                note: "Скачать счёт (PDF). Scope: documents:read. metod=Счет, number — номер перевозки или счёта.",
                examples: [{ id: "dl-schet", label: "Счёт по номеру перевозки", body: DOWNLOAD_BODY("Счет") }],
            },
            {
                method: "POST",
                path: "/api/partner/v1/download",
                navLabel: "Скачать реестр",
                note: "Скачать реестр к счёту (PDF). Scope: documents:read. metod=РеестрКсчету, number — номер счёта, dateDoc — дата счёта (YYYY-MM-DDTHH:MM:SS).",
                examples: [{ id: "dl-reestr", label: "Реестр по номеру счёта", body: DOWNLOAD_REESTR_BODY }],
            },
            {
                method: "POST",
                path: "/api/partner/v1/download",
                navLabel: "Скачать УПД",
                note: "Скачать УПД (PDF). Scope: documents:read. metod=Акт (не слово «УПД»), number — номер перевозки.",
                examples: [{ id: "dl-upd", label: "УПД (metod Акт)", body: DOWNLOAD_BODY("Акт") }],
            },
        ],
    },
];

/** Плоский список всех методов для навигации в каталоге API. */
export type ApiCatalogNavEntry =
    | { type: "group"; label: string }
    | { type: "item"; gi: number; ii: number; navLabel: string; method: string; path: string };

export function buildApiCatalogNavEntries(): ApiCatalogNavEntry[] {
    const entries: ApiCatalogNavEntry[] = [];
    MINI_APP_API_INVENTORY.forEach((section, gi) => {
        entries.push({ type: "group", label: section.group });
        section.items.forEach((item, ii) => {
            entries.push({
                type: "item",
                gi,
                ii,
                navLabel: item.navLabel,
                method: item.method,
                path: item.path,
            });
        });
    });
    return entries;
}

export function getApiInventoryItem(gi: number, ii: number): ApiInventoryItem | null {
    return MINI_APP_API_INVENTORY[gi]?.items[ii] ?? null;
}

export function totalApiInventoryItems(): number {
    return MINI_APP_API_INVENTORY.reduce((n, s) => n + s.items.length, 0);
}

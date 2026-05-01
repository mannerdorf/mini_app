/**
 * Справочник методов для раздела «Профиль → API» (консоль теста).
 * Группы: перевозки, документы (запросы/списки), скачать документы (GetFile).
 */

/** Плейсхолдеры в body: строки "{{LOGIN}}" и "{{PASSWORD}}" подставляются из аккаунта в консоли теста. */
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
    inn: "",
    serviceMode: false,
};

export const MINI_APP_API_INVENTORY: ApiInventorySection[] = [
    {
        group: "Перевозки",
        items: [
            {
                method: "POST",
                path: "/api/partner/v1/cargo",
                note: "Список перевозок (как вкладка «Грузы»): только Authorization: Bearer и полный ключ haulz_… из Профиль → API (scope cargo:read). В теле — dateFrom, dateTo, inn, serviceMode; без логина/пароля.",
                examples: [
                    {
                        id: "cargo-bearer",
                        label: "Период и ИНН (только Bearer)",
                        body: { ...BODY_DATES_INN },
                    },
                    {
                        id: "cargo-inn",
                        label: "Фильтр по ИНН заказчика",
                        body: { dateFrom: "2026-01-01", dateTo: "2026-01-31", inn: "7722461620", serviceMode: false },
                    },
                ],
            },
        ],
    },
    {
        group: "Документы",
        items: [
            {
                method: "POST",
                path: "/api/invoices",
                note: "Запросить счета (кэш / 1С). Тело: login, password, dateFrom, dateTo, inn, serviceMode, isRegisteredUser.",
                examples: [
                    {
                        id: "inv-reg",
                        label: "Зарегистрированный пользователь (кэш)",
                        body: {
                            login: "{{LOGIN}}",
                            password: "{{PASSWORD}}",
                            ...BODY_DATES_INN,
                            isRegisteredUser: true,
                        },
                    },
                ],
            },
            {
                method: "POST",
                path: "/api/acts",
                note: "Запросить список УПД (GetActs; кэш / 1С). То же тело, что для счетов.",
                examples: [
                    {
                        id: "acts-reg",
                        label: "Зарегистрированный пользователь (кэш)",
                        body: {
                            login: "{{LOGIN}}",
                            password: "{{PASSWORD}}",
                            ...BODY_DATES_INN,
                            isRegisteredUser: true,
                        },
                    },
                ],
            },
            {
                method: "GET",
                path: "/api/dogovors",
                note: "Запросить договоры из кэша. Опционально query inn — только по этому ИНН заказчика.",
                examples: [
                    { id: "dog-all", label: "Все договоры в кэше", query: {} },
                    { id: "dog-inn", label: "Фильтр по ИНН", query: { inn: "7722461620" } },
                ],
            },
            {
                method: "GET",
                path: "/api/tariffs",
                note: "Запросить тарифы из кэша. Опционально ?inn= — фильтр по ИНН заказчика.",
                examples: [
                    { id: "tar-all", label: "Все тарифы", query: {} },
                    { id: "tar-inn", label: "По ИНН", query: { inn: "7722461620" } },
                ],
            },
            {
                method: "GET",
                path: "/api/sverki",
                note: "Запросить акты сверок из кэша. Опционально ?inn=.",
                examples: [
                    { id: "sv-all", label: "Все акты сверок", query: {} },
                    { id: "sv-inn", label: "По ИНН", query: { inn: "7722461620" } },
                ],
            },
        ],
    },
    {
        group: "Скачать документы",
        items: [
            {
                method: "POST",
                path: "/api/download",
                note: "Скачать ЭР (PDF через прокси). metod=ЭР, number — номер перевозки (как во вкладке документов). Для зарегистрированного пользователя — isRegisteredUser и проверка доступа к перевозке.",
                examples: [
                    {
                        id: "dl-er",
                        label: "ЭР по номеру перевозки",
                        body: {
                            login: "{{LOGIN}}",
                            password: "{{PASSWORD}}",
                            metod: "ЭР",
                            number: "000123456",
                            isRegisteredUser: true,
                        },
                    },
                ],
            },
            {
                method: "POST",
                path: "/api/download",
                note: "Скачать АПП. metod=АПП, number — номер перевозки.",
                examples: [
                    {
                        id: "dl-app",
                        label: "АПП по номеру перевозки",
                        body: {
                            login: "{{LOGIN}}",
                            password: "{{PASSWORD}}",
                            metod: "АПП",
                            number: "000123456",
                            isRegisteredUser: true,
                        },
                    },
                ],
            },
            {
                method: "POST",
                path: "/api/download",
                note: "Скачать счёт (PDF). В 1С metod=Счет; number — номер перевозки из номенклатуры или номер счёта (маска 0000-…), см. приложение.",
                examples: [
                    {
                        id: "dl-schet",
                        label: "Счёт (пример с номером перевозки)",
                        body: {
                            login: "{{LOGIN}}",
                            password: "{{PASSWORD}}",
                            metod: "Счет",
                            number: "000123456",
                            isRegisteredUser: true,
                        },
                    },
                ],
            },
            {
                method: "POST",
                path: "/api/download",
                note: "Скачать УПД (файл). В API metod=Акт (не слово «УПД»); number — номер перевозки из УПД.",
                examples: [
                    {
                        id: "dl-upd",
                        label: "УПД (metod Акт)",
                        body: {
                            login: "{{LOGIN}}",
                            password: "{{PASSWORD}}",
                            metod: "Акт",
                            number: "000123456",
                            isRegisteredUser: true,
                        },
                    },
                ],
            },
        ],
    },
];

/** Синхрон с lib/userApiKeyScopes.ts (для UI профиля → API). */
export const USER_API_KEY_SCOPES_CLIENT = [
  "cargo:read",
  "invoices:read",
  "acts:read",
  "orders:read",
  "claims:read",
  "contracts:read",
  "sverki:read",
  "tariffs:read",
] as const;

export type UserApiKeyScopeClient = (typeof USER_API_KEY_SCOPES_CLIENT)[number];

/** Русские названия и пояснения для чекбоксов в профиле → API. */
export const USER_API_KEY_SCOPE_INFO_RU: Record<
  UserApiKeyScopeClient,
  { title: string; description: string; apiHint: string }
> = {
  "cargo:read": {
    title: "Перевозки (только чтение)",
    description: "Список перевозок из кэша: период дат, фильтр по ИНН.",
    apiHint: "POST /api/partner/v1/cargo",
  },
  "invoices:read": {
    title: "Счета (только чтение)",
    description: "Запрос списка счетов из кэша за период.",
    apiHint: "POST /api/partner/v1/invoices",
  },
  "acts:read": {
    title: "УПД (только чтение)",
    description: "Запрос списка УПД из кэша за период.",
    apiHint: "POST /api/partner/v1/acts",
  },
  "orders:read": {
    title: "Заявки (только чтение)",
    description: "Список заявок из кэша за период и с фильтром по ИНН.",
    apiHint: "POST /api/partner/v1/orders",
  },
  "claims:read": {
    title: "Претензии (только чтение)",
    description: "Список претензий пользователя за период.",
    apiHint: "POST /api/partner/v1/claims",
  },
  "contracts:read": {
    title: "Договоры (только чтение)",
    description: "Список договоров из кэша, опционально по ИНН.",
    apiHint: "POST /api/partner/v1/contracts",
  },
  "sverki:read": {
    title: "Акты сверок (только чтение)",
    description: "Список актов сверок из кэша, опционально по ИНН.",
    apiHint: "POST /api/partner/v1/sverki",
  },
  "tariffs:read": {
    title: "Тарифы (только чтение)",
    description: "Список тарифов из кэша, опционально по ИНН.",
    apiHint: "POST /api/partner/v1/tariffs",
  },
};

export function scopeTitleRu(scope: string): string {
  if (scope in USER_API_KEY_SCOPE_INFO_RU) {
    return USER_API_KEY_SCOPE_INFO_RU[scope as UserApiKeyScopeClient].title;
  }
  if (scope === "sendings:read") return "Отправки (только чтение)";
  return scope;
}

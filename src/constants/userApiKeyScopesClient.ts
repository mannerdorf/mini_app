/** Синхрон с lib/userApiKeyScopes.ts (для UI профиля). */
export const USER_API_KEY_SCOPES_CLIENT = ["cargo:read", "sendings:read", "orders:read"] as const;

export type UserApiKeyScopeClient = (typeof USER_API_KEY_SCOPES_CLIENT)[number];

/** Русские названия и пояснения для чекбоксов в профиле → API. */
export const USER_API_KEY_SCOPE_INFO_RU: Record<
    UserApiKeyScopeClient,
    { title: string; description: string; apiHint: string }
> = {
    "cargo:read": {
        title: "Перевозки (только чтение)",
        description: "Доступ к списку перевозок из кэша по тем же правилам, что в приложении: период дат, фильтр по ИНН, ограничения по вашим компаниям.",
        apiHint: "POST /api/partner/v1/cargo",
    },
    "sendings:read": {
        title: "Отправки (только чтение)",
        description: "Доступ к списку отправлений из кэша: даты, ИНН, метрики по отправкам — как в разделе «Документы» / отправки.",
        apiHint: "POST /api/partner/v1/sendings",
    },
    "orders:read": {
        title: "Заявки (только чтение)",
        description: "Доступ к списку заявок из кэша за выбранный период и с фильтром по доступным вам ИНН.",
        apiHint: "POST /api/partner/v1/orders",
    },
};

export function scopeTitleRu(scope: string): string {
    if (scope in USER_API_KEY_SCOPE_INFO_RU) {
        return USER_API_KEY_SCOPE_INFO_RU[scope as UserApiKeyScopeClient].title;
    }
    return scope;
}

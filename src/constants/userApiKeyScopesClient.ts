/** Синхрон с lib/userApiKeyScopes.ts (для UI профиля). */
export const USER_API_KEY_SCOPES_CLIENT = ["cargo:read", "sendings:read", "orders:read"] as const;

export type UserApiKeyScopeClient = (typeof USER_API_KEY_SCOPES_CLIENT)[number];

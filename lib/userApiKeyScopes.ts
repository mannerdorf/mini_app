/** Допустимые scope для ключей (совпадают с проверкой в partner/v1 и my-api-keys). */
export const USER_API_KEY_SCOPES = ["cargo:read", "sendings:read", "orders:read"] as const;

export type UserApiKeyScope = (typeof USER_API_KEY_SCOPES)[number];

export function isValidUserApiScope(s: string): s is UserApiKeyScope {
  return (USER_API_KEY_SCOPES as readonly string[]).includes(s);
}

export function normalizeScopes(input: unknown): UserApiKeyScope[] {
  if (!Array.isArray(input)) return [];
  const out: UserApiKeyScope[] = [];
  const seen = new Set<string>();
  for (const x of input) {
    const s = String(x ?? "").trim();
    if (!s || seen.has(s)) continue;
    if (isValidUserApiScope(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

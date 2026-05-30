/** Заголовки Bearer-токена CMS для admin API. */

export function adminAuthHeaders(
  adminToken: string,
  extra?: Record<string, string>
): Record<string, string> {
  return {
    Authorization: `Bearer ${adminToken}`,
    ...extra,
  };
}

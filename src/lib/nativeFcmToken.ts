/** Device-local FCM token helpers. One phone must never unsubscribe the other. */

export const NATIVE_FCM_TOKEN_STORAGE_KEY = "haulz.nativeFcmToken";

export type NativeFcmPlatform = "ios" | "android";

export type StoredNativeFcmToken = {
  login: string;
  token: string;
  platform: NativeFcmPlatform;
};

export function parseStoredNativeFcmToken(raw: string | null | undefined, login: string): string {
  const expected = String(login || "").trim().toLowerCase();
  if (!raw || !expected) return "";
  try {
    const parsed = JSON.parse(raw) as Partial<StoredNativeFcmToken>;
    const storedLogin = String(parsed.login || "").trim().toLowerCase();
    const token = String(parsed.token || "").trim();
    if (storedLogin !== expected || !token) return "";
    return token;
  } catch {
    return "";
  }
}

export function serializeStoredNativeFcmToken(
  login: string,
  token: string,
  platform: NativeFcmPlatform,
): string {
  const payload: StoredNativeFcmToken = {
    login: String(login || "").trim().toLowerCase(),
    token: String(token || "").trim(),
    platform,
  };
  return JSON.stringify(payload);
}

/** Body for POST /api/fcm-unsubscribe, or null when the API must not be called. */
export function nativeFcmUnsubscribePayload(
  login: string,
  token: string | null | undefined,
): { login: string; token: string } | null {
  const normalizedLogin = String(login || "").trim().toLowerCase();
  const t = String(token || "").trim();
  if (!normalizedLogin || !t) return null;
  return { login: normalizedLogin, token: t };
}

import { Capacitor } from "@capacitor/core";
import type { ActionPerformed, PushNotificationSchema, Token } from "@capacitor/push-notifications";
import { saveNotificationPreferences, subscribeFcmToken, unsubscribeFcmToken } from "../api/client/notifications";
import { buildAllPushPreferencesEnabled } from "../../lib/notificationEmailPrefs";
import {
  NATIVE_FCM_TOKEN_STORAGE_KEY,
  nativeFcmUnsubscribePayload,
  parseStoredNativeFcmToken,
  serializeStoredNativeFcmToken,
} from "./nativeFcmToken";

export type NativePushPlatform = "ios" | "android";

let listenersAttached = false;
let currentLogin = "";
let currentToken = "";

function readStoredToken(login: string): string {
  if (typeof localStorage === "undefined") return "";
  try {
    return parseStoredNativeFcmToken(localStorage.getItem(NATIVE_FCM_TOKEN_STORAGE_KEY), login);
  } catch {
    return "";
  }
}

function writeStoredToken(login: string, token: string, platform: NativePushPlatform) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(NATIVE_FCM_TOKEN_STORAGE_KEY, serializeStoredNativeFcmToken(login, token, platform));
  } catch {
    /* private mode / quota */
  }
}

function clearStoredToken() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(NATIVE_FCM_TOKEN_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function tokenForLogin(login: string): string {
  const memory = String(currentToken || "").trim();
  if (memory) return memory;
  return readStoredToken(login);
}

/** Capacitor platform for FCM subscribe. Unknown native platforms fall back to android. */
export function fcmPlatformFromCapacitor(platform: string): NativePushPlatform {
  return platform === "ios" ? "ios" : "android";
}

export function nativePushPlatform(): NativePushPlatform | null {
  if (!Capacitor.isNativePlatform()) return null;
  return fcmPlatformFromCapacitor(Capacitor.getPlatform());
}

export function isNativePushEnvironment(): boolean {
  return nativePushPlatform() !== null;
}

/** @deprecated use isNativePushEnvironment — push is Android and iOS. */
export function isAndroidPushEnvironment(): boolean {
  return isNativePushEnvironment();
}

function navigateFromNotification(data: Record<string, string | undefined>) {
  const url = String(data.url || "/").trim() || "/";
  if (typeof window !== "undefined") {
    window.location.hash = url.startsWith("#") ? url : `#${url.startsWith("/") ? url : `/${url}`}`;
  }
}

async function persistToken(login: string, token: string) {
  if (!login || !token) return;
  const platform = nativePushPlatform() || fcmPlatformFromCapacitor(Capacitor.getPlatform());
  currentLogin = login;
  currentToken = token;
  writeStoredToken(login, token, platform);
  await subscribeFcmToken({ login, token, platform });
}

export async function enableNativePushNotifications(login: string): Promise<{ ok: boolean; error?: string }> {
  if (!isNativePushEnvironment()) {
    return { ok: false, error: "Push доступны только в приложении HAULZ (Android или iOS)." };
  }
  const normalizedLogin = String(login || "").trim().toLowerCase();
  if (!normalizedLogin) return { ok: false, error: "Не указан login." };

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== "granted") {
      return { ok: false, error: "Разрешение на уведомления отклонено." };
    }

    if (!listenersAttached) {
      await PushNotifications.addListener("registration", (token: Token) => {
        void persistToken(currentLogin || normalizedLogin, token.value);
      });
      await PushNotifications.addListener("registrationError", () => {
        /* surfaced via enable call */
      });
      await PushNotifications.addListener("pushNotificationReceived", (_notification: PushNotificationSchema) => {
        /* foreground: OS may still show depending on payload */
      });
      await PushNotifications.addListener("pushNotificationActionPerformed", (action: ActionPerformed) => {
        const data = (action.notification?.data || {}) as Record<string, string | undefined>;
        navigateFromNotification(data);
      });
      listenersAttached = true;
    }

    currentLogin = normalizedLogin;
    currentToken = tokenForLogin(normalizedLogin);
    // Re-attach this device only. Never unsubscribe: a fresh WKWebView has no in-memory
    // token, and logout-all would drop Android for the same login.
    if (currentToken) {
      void persistToken(normalizedLogin, currentToken);
    }
    await PushNotifications.register();

    // Token may arrive asynchronously via registration listener.
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: (e as { message?: string })?.message || "Не удалось включить push-уведомления." };
  }
}

export async function disableNativePushNotifications(login: string): Promise<{ ok: boolean; error?: string }> {
  if (!isNativePushEnvironment()) return { ok: true };
  const normalizedLogin = String(login || "").trim().toLowerCase();
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const payload = nativeFcmUnsubscribePayload(normalizedLogin, tokenForLogin(normalizedLogin));
    if (payload) {
      await unsubscribeFcmToken(payload).catch(() => null);
    }
    clearStoredToken();
    await PushNotifications.removeAllListeners();
    listenersAttached = false;
    currentLogin = "";
    currentToken = "";
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: (e as { message?: string })?.message || "Не удалось отключить push-уведомления." };
  }
}

/** При входе: запросить разрешение (первый раз), зарегистрировать FCM, включить все push-типы. */
export async function syncNativePushNotifications(login: string): Promise<void> {
  if (!isNativePushEnvironment() || !login) return;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const perm = await PushNotifications.checkPermissions();
    // Явный отказ — не показываем диалог снова; включить можно в «Уведомления».
    if (perm.receive === "denied") return;
    const isFirstPrompt =
      perm.receive === "prompt" || perm.receive === "prompt-with-rationale";
    const result = await enableNativePushNotifications(login);
    if (!result.ok) return;
    if (isFirstPrompt) {
      await saveNotificationPreferences(login, {
        push: buildAllPushPreferencesEnabled(),
        email: {},
      }).catch(() => null);
    }
  } catch {
    /* ignore background sync errors */
  }
}

export const enableAndroidPushNotifications = enableNativePushNotifications;
export const disableAndroidPushNotifications = disableNativePushNotifications;
export const syncAndroidPushNotifications = syncNativePushNotifications;

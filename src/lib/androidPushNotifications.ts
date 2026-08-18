import { Capacitor } from "@capacitor/core";
import type { ActionPerformed, PushNotificationSchema, Token } from "@capacitor/push-notifications";
import { isCapacitorAndroidApp } from "./androidAppUpdate";
import { subscribeFcmToken, unsubscribeFcmToken } from "../api/client/notifications";

let listenersAttached = false;
let currentLogin = "";
let currentToken = "";

function navigateFromNotification(data: Record<string, string | undefined>) {
  const url = String(data.url || "/").trim() || "/";
  if (typeof window !== "undefined") {
    window.location.hash = url.startsWith("#") ? url : `#${url.startsWith("/") ? url : `/${url}`}`;
  }
}

async function persistToken(login: string, token: string) {
  if (!login || !token) return;
  await subscribeFcmToken({ login, token, platform: "android" });
  currentLogin = login;
  currentToken = token;
}

export async function enableAndroidPushNotifications(login: string): Promise<{ ok: boolean; error?: string }> {
  if (!isCapacitorAndroidApp()) {
    return { ok: false, error: "Push доступны только в Android-приложении." };
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
    await PushNotifications.register();

    // Token may arrive asynchronously via registration listener.
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: (e as { message?: string })?.message || "Не удалось включить push-уведомления." };
  }
}

export async function disableAndroidPushNotifications(login: string): Promise<{ ok: boolean; error?: string }> {
  if (!isCapacitorAndroidApp()) return { ok: true };
  const normalizedLogin = String(login || "").trim().toLowerCase();
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    if (currentToken) {
      await unsubscribeFcmToken({ login: normalizedLogin, token: currentToken }).catch(() => null);
    } else {
      await unsubscribeFcmToken({ login: normalizedLogin }).catch(() => null);
    }
    await PushNotifications.removeAllListeners();
    listenersAttached = false;
    currentLogin = "";
    currentToken = "";
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: (e as { message?: string })?.message || "Не удалось отключить push-уведомления." };
  }
}

/** При входе: зарегистрировать FCM; при первом входе запросить разрешение Android. */
export async function syncAndroidPushNotifications(login: string): Promise<void> {
  if (!isCapacitorAndroidApp() || !login) return;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const perm = await PushNotifications.checkPermissions();
    // Явный отказ — не показываем диалог снова; включить можно в «Уведомления».
    if (perm.receive === "denied") return;
    await enableAndroidPushNotifications(login);
  } catch {
    /* ignore background sync errors */
  }
}

export function isAndroidPushEnvironment(): boolean {
  return Capacitor.isNativePlatform() && isCapacitorAndroidApp();
}

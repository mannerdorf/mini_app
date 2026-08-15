/** Webpush / push / email уведомления (профиль). */

import { fetchJson } from "./_base";

export type NotificationPrefs = {
  push: Record<string, boolean>;
  email: Record<string, boolean>;
};

export async function fetchNotificationPreferences(login: string, signal?: AbortSignal): Promise<NotificationPrefs | null> {
  const { ok, data } = await fetchJson<{
    push?: Record<string, boolean>;
    email?: Record<string, boolean>;
  }>(`/api/webpush-preferences?login=${encodeURIComponent(login)}`, { signal });
  if (!ok) return null;
  return {
    push: data.push || {},
    email: data.email || {},
  };
}

export async function saveNotificationPreferences(
  login: string,
  preferences: NotificationPrefs,
): Promise<boolean> {
  const res = await fetch("/api/webpush-preferences", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login, preferences }),
  });
  return res.ok;
}

export async function saveNotificationPreferencesKeepalive(login: string, preferences: NotificationPrefs): Promise<void> {
  await fetch("/api/webpush-preferences", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login, preferences }),
    keepalive: true,
  });
}

export async function subscribeFcmToken(body: {
  login: string;
  token: string;
  platform?: string;
}): Promise<{ ok: boolean }> {
  const { ok } = await fetchJson<Record<string, unknown>>("/api/fcm-subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok };
}

export async function unsubscribeFcmToken(body: {
  login: string;
  token?: string;
}): Promise<void> {
  await fetch("/api/fcm-unsubscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** @deprecated use fetchNotificationPreferences */
export const fetchWebpushPreferences = fetchNotificationPreferences;

/** @deprecated use saveNotificationPreferences */
export const saveWebpushPreferences = saveNotificationPreferences;

/** @deprecated use saveNotificationPreferencesKeepalive */
export const saveWebpushPreferencesKeepalive = saveNotificationPreferencesKeepalive;

/** Webpush / уведомления (профиль). */

import { fetchJson } from "./_base";
import { fetchTwoFaSettings } from "./twoFa";

export type NotificationPrefs = {
  telegram: Record<string, boolean>;
  webpush: Record<string, boolean>;
  email: Record<string, boolean>;
};

export async function fetchWebpushPreferences(login: string, signal?: AbortSignal): Promise<NotificationPrefs | null> {
  const { ok, data } = await fetchJson<{
    telegram?: Record<string, boolean>;
    webpush?: Record<string, boolean>;
    email?: Record<string, boolean>;
  }>(`/api/webpush-preferences?login=${encodeURIComponent(login)}`, { signal });
  if (!ok) return null;
  return {
    telegram: data.telegram || {},
    webpush: data.webpush || {},
    email: data.email || {},
  };
}

export async function fetchTwoFaSettingsWithSignal(
  login: string,
  signal?: AbortSignal,
): Promise<{ telegramLinked: boolean; maxLinked: boolean } | null> {
  const res = await fetch(`/api/2fa?login=${encodeURIComponent(login)}`, { signal });
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  return {
    telegramLinked: !!data?.settings?.telegramLinked,
    maxLinked: !!data?.settings?.maxLinked,
  };
}

export async function saveWebpushPreferences(
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

export async function fetchWebpushVapid(): Promise<Record<string, unknown>> {
  const { ok, data } = await fetchJson<Record<string, unknown>>("/api/webpush-vapid");
  return ok ? data : {};
}

export async function subscribeWebpush(body: Record<string, unknown>): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const { ok, data } = await fetchJson<Record<string, unknown>>("/api/webpush-subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok, data };
}

export async function unsubscribeWebpush(body: Record<string, unknown>): Promise<void> {
  await fetch("/api/webpush-unsubscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function unlinkTelegram(login: string): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const { ok, data } = await fetchJson<Record<string, unknown>>("/api/telegram-unlink", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login }),
  });
  return { ok, data };
}

export async function unlinkTelegramVia2fa(login: string): Promise<{ ok: boolean; error?: string }> {
  const { ok, data } = await fetchJson<{ ok?: boolean; error?: string }>("/api/2fa-telegram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login, action: "unlink" }),
  });
  return { ok: ok && !!data.ok, error: data.error };
}

export async function saveWebpushPreferencesKeepalive(login: string, preferences: NotificationPrefs): Promise<void> {
  await fetch("/api/webpush-preferences", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login, preferences }),
    keepalive: true,
  });
}

export { fetchTwoFaSettings };

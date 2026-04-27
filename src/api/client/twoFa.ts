/**
 * 2FA: Redis-бэкенд (Telegram / Google).
 */

import { readJsonOrText } from "../../utils";

export type TwoFaSettingsPayload = {
    settings?: {
        enabled?: boolean;
        method?: string;
        telegramLinked?: boolean;
        googleSecretSet?: boolean;
    };
};

export async function fetchTwoFaSettings(login: string): Promise<TwoFaSettingsPayload | null> {
    const res = await fetch(`/api/2fa?login=${encodeURIComponent(login)}`);
    if (!res.ok) return null;
    return (await res.json().catch(() => ({}))) as TwoFaSettingsPayload;
}

/** Сохранение настроек 2FA на сервере — best-effort, ошибки глотаются. */
export async function persistTwoFaSettingsSilent(body: {
    login: string;
    enabled: boolean;
    method: string;
    telegramLinked: boolean;
}): Promise<void> {
    try {
        await fetch("/api/2fa", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
    } catch {
        /* silent */
    }
}

export async function sendTelegramTwoFaCode(loginKey: string): Promise<void> {
    const res = await fetch("/api/2fa-telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: loginKey, action: "send" }),
    });
    if (!res.ok) {
        const err = await readJsonOrText(res);
        const msg =
            err && typeof err === "object" && err !== null && "error" in err
                ? String((err as { error?: unknown }).error)
                : "";
        throw new Error(msg || "Не удалось отправить код");
    }
}

export async function verifyTwoFactorCode(
    method: "telegram" | "google",
    loginKey: string,
    code: string,
): Promise<void> {
    const url = method === "google" ? "/api/2fa-google" : "/api/2fa-telegram";
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: loginKey, action: "verify", code: code.trim() }),
    });
    if (!res.ok) {
        const err = await readJsonOrText(res);
        const msg =
            err && typeof err === "object" && err !== null && "error" in err
                ? String((err as { error?: unknown }).error)
                : "";
        throw new Error(msg || "Неверный код");
    }
}

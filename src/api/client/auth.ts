/**
 * Клиентские запросы к бэкенду: авторизация и конфиг способов входа.
 */

export type AuthMethodsConfig = {
    api_v1: boolean;
    api_v2: boolean;
    cms: boolean;
};

/** Загружает конфиг для экрана входа; при ошибке — null (оставляем значения по умолчанию). */
export async function loadAuthMethodsConfig(): Promise<AuthMethodsConfig | null> {
    try {
        const res = await fetch("/api/auth-config");
        const data = (await res.json().catch(() => ({}))) as { config?: Partial<AuthMethodsConfig>; error?: string };
        if (!res.ok) throw new Error(data?.error || "Ошибка загрузки способов авторизации");
        const config = data?.config || {};
        return {
            api_v1: config.api_v1 ?? true,
            api_v2: config.api_v2 ?? true,
            cms: config.cms ?? true,
        };
    } catch {
        return null;
    }
}

export type AuthRegisteredLoginResponse = {
    ok?: boolean;
    error?: string;
    user?: Record<string, unknown>;
};

/** CMS: вход по email/пароль. Вызывающий сам проверяет res.ok и data.ok. */
export async function postAuthRegisteredLogin(body: { email: string; password: string }): Promise<{
    ok: boolean;
    data: AuthRegisteredLoginResponse;
}> {
    const res = await fetch("/api/auth-registered-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as AuthRegisteredLoginResponse;
    return { ok: res.ok, data };
}

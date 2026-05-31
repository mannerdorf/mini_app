const TOKEN_KEY_PREFIX = "haulz.profileApiKey.";

const HAULZ_API_KEY_RE = /^haulz_([a-f0-9]{12})_([a-f0-9]{64})$/i;

function loginKey(login: string): string {
    return login.trim().toLowerCase();
}

export function isFullHaulzApiKey(token: string): boolean {
    return HAULZ_API_KEY_RE.test(token.replace(/^Bearer\s+/i, "").trim());
}

export function saveProfileApiKeyToken(login: string, keyId: string, token: string): void {
    if (!login.trim() || !keyId.trim() || !isFullHaulzApiKey(token)) return;
    try {
        const lk = loginKey(login);
        sessionStorage.setItem(`${TOKEN_KEY_PREFIX}${lk}:${keyId.trim()}`, token.trim());
    } catch {
        /* ignore */
    }
}

export function loadProfileApiKeyToken(login: string, keyId: string): string | null {
    if (!login.trim() || !keyId.trim()) return null;
    try {
        const raw = sessionStorage.getItem(`${TOKEN_KEY_PREFIX}${loginKey(login)}:${keyId.trim()}`);
        if (raw && isFullHaulzApiKey(raw)) return raw.trim();
    } catch {
        /* ignore */
    }
    return null;
}

export function clearProfileApiKeyToken(login: string, keyId: string): void {
    if (!login.trim() || !keyId.trim()) return;
    try {
        sessionStorage.removeItem(`${TOKEN_KEY_PREFIX}${loginKey(login)}:${keyId.trim()}`);
    } catch {
        /* ignore */
    }
}

/** ИНН для автотеста: один активный ключ и ровно один доступный ИНН. */
export function resolveSingleAutoTestInn(
    keys: { allowed_inns?: string[] }[],
    assignableInns: string[],
): string | null {
    if (keys.length !== 1) return null;
    const allowed = (keys[0].allowed_inns ?? [])
        .map((x) => String(x).replace(/\D/g, "").trim())
        .filter(Boolean);
    if (allowed.length === 1) return allowed[0];
    if (allowed.length > 1) return null;
    const assignable = assignableInns.map((x) => String(x).replace(/\D/g, "").trim()).filter(Boolean);
    if (assignable.length === 1) return assignable[0];
    return null;
}

export function resolveAutoTestBearer(
    login: string,
    keys: { id: string }[],
    autoTestInn: string | null,
    newToken?: string | null,
): string | null {
    if (keys.length !== 1 || !autoTestInn) return null;
    const fresh = newToken?.trim();
    if (fresh && isFullHaulzApiKey(fresh)) return fresh;
    return loadProfileApiKeyToken(login, keys[0].id);
}

/**
 * Диплинк в MAX-бот поддержки с одноразовым токеном.
 */

export type MaxLinkTokenResponse = {
    token?: string;
    error?: string;
};

export async function createMaxAuthDeepLinkToken(body: {
    login: string;
    password: string;
    customer: string | null;
    inn: string | null;
    accountId: string;
}): Promise<MaxLinkTokenResponse> {
    const res = await fetch("/api/max-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as MaxLinkTokenResponse;
    if (!res.ok || !data?.token) {
        throw new Error(data?.error || "Не удалось создать ссылку для MAX.");
    }
    return data;
}

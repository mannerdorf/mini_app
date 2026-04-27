/**
 * Прокси к 1С: перевозки и заказчики (те же URL, что в constants/config).
 */

import { PROXY_API_BASE_URL, PROXY_API_GETCUSTOMERS_URL, PROXY_API_GETPEREVOZKA_URL } from "../../constants/config";

export async function postGetPerevozkaJson(body: Record<string, unknown>): Promise<unknown> {
    const res = await fetch(PROXY_API_GETPEREVOZKA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    return res.json();
}

export async function postGetCustomers(login: string, password: string): Promise<{ ok: boolean; data: unknown }> {
    const res = await fetch(PROXY_API_GETCUSTOMERS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
}

/** Запрос списка перевозок за период (проверка учётки API v1). */
export async function postPerevozkiList(body: {
    login: string;
    password: string;
    dateFrom: string;
    dateTo: string;
}): Promise<Response> {
    return fetch(PROXY_API_BASE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

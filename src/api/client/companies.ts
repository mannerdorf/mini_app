/**
 * Сохранение списка заказчиков в БД (прокси companies-save).
 */

import type { CustomerOption } from "../../types";

export type CompaniesSaveBody = {
    login: string;
    customers: CustomerOption[];
};

/** Fire-and-forget или с разбором предупреждений — как раньше в App. */
export function postCompaniesSave(body: CompaniesSaveBody): Promise<unknown> {
    return fetch("/api/companies-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    })
        .then((r) => r.json())
        .catch(() => ({}));
}

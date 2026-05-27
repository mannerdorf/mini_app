import type { Account, CustomerOption } from "../types";

/** Заказчик из CMS (registered_users), не «все ИНН». */
export function isSingleRegisteredCustomerAccount(acc: Account): boolean {
    return !!acc.isRegisteredUser && !acc.accessAllInns;
}

/** ИНН, привязанный к учётке в CMS (первая запись customers после логина). */
export function getRegisteredPrimaryCustomer(acc: Account): CustomerOption | null {
    if (!isSingleRegisteredCustomerAccount(acc)) return null;
    const list = acc.customers?.filter((c) => (c.inn || "").trim().length > 0) ?? [];
    if (list.length === 1) return list[0];
    if (list.length > 1 && acc.activeCustomerInn) {
        const hit = list.find((c) => c.inn === acc.activeCustomerInn);
        if (hit) return hit;
    }
    return list[0] ?? null;
}

/** Сохранённый ИНН не совпадает ни с одним заказчиком учётки. */
export function hasStaleActiveCustomerInn(acc: Account): boolean {
    if (!acc.activeCustomerInn || !acc.customers?.length) return false;
    if (acc.accessAllInns) return false;
    return !acc.customers.some((c) => c.inn === acc.activeCustomerInn);
}

/**
 * Для CMS-пользователя с одним заказчиком — всегда его ИНН/название.
 * Иначе подставляет customer по activeCustomerInn из списка customers.
 */
export function normalizeAccountCustomerSelection(acc: Account): Account {
    const primary = getRegisteredPrimaryCustomer(acc);
    if (primary) {
        return {
            ...acc,
            activeCustomerInn: primary.inn,
            customer: primary.name || acc.customer,
        };
    }
    if (hasStaleActiveCustomerInn(acc) && acc.customers?.[0]) {
        const first = acc.customers[0];
        return {
            ...acc,
            activeCustomerInn: first.inn,
            customer: first.name || acc.customer,
        };
    }
    if (acc.activeCustomerInn && acc.customers?.length) {
        const match = acc.customers.find((c) => c.inn === acc.activeCustomerInn);
        if (match?.name && match.name !== acc.customer) {
            return { ...acc, customer: match.name };
        }
    }
    return acc;
}

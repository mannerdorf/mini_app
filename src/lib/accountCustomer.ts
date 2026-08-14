import type { Account, AuthData, CustomerOption } from "../types";

/** ИНН активного заказчика: activeCustomerInn → customers[] → auth.inn */
export function resolveAccountActiveInn(
    acc: Pick<Account, "activeCustomerInn" | "customers"> | null | undefined,
    auth?: Pick<AuthData, "inn"> | null,
): string {
    const fromActive = (acc?.activeCustomerInn ?? "").trim();
    if (fromActive) return fromActive;
    for (const c of acc?.customers ?? []) {
        const inn = (c.inn ?? "").trim();
        if (inn) return inn;
    }
    return (auth?.inn ?? "").trim();
}

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
 * Для CMS с одним заказчиком в профиле — фиксируем его ИНН.
 * При нескольких компаниях (account_companies) сохраняем выбор из переключателя.
 */
export function normalizeAccountCustomerSelection(acc: Account): Account {
    const list = (acc.customers ?? []).filter((c) => (c.inn || "").trim().length > 0);

    if (isSingleRegisteredCustomerAccount(acc) && list.length === 1) {
        return {
            ...acc,
            activeCustomerInn: list[0].inn,
            customer: list[0].name || acc.customer,
        };
    }

    const activeInn = (acc.activeCustomerInn || "").trim();
    if (activeInn) {
        const match = list.find((c) => c.inn === activeInn);
        if (match) {
            return { ...acc, customer: match.name || acc.customer };
        }
        // Выбран заказчик из справочника, ещё не в customers[] — не сбрасываем на первого
        if ((acc.customer || "").trim()) {
            return acc;
        }
    }

    if (hasStaleActiveCustomerInn(acc) && list[0]) {
        return {
            ...acc,
            activeCustomerInn: list[0].inn,
            customer: list[0].name || acc.customer,
        };
    }

    return acc;
}

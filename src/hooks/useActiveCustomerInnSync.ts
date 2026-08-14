import { useEffect } from "react";
import { postGetCustomers } from "../api/client/perevozkiClient";
import { useAuth } from "../contexts/AuthContext";
import { normalizeAccountCustomerSelection, resolveAccountActiveInn } from "../lib/accountCustomer";
import { stripOoo } from "../lib/formatUtils";
import { dedupeCustomersByInn } from "../utils";
import type { CustomerOption } from "../types";

function pickCompanyInn(
  forLogin: { inn?: string; name?: string }[],
  customerName: string,
): { inn: string; name: string } | null {
  const normalizedName = customerName.trim().toLowerCase();
  let hit = normalizedName
    ? forLogin.find(
        (c) => (c.inn ?? "").trim() && stripOoo(c.name).trim().toLowerCase() === normalizedName,
      )
    : undefined;
  if (!hit) hit = forLogin.find((c) => (c.inn ?? "").trim());
  const inn = (hit?.inn ?? "").trim();
  if (!inn) return null;
  return { inn, name: (hit?.name || customerName || inn).trim() };
}

function parseCustomersFrom1c(data: unknown): CustomerOption[] {
  const rawList = Array.isArray((data as { customers?: unknown })?.customers)
    ? (data as { customers: unknown[] }).customers
    : Array.isArray((data as { Customers?: unknown })?.Customers)
      ? (data as { Customers: unknown[] }).Customers
      : [];
  return dedupeCustomersByInn(
    rawList
      .map((c) => ({
        name: String((c as { name?: unknown; Name?: unknown })?.name ?? (c as { Name?: unknown }).Name ?? "").trim()
          || String((c as { inn?: unknown; Inn?: unknown; INN?: unknown })?.inn ?? (c as { Inn?: unknown }).Inn ?? (c as { INN?: unknown }).INN ?? "").trim(),
        inn: String((c as { inn?: unknown; Inn?: unknown; INN?: unknown })?.inn ?? (c as { Inn?: unknown }).Inn ?? (c as { INN?: unknown }).INN ?? "").trim(),
      }))
      .filter((c) => c.inn.length > 0),
  );
}

/** Если в шапке есть заказчик, но ИНН не сохранён локально — подтягиваем из account_companies или 1С. */
export function useActiveCustomerInnSync() {
  const { activeAccount, activeAccountId, auth, setAccounts } = useAuth();

  useEffect(() => {
    if (!activeAccount?.login || activeAccount.accessAllInns) return;
    if (resolveAccountActiveInn(activeAccount, auth)) return;

    const login = activeAccount.login.trim().toLowerCase();
    const customerName = stripOoo(activeAccount.customer ?? "");
    let cancelled = false;

    const applyInn = (inn: string, name: string) => {
      if (!activeAccountId) return;
      setAccounts((prev) =>
        prev.map((acc) => {
          if (acc.id !== activeAccountId) return acc;
          return normalizeAccountCustomerSelection({
            ...acc,
            activeCustomerInn: inn,
            customer: name,
            customers: dedupeCustomersByInn([...(acc.customers ?? []), { inn, name }]),
          });
        }),
      );
    };

    (async () => {
      try {
        const res = await fetch(`/api/companies?login=${encodeURIComponent(login)}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        const list = Array.isArray(data?.companies) ? data.companies : [];
        const forLogin = list.filter(
          (c: { login?: string }) => (c.login ?? "").trim().toLowerCase() === login,
        );
        const fromCompanies = pickCompanyInn(forLogin, customerName);
        if (fromCompanies) {
          applyInn(fromCompanies.inn, fromCompanies.name);
          return;
        }

        if (!activeAccount.password) return;
        const { ok, data: customersData } = await postGetCustomers(activeAccount.login, activeAccount.password);
        if (cancelled || !ok) return;
        const customers = parseCustomersFrom1c(customersData);
        if (customers.length === 0) return;
        const matched =
          customers.find((c) => stripOoo(c.name).trim().toLowerCase() === customerName.trim().toLowerCase()) ??
          customers[0];
        applyInn(matched.inn, matched.name || customerName || matched.inn);
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    activeAccount?.login,
    activeAccount?.password,
    activeAccount?.customer,
    activeAccount?.activeCustomerInn,
    activeAccount?.accessAllInns,
    activeAccount?.customers,
    activeAccountId,
    auth?.inn,
    setAccounts,
  ]);
}

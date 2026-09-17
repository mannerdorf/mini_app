import { fetchCompanies } from "../api/client/companiesList";
import { useEffect, useState } from "react";
import type { Account } from "../types";
import { dedupeCompaniesByName, dedupeCustomersByInn } from "../utils";

/** Нужен ли столбец «Заказчик» в таблицах (больше одной компании у логина или служебный режим). На мобильном без служебного режима скрывается в App.tsx. */
export function showCustomerColumnSync(
  account: Account | null | undefined,
  useServiceRequest: boolean,
): boolean {
  if (useServiceRequest) return true;
  if (!account) return true;
  if (account.accessAllInns) return true;
  const customers = dedupeCustomersByInn(account.customers ?? []);
  return customers.length > 1;
}

export function useShowCustomerColumn(
  account: Account | null | undefined,
  useServiceRequest: boolean,
): boolean {
  const [show, setShow] = useState(() => showCustomerColumnSync(account, useServiceRequest));

  useEffect(() => {
    if (useServiceRequest) {
      setShow(true);
      return;
    }
    if (!account) {
      setShow(true);
      return;
    }
    const sync = showCustomerColumnSync(account, false);
    if (sync) {
      setShow(true);
      return;
    }

    let cancelled = false;
    const login = account.login.trim().toLowerCase();
    fetchCompanies([account])
      .then((list) => {
        if (cancelled) return;
        const forLogin = dedupeCompaniesByName(
          list.filter((c: { login?: string }) => (c.login ?? "").trim().toLowerCase() === login),
        );
        setShow(forLogin.length > 1);
      })
      .catch(() => {
        if (!cancelled) setShow(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    useServiceRequest,
    account?.id,
    account?.login,
    account?.accessAllInns,
    account?.customers?.map((c) => c.inn).join(","),
  ]);

  return show;
}

import { useEffect, useMemo, useState } from "react";
import type { AuthData, CustomerOption } from "../../types";
import { postCustomerBalances, type CustomerBalanceRow } from "../../../api/client/customerBalanceClient";
import { shorten1cError } from "../../../lib/format1cError";

export type UseDashboardCustomerBalancesParams = {
  auth: AuthData;
  customers: CustomerOption[];
  showSums: boolean;
  enabled?: boolean;
};

export function useDashboardCustomerBalances({
  auth,
  customers,
  showSums,
  enabled = true,
}: UseDashboardCustomerBalancesParams) {
  const [balances, setBalances] = useState<CustomerBalanceRow[]>([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const innsKey = useMemo(() => {
    const list = customers.length > 0
      ? customers.map((c) => c.inn.trim()).filter(Boolean)
      : auth.inn?.trim()
        ? [auth.inn.trim()]
        : [];
    return list.join("|");
  }, [customers, auth.inn]);

  const namesByInn = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of customers) {
      const inn = c.inn?.trim();
      if (inn) map[inn] = c.name?.trim() || inn;
    }
    return map;
  }, [customers]);

  useEffect(() => {
    if (!enabled || !showSums || !auth.login || !auth.password || !innsKey) {
      setBalances([]);
      setTotalBalance(0);
      setError(null);
      setLoading(false);
      return;
    }

    const inns = innsKey.split("|").filter(Boolean);
    let cancelled = false;
    setLoading(true);
    setError(null);

    postCustomerBalances({
      login: auth.login,
      password: auth.password,
      isRegisteredUser: auth.isRegisteredUser,
      inns,
      namesByInn,
    })
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok) {
          setBalances([]);
          setTotalBalance(0);
          setError(shorten1cError(data.error ?? "Не удалось загрузить балансы"));
          return;
        }
        setBalances(data.balances ?? []);
        setTotalBalance(data.totalBalance ?? 0);
        setError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setBalances([]);
        setTotalBalance(0);
        setError("Не удалось загрузить балансы");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, showSums, auth.login, auth.password, auth.isRegisteredUser, innsKey, namesByInn]);

  return { balances, totalBalance, loading, error };
}

export type CustomerBalanceRow = {
  inn: string;
  name: string;
  balance: number;
  debtsCount: number;
  error?: string;
};

export type CustomerBalancesResponse = {
  balances: CustomerBalanceRow[];
  totalBalance: number;
  error?: string;
};

export async function postCustomerBalances(body: {
  login: string;
  password: string;
  isRegisteredUser?: boolean;
  inns: string[];
  namesByInn?: Record<string, string>;
}): Promise<{ ok: boolean; data: CustomerBalancesResponse }> {
  const res = await fetch("/api/customer-balances", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as CustomerBalancesResponse;
  if (!res.ok) {
    return {
      ok: false,
      data: {
        balances: [],
        totalBalance: 0,
        error: typeof data.error === "string" ? data.error : "Ошибка загрузки балансов",
      },
    };
  }
  return { ok: true, data };
}

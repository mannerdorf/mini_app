export type AdminCustomerRow = {
  inn: string;
  customer_name: string;
  email: string;
};

export type AdminCustomersSortBy = "inn" | "customer_name" | "email";

export function filterCustomersWithoutEmail(list: AdminCustomerRow[], onlyWithoutEmail: boolean): AdminCustomerRow[] {
  if (!onlyWithoutEmail) return list;
  return list.filter((c) => !c.email || String(c.email).trim() === "");
}

export function sortCustomers(
  list: AdminCustomerRow[],
  sortBy: AdminCustomersSortBy,
  sortOrder: "asc" | "desc",
): AdminCustomerRow[] {
  return [...list].sort((a, b) => {
    const va = (sortBy === "inn" ? a.inn : sortBy === "customer_name" ? (a.customer_name || "") : (a.email || "")).toLowerCase();
    const vb = (sortBy === "inn" ? b.inn : sortBy === "customer_name" ? (b.customer_name || "") : (b.email || "")).toLowerCase();
    const cmp = va.localeCompare(vb, "ru");
    return sortOrder === "asc" ? cmp : -cmp;
  });
}

export function exportCustomersCsv(list: AdminCustomerRow[]) {
  const escapeCsv = (s: string) => {
    const t = String(s ?? "").trim();
    if (/[",\r\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
    return t;
  };
  const header = "ИНН;Наименование;Email";
  const rows = list.map((c) => [c.inn, c.customer_name || "", c.email || ""].map(escapeCsv).join(";"));
  const csv = "\uFEFF" + header + "\r\n" + rows.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `заказчики_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export type AdminCustomersTabUser = {
  id: number;
  login?: string;
  inn?: string;
  companies?: { inn: string; name?: string }[];
};

export function customerIsRegistered(
  c: { inn: string; email?: string },
  users: AdminCustomersTabUser[],
): boolean {
  const email = (c.email || "").trim().toLowerCase();
  if (!email) return false;
  return users.some(
    (u) => u.login?.toLowerCase() === email || u.inn === c.inn || (u.companies?.some((comp) => comp.inn === c.inn) ?? false),
  );
}

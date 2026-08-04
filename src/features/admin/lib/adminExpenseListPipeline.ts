import type { ExpenseRequestItem } from "../../../pages/ExpenseRequestsPage";
import { getSupplierLabel } from "./adminExpenseRequestsHelpers";
import type { AdminExpenseSortCol } from "../hooks/useAdminExpenseRequests";

type Params = {
  requests: (ExpenseRequestItem & { login: string })[];
  isAccountingExpenses: boolean;
  filters: {
    date: string;
    department: string;
    category: string;
    vehicle: string;
    employee: string;
    supplier: string;
    status: string;
  };
  sortCol: AdminExpenseSortCol;
  sortAsc: boolean;
};

export function buildAdminExpenseListView({
  requests,
  isAccountingExpenses,
  filters,
  sortCol,
  sortAsc,
}: Params) {
  const baseFiltered = isAccountingExpenses
    ? requests.filter((r) => r.status === "approved" || r.status === "sent" || r.status === "paid")
    : requests;

  const filtered = baseFiltered.filter((r) => {
    if (filters.date && (r as { period?: string }).period !== filters.date) return false;
    if (filters.department && r.department !== filters.department) return false;
    if (filters.category && r.categoryName !== filters.category) return false;
    if (filters.vehicle && r.vehicleOrEmployee !== filters.vehicle) return false;
    if (filters.employee && (r as { employeeName?: string }).employeeName !== filters.employee) return false;
    if (filters.supplier && getSupplierLabel(r) !== filters.supplier) return false;
    if (filters.status && r.status !== filters.status) return false;
    return true;
  });

  const totalAmount = filtered.reduce((sum, r) => sum + r.amount, 0);
  const depOptions = [...new Set(baseFiltered.map((r) => r.department).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
  const catOptions = [...new Set(baseFiltered.map((r) => r.categoryName).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
  const vehicleOptions = [...new Set(baseFiltered.map((r) => r.vehicleOrEmployee).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
  const employeeOptions = [...new Set(baseFiltered.map((r) => (r as { employeeName?: string }).employeeName).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
  const supplierOptions = [...new Set(baseFiltered.map((r) => getSupplierLabel(r)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
  const statusOptions = [...new Set(baseFiltered.map((r) => r.status))].sort();

  const dir = sortAsc ? 1 : -1;
  const sorted = [...filtered].sort((a, b) => {
    if (sortCol === "amount") return (a.amount - b.amount) * dir;
    const av = String((a as Record<string, unknown>)[sortCol] ?? "");
    const bv = String((b as Record<string, unknown>)[sortCol] ?? "");
    return av.localeCompare(bv, "ru") * dir;
  });

  return {
    baseFiltered,
    filtered,
    sorted,
    totalAmount,
    depOptions,
    catOptions,
    vehicleOptions,
    employeeOptions,
    supplierOptions,
    statusOptions,
  };
}

export function buildExpenseLoginDisplayNameMap(
  employees: { login: string; full_name?: string | null }[],
): Record<string, string> {
  return Object.fromEntries(
    employees.map((e) => [e.login.trim().toLowerCase(), e.full_name?.trim() || e.login]),
  );
}

export function getExpenseLoginDisplayName(map: Record<string, string>, login: string): string {
  return map[login?.trim().toLowerCase() ?? ""] || login || "—";
}

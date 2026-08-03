import { SUBDIVISIONS } from "../../../pnl/constants";
import type { ExpenseRequestItem } from "../../../pages/ExpenseRequestsPage";
import type { PnlExpenseCategoryLink } from "../types/expenseAccounting";

export function normalizeMatch(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function resolveSubdivisionId(departmentLabel: string): string {
  const norm = normalizeMatch(departmentLabel);
  const byLabel = SUBDIVISIONS.find((s) => normalizeMatch(s.label) === norm);
  if (byLabel) return byLabel.id;
  const byId = SUBDIVISIONS.find((s) => normalizeMatch(s.id) === norm);
  return byId?.id || "";
}

export function hasPnlExpenseCombination(
  item: ExpenseRequestItem,
  pnlExpenseCategoryLinks: PnlExpenseCategoryLink[],
): boolean {
  const subdivisionId = resolveSubdivisionId(item.department);
  const subdivision = SUBDIVISIONS.find((s) => s.id === subdivisionId);
  if (!subdivision) return false;
  const reqCategoryId = String(item.categoryId || "").trim();
  const reqCategoryName = normalizeMatch(item.categoryName);
  return pnlExpenseCategoryLinks.some((row) => {
    if (row.department !== subdivision.department) return false;
    if ((row.logisticsStage ?? null) !== (subdivision.logisticsStage ?? null)) return false;
    if (reqCategoryId && row.expenseCategoryId && String(row.expenseCategoryId) === reqCategoryId) return true;
    if (reqCategoryName && normalizeMatch(row.name) === reqCategoryName) return true;
    return false;
  });
}

export function getSupplierLabel(row: ExpenseRequestItem): string {
  const supplierName = String((row as ExpenseRequestItem & { supplierName?: string }).supplierName ?? "").trim();
  const supplierInn = String((row as ExpenseRequestItem & { supplierInn?: string }).supplierInn ?? "").trim();
  if (supplierName && supplierInn) return `${supplierName}, ИНН ${supplierInn}`;
  if (supplierName) return supplierName;
  if (supplierInn) return `ИНН ${supplierInn}`;
  return "";
}

export function normalizeDocDateInput(value: string): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}$/.test(raw)) return `${raw}-01`;
  const ru = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (ru) return `${ru[3]}-${ru[2]}-${ru[1]}`;
  const isoPrefix = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoPrefix) return isoPrefix[1];
  return null;
}

export function getExpenseStatusLabels(isAccountingExpenses: boolean): Record<string, string> {
  return isAccountingExpenses
    ? { draft: "Черновик", pending_approval: "На согласовании", approved: "В банк", rejected: "Отклонено", sent: "Ожидает оплату", paid: "Оплачено" }
    : { draft: "Черновик", pending_approval: "На согласовании", approved: "Согласовано", rejected: "Отклонено", sent: "Отправлено", paid: "Оплачено" };
}

export function getExpenseStatusBadgeMap(isAccountingExpenses: boolean): Record<string, { bg: string; color: string; label: string }> {
  return isAccountingExpenses
    ? {
        draft: { bg: "rgba(245,158,11,0.15)", color: "#f59e0b", label: "Черновик" },
        pending_approval: { bg: "rgba(59,130,246,0.15)", color: "#3b82f6", label: "На согласовании" },
        approved: { bg: "rgba(16,185,129,0.15)", color: "#10b981", label: "В банк" },
        rejected: { bg: "rgba(239,68,68,0.15)", color: "#ef4444", label: "Отклонено" },
        sent: { bg: "rgba(34,197,94,0.15)", color: "#22c55e", label: "Ожидает оплату" },
        paid: { bg: "rgba(139,92,246,0.15)", color: "#8b5cf6", label: "Оплачено" },
      }
    : {
        draft: { bg: "rgba(245,158,11,0.15)", color: "#f59e0b", label: "Черновик" },
        pending_approval: { bg: "rgba(59,130,246,0.15)", color: "#3b82f6", label: "На согласовании" },
        approved: { bg: "rgba(16,185,129,0.15)", color: "#10b981", label: "Согласовано" },
        rejected: { bg: "rgba(239,68,68,0.15)", color: "#ef4444", label: "Отклонено" },
        sent: { bg: "rgba(16,185,129,0.15)", color: "#10b981", label: "Отправлено" },
        paid: { bg: "rgba(139,92,246,0.15)", color: "#8b5cf6", label: "Оплачено" },
      };
}

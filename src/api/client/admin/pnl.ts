/**
 * Admin/P&L: подразделения и категории расходов (прокси к pnl API).
 */

import { pnlGet } from "../../../pnl/api";

export type PnlSubdivisionRow = { name?: string };

export type PnlExpenseCategoryLinkRow = {
  expenseCategoryId?: string;
  name?: string;
  department?: string;
  logisticsStage?: string;
};

export async function fetchPnlSubdivisions(): Promise<string[]> {
  const data = await pnlGet<PnlSubdivisionRow[]>("/api/subdivisions");
  if (!Array.isArray(data)) return [];
  return data.map((row) => String(row?.name ?? "").trim()).filter(Boolean);
}

export async function fetchPnlExpenseCategoryLinks(): Promise<Array<{
  expenseCategoryId: string | null;
  name: string | null;
  department: string;
  logisticsStage: string | null;
}>> {
  const data = await pnlGet<PnlExpenseCategoryLinkRow[]>("/api/expense-categories");
  if (!Array.isArray(data)) return [];
  return data.map((row) => ({
    expenseCategoryId: row?.expenseCategoryId ? String(row.expenseCategoryId) : null,
    name: row?.name ? String(row.name) : null,
    department: String(row?.department || ""),
    logisticsStage: row?.logisticsStage ? String(row.logisticsStage) : null,
  }));
}

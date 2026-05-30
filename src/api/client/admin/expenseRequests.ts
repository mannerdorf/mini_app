/**
 * Admin API: заявки на расходы (список для суперадмина).
 */

import type { ExpenseRequestItem } from "../../../pages/ExpenseRequestsPage";
import { adminAuthHeaders } from "./auth";

export type AdminExpenseRequestRow = ExpenseRequestItem & { login?: string };

export async function fetchAdminExpenseRequests(adminToken: string): Promise<AdminExpenseRequestRow[]> {
  const res = await fetch("/api/admin-expense-requests", { headers: adminAuthHeaders(adminToken) });
  const data = (await res.json().catch(() => ({}))) as { items?: AdminExpenseRequestRow[]; error?: string };
  if (!res.ok) throw new Error(data.error || "Ошибка загрузки заявок на расходы");
  return Array.isArray(data.items) ? data.items : [];
}

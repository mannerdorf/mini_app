import React from "react";
import { AdminExpenseRequestsSection } from "./AdminExpenseRequestsSection";
import type { useAdminEmployeeDirectory } from "../hooks/useAdminEmployeeDirectory";
import type { PnlExpensePrefill } from "../types/expenseAccounting";

type EmployeeDir = ReturnType<typeof useAdminEmployeeDirectory>;

export type AdminExpenseRequestsTabProps = {
  adminToken: string;
  isSuperAdmin: boolean;
  onError: (msg: string | null) => void;
  employeeDir: EmployeeDir;
  onPnlPrefill: (prefill: PnlExpensePrefill) => void;
  onNavigateToPnl: () => void;
};

export function AdminExpenseRequestsTab(props: AdminExpenseRequestsTabProps) {
  return <AdminExpenseRequestsSection {...props} mode="standalone" />;
}

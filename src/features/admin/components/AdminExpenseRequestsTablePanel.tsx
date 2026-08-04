import React from "react";
import type { AdminExpenseRequestsState } from "../hooks/useAdminExpenseRequests";
import { AdminExpenseRequestsFiltersBar } from "./AdminExpenseRequestsFiltersBar";
import { AdminExpenseRequestsTable } from "./AdminExpenseRequestsTable";

type Props = Pick<
  AdminExpenseRequestsState,
  | "adminExpenseSortCol"
  | "expenseFilterDate"
  | "setExpenseFilterDate"
  | "expenseFilterDepartment"
  | "setExpenseFilterDepartment"
  | "expenseFilterCategory"
  | "setExpenseFilterCategory"
  | "expenseFilterVehicle"
  | "setExpenseFilterVehicle"
  | "expenseFilterEmployee"
  | "setExpenseFilterEmployee"
  | "expenseFilterSupplier"
  | "setExpenseFilterSupplier"
  | "expenseFilterStatus"
  | "setExpenseFilterStatus"
  | "depOptions"
  | "catOptions"
  | "vehicleOptions"
  | "employeeOptions"
  | "supplierOptions"
  | "statusOptions"
  | "statusLabels"
  | "totalAmount"
  | "filtered"
  | "sorted"
  | "toggleSort"
  | "arrow"
  | "getLoginDisplayName"
  | "checkPnlExpenseCombination"
  | "openPnlExpenseDirectory"
  | "beginExpenseEdit"
  | "updateExpenseStatus"
  | "deleteExpenseRequest"
  | "isAccounting"
> & {
  adminToken: string;
  onError: (msg: string | null) => void;
  setExpenseRejectId: AdminExpenseRequestsState["setExpenseRejectId"];
  setExpenseRejectComment: AdminExpenseRequestsState["setExpenseRejectComment"];
  setExpenseViewId: AdminExpenseRequestsState["setExpenseViewId"];
  statusBadge: (s: string) => React.ReactNode;
};

export function AdminExpenseRequestsTablePanel(props: Props) {
  return (
    <>
      <AdminExpenseRequestsFiltersBar {...props} />
      <AdminExpenseRequestsTable {...props} />
    </>
  );
}

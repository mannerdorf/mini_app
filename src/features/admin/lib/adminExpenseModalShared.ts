import type { ReactNode } from "react";
import { fetchAdminExpenseAttachmentBlob } from "../../../api/client/admin/expenseRequests";
import type { useAdminEmployeeDirectory } from "../hooks/useAdminEmployeeDirectory";
import type { AdminExpenseRequestsState } from "../hooks/useAdminExpenseRequests";

export type EmployeeDir = ReturnType<typeof useAdminEmployeeDirectory>;

export type AdminExpenseModalSharedProps = Pick<
  AdminExpenseRequestsState,
  | "adminExpenseRequests"
  | "expenseViewId"
  | "setExpenseViewId"
  | "expenseRejectId"
  | "setExpenseRejectId"
  | "expenseRejectComment"
  | "setExpenseRejectComment"
  | "expenseEditId"
  | "setExpenseEditId"
  | "expenseEditDocNumber"
  | "setExpenseEditDocNumber"
  | "expenseEditDocDate"
  | "setExpenseEditDocDate"
  | "expenseEditPeriod"
  | "setExpenseEditPeriod"
  | "expenseEditDepartment"
  | "setExpenseEditDepartment"
  | "expenseEditCategory"
  | "setExpenseEditCategory"
  | "expenseEditAmount"
  | "setExpenseEditAmount"
  | "expenseEditVatRate"
  | "setExpenseEditVatRate"
  | "expenseEditComment"
  | "setExpenseEditComment"
  | "expenseEditVehicle"
  | "setExpenseEditVehicle"
  | "expenseEditTransportType"
  | "setExpenseEditTransportType"
  | "expenseEditEmployee"
  | "setExpenseEditEmployee"
  | "expenseEditSupplierName"
  | "setExpenseEditSupplierName"
  | "expenseEditSupplierInn"
  | "setExpenseEditSupplierInn"
  | "expenseCategories"
  | "depOptions"
  | "getLoginDisplayName"
  | "beginExpenseEdit"
  | "updateExpenseStatus"
  | "saveExpenseEdit"
> & {
  adminToken: string;
  employeeDir: EmployeeDir;
  statusBadge: (s: string) => ReactNode;
};

export const EXPENSE_EDIT_FIELD_LABEL = { fontSize: "0.72rem", color: "var(--color-text-secondary)", display: "block" as const, marginBottom: "0.15rem" };
export const EXPENSE_EDIT_FIELD_INPUT = { width: "100%", padding: "0.45rem", height: 36, boxSizing: "border-box" as const };

export async function openAdminExpenseAttachment(adminToken: string, requestUid: string, attachmentId: number) {
  const blob = await fetchAdminExpenseAttachmentBlob(adminToken, requestUid, attachmentId);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export async function downloadAdminExpenseAttachment(adminToken: string, requestUid: string, attachmentId: number, fileName: string) {
  const blob = await fetchAdminExpenseAttachmentBlob(adminToken, requestUid, attachmentId);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName || "файл";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

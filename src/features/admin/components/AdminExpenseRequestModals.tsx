import React from "react";
import { AdminExpenseViewModal } from "./AdminExpenseViewModal";
import { AdminExpenseRejectModal } from "./AdminExpenseRejectModal";
import { AdminExpenseEditModal } from "./AdminExpenseEditModal";
import type { AdminExpenseModalSharedProps } from "../lib/adminExpenseModalShared";

export type AdminExpenseRequestModalsProps = AdminExpenseModalSharedProps;

export function AdminExpenseRequestModals(props: AdminExpenseRequestModalsProps) {
  return (
    <>
      <AdminExpenseViewModal {...props} />
      <AdminExpenseRejectModal {...props} />
      <AdminExpenseEditModal {...props} />
    </>
  );
}

import { useCallback } from "react";
import type { ExpenseRequestItem } from "../../../pages/ExpenseRequestsPage";
import {
  patchAdminExpenseRequest,
  deleteAdminExpenseRequest,
  postExpenseRequestsWebhook,
} from "../../../api/client/admin/expenseRequests";
import {
  deleteExpenseRequestFromLocalStorage,
  patchExpenseRequestInLocalStorage,
} from "../lib/adminExpenseLocalStorage";

type Params = {
  adminToken: string;
  onError: (msg: string | null) => void;
  reload: () => void;
};

export function useAdminExpenseMutations({ adminToken, onError, reload }: Params) {
  const updateExpenseStatus = useCallback(async (
    itemId: string,
    itemLogin: string,
    newStatus: string,
    rejectReason?: string,
    fullItem?: ExpenseRequestItem & { login: string },
  ) => {
    const patchLocal = () => {
      patchExpenseRequestInLocalStorage(itemLogin, itemId, {
        status: newStatus as ExpenseRequestItem["status"],
        ...(rejectReason !== undefined ? { rejectionReason: rejectReason } : {}),
      });
    };

    if (adminToken) {
      try {
        let res = await patchAdminExpenseRequest(adminToken, {
          uid: itemId,
          status: newStatus,
          rejection_reason: rejectReason,
        });
        if (res.status === 404 && fullItem) {
          await postExpenseRequestsWebhook({ ...fullItem, status: newStatus, login: itemLogin });
          res = await patchAdminExpenseRequest(adminToken, {
            uid: itemId,
            status: newStatus,
            rejection_reason: rejectReason,
          });
        }
        if (res.ok) {
          onError(null);
          patchLocal();
          reload();
          return;
        }
        const errData = await res.json().catch(() => ({}));
        const detail = errData?.details ? `: ${errData.details}` : "";
        onError(String(errData?.error || `Ошибка обновления статуса (${res.status})`) + detail);
      } catch (e) {
        onError((e as Error)?.message || "Ошибка обновления статуса заявки");
      }
    }

    patchLocal();
    reload();
  }, [adminToken, onError, reload]);

  const deleteExpenseRequest = useCallback(async (itemId: string, itemLogin: string) => {
    if (adminToken) {
      try {
        if (await deleteAdminExpenseRequest(adminToken, itemId)) {
          deleteExpenseRequestFromLocalStorage(itemLogin, itemId);
          reload();
          return;
        }
      } catch {
        /* fallback */
      }
    }
    deleteExpenseRequestFromLocalStorage(itemLogin, itemId);
    reload();
  }, [adminToken, reload]);

  return { updateExpenseStatus, deleteExpenseRequest };
}

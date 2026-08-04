import { useState, useEffect, useCallback } from "react";
import type { ExpenseRequestItem } from "../../../pages/ExpenseRequestsPage";
import { updateAdminExpenseRequest } from "../../../api/client/admin/expenseRequests";
import { fetchExpenseRequestCategories } from "../../../api/client/expenseRequestsUser";
import { normalizeDocDateInput } from "../lib/adminExpenseRequestsHelpers";
import { replaceExpenseRequestInLocalStorage } from "../lib/adminExpenseLocalStorage";

type Params = {
  adminToken: string;
  onError: (msg: string | null) => void;
  onSaved: () => void;
};

export function useAdminExpenseEditForm({ adminToken, onError, onSaved }: Params) {
  const [expenseRejectId, setExpenseRejectId] = useState<string | null>(null);
  const [expenseRejectComment, setExpenseRejectComment] = useState("");
  const [expenseViewId, setExpenseViewId] = useState<string | null>(null);
  const [expenseEditId, setExpenseEditId] = useState<string | null>(null);
  const [expenseEditDocNumber, setExpenseEditDocNumber] = useState("");
  const [expenseEditDocDate, setExpenseEditDocDate] = useState("");
  const [expenseEditPeriod, setExpenseEditPeriod] = useState("");
  const [expenseEditDepartment, setExpenseEditDepartment] = useState("");
  const [expenseEditCategory, setExpenseEditCategory] = useState("");
  const [expenseEditAmount, setExpenseEditAmount] = useState("");
  const [expenseEditVatRate, setExpenseEditVatRate] = useState("");
  const [expenseEditComment, setExpenseEditComment] = useState("");
  const [expenseEditVehicle, setExpenseEditVehicle] = useState("");
  const [expenseEditTransportType, setExpenseEditTransportType] = useState<"auto" | "ferry">("auto");
  const [expenseEditEmployee, setExpenseEditEmployee] = useState("");
  const [expenseEditSupplierName, setExpenseEditSupplierName] = useState("");
  const [expenseEditSupplierInn, setExpenseEditSupplierInn] = useState("");
  const [expenseCategories, setExpenseCategories] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (expenseEditDepartment) params.set("department", expenseEditDepartment);
    params.set("transportType", expenseEditTransportType);
    fetchExpenseRequestCategories(params)
      .then((rows) => {
        const mapped = rows
          .map((row) => ({ id: String(row?.id ?? "").trim(), name: String(row?.name ?? "").trim() }))
          .filter((row) => row.id && row.name);
        setExpenseCategories(mapped);
      })
      .catch(() => {
        /* keep fallback list */
      });
  }, [expenseEditDepartment, expenseEditTransportType]);

  useEffect(() => {
    if (!expenseEditId) return;
    if (expenseCategories.length === 0) {
      setExpenseEditCategory("");
      return;
    }
    if (!expenseCategories.some((c) => c.id === expenseEditCategory)) {
      setExpenseEditCategory(expenseCategories[0].id);
    }
  }, [expenseEditId, expenseCategories, expenseEditCategory]);

  const beginExpenseEdit = useCallback((item: ExpenseRequestItem & { login: string }) => {
    setExpenseEditId(item.id);
    setExpenseEditDocNumber((item as { docNumber?: string }).docNumber ?? "");
    setExpenseEditDocDate((item as { docDate?: string }).docDate ?? "");
    setExpenseEditPeriod((item as { period?: string }).period ?? "");
    setExpenseEditDepartment(item.department);
    setExpenseEditCategory(item.categoryId);
    setExpenseEditAmount(String(item.amount));
    setExpenseEditVatRate((item as { vatRate?: string }).vatRate ?? "");
    setExpenseEditComment(item.comment);
    setExpenseEditVehicle(item.vehicleOrEmployee);
    setExpenseEditTransportType((item as { transportType?: string }).transportType === "ferry" ? "ferry" : "auto");
    setExpenseEditEmployee((item as { employeeName?: string }).employeeName ?? "");
    setExpenseEditSupplierName((item as { supplierName?: string }).supplierName ?? "");
    setExpenseEditSupplierInn((item as { supplierInn?: string }).supplierInn ?? "");
  }, []);

  const saveExpenseEdit = useCallback(async (itemId: string, itemLogin: string) => {
    if (!expenseEditCategory) {
      onError("Выберите статью расхода");
      return;
    }
    const num = parseFloat(expenseEditAmount.replace(",", "."));
    const catObj = expenseCategories.find((c) => c.id === expenseEditCategory);
    const normalizedDocDate = normalizeDocDateInput(expenseEditDocDate);
    const payload = {
      uid: itemId,
      docNumber: expenseEditDocNumber,
      docDate: normalizedDocDate,
      period: expenseEditPeriod,
      department: expenseEditDepartment,
      categoryId: catObj?.id ?? expenseEditCategory,
      amount: Number.isFinite(num) && num > 0 ? num : undefined,
      vatRate: expenseEditVatRate,
      comment: expenseEditComment,
      vehicleOrEmployee: expenseEditVehicle,
      transportType: expenseEditTransportType,
      employeeName: expenseEditEmployee,
      supplierName: expenseEditSupplierName,
      supplierInn: expenseEditSupplierInn,
    };

    if (adminToken) {
      try {
        const result = await updateAdminExpenseRequest(adminToken, payload);
        if (result.ok) {
          setExpenseEditId(null);
          onSaved();
          return;
        }
        onError(result.error);
      } catch (e) {
        onError((e as Error)?.message || "Ошибка сохранения заявки");
      }
    }

    replaceExpenseRequestInLocalStorage(itemLogin, itemId, (r) => ({
      ...r,
      docNumber: expenseEditDocNumber,
      docDate: normalizedDocDate || "",
      period: expenseEditPeriod,
      department: expenseEditDepartment || r.department,
      ...(catObj ? { categoryId: catObj.id, categoryName: catObj.name } : {}),
      ...(Number.isFinite(num) && num > 0 ? { amount: num } : {}),
      vatRate: expenseEditVatRate,
      comment: expenseEditComment,
      vehicleOrEmployee: expenseEditVehicle,
      transportType: expenseEditTransportType,
      employeeName: expenseEditEmployee,
      supplierName: expenseEditSupplierName,
      supplierInn: expenseEditSupplierInn,
    }));
    setExpenseEditId(null);
    onSaved();
  }, [
    adminToken,
    expenseEditDocNumber,
    expenseEditDocDate,
    expenseEditPeriod,
    expenseEditDepartment,
    expenseEditCategory,
    expenseEditAmount,
    expenseEditVatRate,
    expenseEditComment,
    expenseEditVehicle,
    expenseEditTransportType,
    expenseEditEmployee,
    expenseEditSupplierName,
    expenseEditSupplierInn,
    expenseCategories,
    onError,
    onSaved,
  ]);

  return {
    expenseRejectId,
    setExpenseRejectId,
    expenseRejectComment,
    setExpenseRejectComment,
    expenseViewId,
    setExpenseViewId,
    expenseEditId,
    setExpenseEditId,
    expenseEditDocNumber,
    setExpenseEditDocNumber,
    expenseEditDocDate,
    setExpenseEditDocDate,
    expenseEditPeriod,
    setExpenseEditPeriod,
    expenseEditDepartment,
    setExpenseEditDepartment,
    expenseEditCategory,
    setExpenseEditCategory,
    expenseEditAmount,
    setExpenseEditAmount,
    expenseEditVatRate,
    setExpenseEditVatRate,
    expenseEditComment,
    setExpenseEditComment,
    expenseEditVehicle,
    setExpenseEditVehicle,
    expenseEditTransportType,
    setExpenseEditTransportType,
    expenseEditEmployee,
    setExpenseEditEmployee,
    expenseEditSupplierName,
    setExpenseEditSupplierName,
    expenseEditSupplierInn,
    setExpenseEditSupplierInn,
    expenseCategories,
    beginExpenseEdit,
    saveExpenseEdit,
  };
}

export type AdminExpenseEditFormState = ReturnType<typeof useAdminExpenseEditForm>;

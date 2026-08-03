import { useState, useEffect, useCallback, useMemo } from "react";
import type { ExpenseRequestItem } from "../../../pages/ExpenseRequestsPage";
import {
  fetchAdminExpenseRequests,
  patchAdminExpenseRequest,
  deleteAdminExpenseRequest,
  updateAdminExpenseRequest,
} from "../../../api/client/admin/expenseRequests";
import { fetchAdminSverkiRequests, deleteAdminSverkiRequest, updateAdminSverkiRequestStatus } from "../../../api/client/admin/sverki";
import type { UseAdminEmployeeDirectoryReturn } from "./useAdminEmployeeDirectory";
import type { AdminExpenseRequestsMode, PnlExpenseCategoryLink, PnlExpensePrefill } from "../types/expenseAccounting";
import {
  getExpenseStatusLabels,
  getExpenseStatusBadgeMap,
  getSupplierLabel,
  hasPnlExpenseCombination,
  normalizeDocDateInput,
  resolveSubdivisionId,
} from "../lib/adminExpenseRequestsHelpers";

export type AdminExpenseSortCol = "createdAt" | "docNumber" | "docDate" | "period" | "department" | "categoryName" | "amount" | "status" | "login";

export type AdminSverkiRequest = {
  id: number;
  login: string;
  customerInn: string;
  contract: string;
  periodFrom: string;
  periodTo: string;
  status: "pending" | "edo_sent";
  createdAt: string;
  updatedAt: string;
};

export type UseAdminExpenseRequestsParams = {
  adminToken: string;
  isSuperAdmin: boolean;
  onError: (msg: string | null) => void;
  mode: AdminExpenseRequestsMode;
  employeeDir: UseAdminEmployeeDirectoryReturn;
  onPnlPrefill: (prefill: PnlExpensePrefill) => void;
  onNavigateToPnl: () => void;
};

export function useAdminExpenseRequests({
  adminToken,
  isSuperAdmin,
  onError,
  mode,
  employeeDir,
  onPnlPrefill,
  onNavigateToPnl,
}: UseAdminExpenseRequestsParams) {
  const isAccounting = mode === "accounting_expenses" || mode === "accounting_sverki";
  const isAccountingSverki = mode === "accounting_sverki";
  const isAccountingExpenses = mode === "accounting_expenses";

    const [adminExpenseRequests, setAdminExpenseRequests] = useState<(ExpenseRequestItem & { login: string })[]>([]);
    const [adminExpenseSortCol, setAdminExpenseSortCol] = useState<"createdAt" | "docNumber" | "docDate" | "period" | "department" | "categoryName" | "amount" | "status" | "login">("createdAt");
    const [adminExpenseSortAsc, setAdminExpenseSortAsc] = useState(false);
    const [expenseFilterDate, setExpenseFilterDate] = useState("");
    const [expenseFilterDepartment, setExpenseFilterDepartment] = useState("");
    const [expenseFilterCategory, setExpenseFilterCategory] = useState("");
    const [expenseFilterVehicle, setExpenseFilterVehicle] = useState("");
    const [expenseFilterEmployee, setExpenseFilterEmployee] = useState("");
    const [expenseFilterSupplier, setExpenseFilterSupplier] = useState("");
    const [expenseFilterStatus, setExpenseFilterStatus] = useState("");
    const [pnlExpenseCategoryLinks, setPnlExpenseCategoryLinks] = useState<PnlExpenseCategoryLink[]>([]);
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
      const [sverkiRequests, setSverkiRequests] = useState<{
      id: number;
      login: string;
      customerInn: string;
      contract: string;
      periodFrom: string;
      periodTo: string;
      status: "pending" | "edo_sent";
      createdAt: string;
      updatedAt: string;
    }[]>([]);
    const [sverkiRequestsLoading, setSverkiRequestsLoading] = useState(false);
    const [sverkiRequestsUpdatingId, setSverkiRequestsUpdatingId] = useState<number | null>(null);

    const reloadAllExpenseRequests = useCallback(async () => {
      const fromLocalStorage = () => {
        const prefix = "haulz.expense_requests.";
        const all: (ExpenseRequestItem & { login: string })[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k || !k.startsWith(prefix)) continue;
          const login = k.slice(prefix.length);
          try {
            const items = JSON.parse(localStorage.getItem(k) ?? "[]") as ExpenseRequestItem[];
            if (Array.isArray(items)) items.forEach((r) => { if (r && r.createdAt) all.push({ ...r, login }); });
          } catch { /* skip */ }
        }
        all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setAdminExpenseRequests(all);
      };
      if (adminToken && isSuperAdmin) {
        try {
          const items = await fetchAdminExpenseRequests(adminToken);
          setAdminExpenseRequests(items);
          return;
        } catch (e: unknown) {
          onError((e as Error)?.message || "Ошибка загрузки заявок на расходы");
        }
      }
      fromLocalStorage();
    }, [adminToken, isSuperAdmin, onError]);


    const reloadSverkiRequests = useCallback(async () => {
      if (!adminToken || !isSuperAdmin) {
        setSverkiRequests([]);
        return;
      }
      setSverkiRequestsLoading(true);
      try {
        setSverkiRequests(await fetchAdminSverkiRequests(adminToken));
      } catch {
        setSverkiRequests([]);
      } finally {
        setSverkiRequestsLoading(false);
      }
    }, [adminToken, isSuperAdmin]);


    useEffect(() => {
      const origin = typeof window !== "undefined" && window.location?.origin ? window.location.origin : "";
      const params = new URLSearchParams();
      if (expenseEditDepartment) params.set("department", expenseEditDepartment);
      params.set("transportType", expenseEditTransportType);
      fetch(`${origin}/api/expense-request-categories${params.toString() ? `?${params.toString()}` : ""}`)
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((data: any) => {
          if (!Array.isArray(data)) return;
          const mapped = data
            .map((row: any) => ({ id: String(row?.id ?? "").trim(), name: String(row?.name ?? "").trim() }))
            .filter((row: { id: string; name: string }) => row.id && row.name);
          setExpenseCategories(mapped);
        })
        .catch(() => {
          // keep fallback list
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

    const loadPnlExpenseCategoryLinks = useCallback(async () => {
      try {
        const res = await fetch("/api/pnl-expense-categories");
        const data = await res.json().catch(() => []);
        if (!res.ok || !Array.isArray(data)) return;
        setPnlExpenseCategoryLinks(
          data.map((row: any) => ({
            expenseCategoryId: row?.expenseCategoryId ? String(row.expenseCategoryId) : null,
            name: row?.name ? String(row.name) : null,
            department: String(row?.department || ""),
            logisticsStage: row?.logisticsStage ? String(row.logisticsStage) : null,
          }))
        );
      } catch {
        // no-op
      }
    }, []);


    const markSverkiRequestAsSent = useCallback(async (id: number) => {
      if (!adminToken) return;
      setSverkiRequestsUpdatingId(id);
      try {
        await updateAdminSverkiRequestStatus(adminToken, id, "edo_sent");
        setSverkiRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status: "edo_sent", updatedAt: new Date().toISOString() } : r)));
      } catch (e: any) {
        onError(e?.message || "Ошибка обновления статуса заявки");
      } finally {
        setSverkiRequestsUpdatingId(null);
      }
    }, [adminToken]);
    const deleteSverkiRequest = useCallback(async (id: number) => {
      if (!adminToken) return;
      const confirmed = typeof window !== "undefined" ? window.confirm("Удалить заявку акта сверки? Действие нельзя отменить.") : true;
      if (!confirmed) return;
      setSverkiRequestsUpdatingId(id);
      try {
        await deleteAdminSverkiRequest(adminToken, id);
        setSverkiRequests((prev) => prev.filter((r) => r.id !== id));
      } catch (e: any) {
        onError(e?.message || "Ошибка удаления заявки");
      } finally {
        setSverkiRequestsUpdatingId(null);
      }
    }, [adminToken]);

    const updateExpenseStatus = useCallback(async (itemId: string, itemLogin: string, newStatus: string, rejectReason?: string, fullItem?: ExpenseRequestItem & { login: string }) => {
      const storageKey = `haulz.expense_requests.${itemLogin}`;
      const updateLocal = () => {
        try {
          const raw = localStorage.getItem(storageKey);
          if (!raw) return;
          const items = JSON.parse(raw) as ExpenseRequestItem[];
          if (!Array.isArray(items)) return;
          const updated = items.map((r) =>
            r.id === itemId ? { ...r, status: newStatus as any, ...(rejectReason !== undefined ? { rejectionReason: rejectReason } : {}) } : r
          );
          localStorage.setItem(storageKey, JSON.stringify(updated));
        } catch { /* skip */ }
      };
      if (adminToken) {
        try {
          let res = await patchAdminExpenseRequest(adminToken, {
            uid: itemId,
            status: newStatus,
            rejection_reason: rejectReason,
          });
          if (res.status === 404 && fullItem) {
            await fetch("/api/expense-requests-webhook", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...fullItem, status: newStatus, login: itemLogin }),
            });
            res = await patchAdminExpenseRequest(adminToken, {
              uid: itemId,
              status: newStatus,
              rejection_reason: rejectReason,
            });
          }
          if (res.ok) {
            onError(null);
            updateLocal();
            reloadAllExpenseRequests();
            return;
          }
          const errData = await res.json().catch(() => ({}));
          const detail = errData?.details ? `: ${errData.details}` : "";
          onError(String(errData?.error || `Ошибка обновления статуса (${res.status})`) + detail);
        } catch (e) {
          onError((e as Error)?.message || "Ошибка обновления статуса заявки");
        }
      }
      updateLocal();
      reloadAllExpenseRequests();
    }, [adminToken, reloadAllExpenseRequests]);

    const deleteExpenseRequest = useCallback(async (itemId: string, itemLogin: string) => {
      const storageKey = `haulz.expense_requests.${itemLogin}`;
      const updateLocal = () => {
        try {
          const raw = localStorage.getItem(storageKey);
          if (!raw) return;
          const items = JSON.parse(raw) as ExpenseRequestItem[];
          const updated = items.filter((r) => r.id !== itemId);
          localStorage.setItem(storageKey, JSON.stringify(updated));
        } catch { /* skip */ }
      };
      if (adminToken) {
        try {
          if (await deleteAdminExpenseRequest(adminToken, itemId)) {
            updateLocal();
            reloadAllExpenseRequests();
            return;
          }
        } catch { /* fallback */ }
      }
      updateLocal();
      reloadAllExpenseRequests();
    }, [adminToken, reloadAllExpenseRequests]);

    const saveExpenseEdit = useCallback(async (itemId: string, itemLogin: string) => {
      if (!expenseEditCategory) {
        onError("Выберите статью расхода");
        return;
      }
      const num = parseFloat(expenseEditAmount.replace(",", "."));
      const catObj = expenseCategories.find((c) => c.id === expenseEditCategory);
      const normalizeDocDateInput = (value: string): string | null => {
        const raw = String(value ?? "").trim();
        if (!raw) return null;
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
        if (/^\d{4}-\d{2}$/.test(raw)) return `${raw}-01`;
        const ru = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
        if (ru) return `${ru[3]}-${ru[2]}-${ru[1]}`;
        const isoPrefix = raw.match(/^(\d{4}-\d{2}-\d{2})/);
        if (isoPrefix) return isoPrefix[1];
        return null;
      };
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
            reloadAllExpenseRequests();
            return;
          }
          onError(result.error);
        } catch (e) {
          onError((e as Error)?.message || "Ошибка сохранения заявки");
        }
      }
      const storageKey = `haulz.expense_requests.${itemLogin}`;
      try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return;
        const items = JSON.parse(raw) as ExpenseRequestItem[];
        if (!Array.isArray(items)) return;
        const updated = items.map((r) =>
          r.id === itemId ? {
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
          } : r
        );
        localStorage.setItem(storageKey, JSON.stringify(updated));
        setExpenseEditId(null);
        reloadAllExpenseRequests();
      } catch { /* skip */ }
    }, [adminToken, expenseEditDocNumber, expenseEditDocDate, expenseEditPeriod, expenseEditDepartment, expenseEditCategory, expenseEditAmount, expenseEditVatRate, expenseEditComment, expenseEditVehicle, expenseEditTransportType, expenseEditEmployee, expenseEditSupplierName, expenseEditSupplierInn, reloadAllExpenseRequests, expenseCategories]);

    useEffect(() => {
      if (isSuperAdmin) {
        employeeDir.fetch();
      }
    }, [isSuperAdmin, employeeDir.fetch]);

    useEffect(() => {
      if (isSuperAdmin) reloadAllExpenseRequests();
    }, [isSuperAdmin, reloadAllExpenseRequests]);

    useEffect(() => {
      if (isAccountingSverki && isSuperAdmin) reloadSverkiRequests();
    }, [isAccountingSverki, isSuperAdmin, reloadSverkiRequests]);

    useEffect(() => {
      if (isSuperAdmin) loadPnlExpenseCategoryLinks();
    }, [isSuperAdmin, loadPnlExpenseCategoryLinks]);

  const checkPnlExpenseCombination = useCallback(
    (item: ExpenseRequestItem) => hasPnlExpenseCombination(item, pnlExpenseCategoryLinks),
    [pnlExpenseCategoryLinks],
  );

  const openPnlExpenseDirectory = useCallback((item: ExpenseRequestItem) => {
    const subdivisionId = resolveSubdivisionId(item.department) || "administration";
    onPnlPrefill({
      requestId: item.id,
      expenseCategoryId: item.categoryId || undefined,
      categoryName: item.categoryName || undefined,
      subdivision: subdivisionId,
      type: "OPEX",
    });
    onNavigateToPnl();
  }, [onNavigateToPnl, onPnlPrefill]);

  const statusBadgeMap = getExpenseStatusBadgeMap(isAccountingExpenses);

  const toggleSort = (col: AdminExpenseSortCol) => {
    if (adminExpenseSortCol === col) setAdminExpenseSortAsc((p) => !p);
    else { setAdminExpenseSortCol(col); setAdminExpenseSortAsc(true); }
  };
  const arrow = (col: AdminExpenseSortCol) => adminExpenseSortCol === col ? (adminExpenseSortAsc ? " ▲" : " ▼") : "";
  const loginToFullName = Object.fromEntries(
    employeeDir.items.map((e) => [e.login.trim().toLowerCase(), e.full_name?.trim() || e.login]),
  ) as Record<string, string>;
  const getLoginDisplayName = (login: string) =>
    loginToFullName[login?.trim().toLowerCase() ?? ""] || login || "—";
  const baseFiltered = isAccountingExpenses
    ? adminExpenseRequests.filter((r) => r.status === "approved" || r.status === "sent" || r.status === "paid")
    : adminExpenseRequests;
  const filtered = baseFiltered.filter((r) => {
    if (expenseFilterDate && (r as any).period !== expenseFilterDate) return false;
    if (expenseFilterDepartment && r.department !== expenseFilterDepartment) return false;
    if (expenseFilterCategory && r.categoryName !== expenseFilterCategory) return false;
    if (expenseFilterVehicle && r.vehicleOrEmployee !== expenseFilterVehicle) return false;
    if (expenseFilterEmployee && (r as any).employeeName !== expenseFilterEmployee) return false;
    if (expenseFilterSupplier && getSupplierLabel(r) !== expenseFilterSupplier) return false;
    if (expenseFilterStatus && r.status !== expenseFilterStatus) return false;
    return true;
  });
  const totalAmount = filtered.reduce((sum, r) => sum + r.amount, 0);
  const depOptions = [...new Set(baseFiltered.map((r) => r.department).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
  const catOptions = [...new Set(baseFiltered.map((r) => r.categoryName).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
  const vehicleOptions = [...new Set(baseFiltered.map((r) => r.vehicleOrEmployee).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
  const employeeOptions = [...new Set(baseFiltered.map((r) => (r as any).employeeName).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
  const supplierOptions = [...new Set(baseFiltered.map((r) => getSupplierLabel(r)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
  const statusOptions = [...new Set(baseFiltered.map((r) => r.status))].sort();
  const sorted = [...filtered].sort((a, b) => {
    const dir = adminExpenseSortAsc ? 1 : -1;
    if (adminExpenseSortCol === "amount") return (a.amount - b.amount) * dir;
    const av = String((a as any)[adminExpenseSortCol] ?? "");
    const bv = String((b as any)[adminExpenseSortCol] ?? "");
    return av.localeCompare(bv, "ru") * dir;
  });

  const beginExpenseEdit = useCallback((item: ExpenseRequestItem & { login: string }) => {
    setExpenseEditId(item.id);
    setExpenseEditDocNumber((item as any).docNumber ?? "");
    setExpenseEditDocDate((item as any).docDate ?? "");
    setExpenseEditPeriod((item as any).period ?? "");
    setExpenseEditDepartment(item.department);
    setExpenseEditCategory(item.categoryId);
    setExpenseEditAmount(String(item.amount));
    setExpenseEditVatRate((item as any).vatRate ?? "");
    setExpenseEditComment(item.comment);
    setExpenseEditVehicle(item.vehicleOrEmployee);
    setExpenseEditTransportType((item as any).transportType === "ferry" ? "ferry" : "auto");
    setExpenseEditEmployee((item as any).employeeName ?? "");
    setExpenseEditSupplierName((item as any).supplierName ?? "");
    setExpenseEditSupplierInn((item as any).supplierInn ?? "");
  }, []);

  const title = isAccountingSverki ? "Бухгалтерия — акты сверок" : isAccountingExpenses ? `Бухгалтерия — согласованные заявки (${filtered.length})` : "Заявки на расходы";
  const statusLabels = getExpenseStatusLabels(isAccountingExpenses);

  return {
    isAccounting,
    isAccountingSverki,
    isAccountingExpenses,
    adminExpenseRequests,
    adminExpenseSortCol,
    setAdminExpenseSortCol,
    adminExpenseSortAsc,
    setAdminExpenseSortAsc,
    expenseFilterDate,
    setExpenseFilterDate,
    expenseFilterDepartment,
    setExpenseFilterDepartment,
    expenseFilterCategory,
    setExpenseFilterCategory,
    expenseFilterVehicle,
    setExpenseFilterVehicle,
    expenseFilterEmployee,
    setExpenseFilterEmployee,
    expenseFilterSupplier,
    setExpenseFilterSupplier,
    expenseFilterStatus,
    setExpenseFilterStatus,
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
    sverkiRequests,
    sverkiRequestsLoading,
    sverkiRequestsUpdatingId,
    reloadAllExpenseRequests,
    markSverkiRequestAsSent,
    deleteSverkiRequest,
    updateExpenseStatus,
    deleteExpenseRequest,
    saveExpenseEdit,
    checkPnlExpenseCombination,
    statusBadgeMap,
    openPnlExpenseDirectory,
    beginExpenseEdit,
    toggleSort,
    arrow,
    getLoginDisplayName,
    getSupplierLabel,
    filtered,
    totalAmount,
    depOptions,
    catOptions,
    vehicleOptions,
    employeeOptions,
    supplierOptions,
    statusOptions,
    sorted,
    title,
    statusLabels,
  };
}

export type AdminExpenseRequestsState = ReturnType<typeof useAdminExpenseRequests>;

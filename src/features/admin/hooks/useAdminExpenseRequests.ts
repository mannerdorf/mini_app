import { useState, useEffect, useCallback, useMemo } from "react";
import type { ExpenseRequestItem } from "../../../pages/ExpenseRequestsPage";
import { fetchAdminExpenseRequests } from "../../../api/client/admin/expenseRequests";
import { fetchPnlExpenseCategoryLinks } from "../../../api/client/admin/pnl";
import type { UseAdminEmployeeDirectoryReturn } from "./useAdminEmployeeDirectory";
import type { AdminExpenseRequestsMode, PnlExpenseCategoryLink, PnlExpensePrefill } from "../types/expenseAccounting";
import {
  getExpenseStatusLabels,
  getExpenseStatusBadgeMap,
  getSupplierLabel,
  hasPnlExpenseCombination,
  resolveSubdivisionId,
} from "../lib/adminExpenseRequestsHelpers";
import { loadExpenseRequestsFromLocalStorage } from "../lib/adminExpenseLocalStorage";
import {
  buildAdminExpenseListView,
  buildExpenseLoginDisplayNameMap,
  getExpenseLoginDisplayName,
} from "../lib/adminExpenseListPipeline";
import { useAdminSverkiRequests } from "./useAdminSverkiRequests";
import { useAdminExpenseEditForm } from "./useAdminExpenseEditForm";
import { useAdminExpenseMutations } from "./useAdminExpenseMutations";

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
  const [adminExpenseSortCol, setAdminExpenseSortCol] = useState<AdminExpenseSortCol>("createdAt");
  const [adminExpenseSortAsc, setAdminExpenseSortAsc] = useState(false);
  const [expenseFilterDate, setExpenseFilterDate] = useState("");
  const [expenseFilterDepartment, setExpenseFilterDepartment] = useState("");
  const [expenseFilterCategory, setExpenseFilterCategory] = useState("");
  const [expenseFilterVehicle, setExpenseFilterVehicle] = useState("");
  const [expenseFilterEmployee, setExpenseFilterEmployee] = useState("");
  const [expenseFilterSupplier, setExpenseFilterSupplier] = useState("");
  const [expenseFilterStatus, setExpenseFilterStatus] = useState("");
  const [pnlExpenseCategoryLinks, setPnlExpenseCategoryLinks] = useState<PnlExpenseCategoryLink[]>([]);

  const reloadAllExpenseRequests = useCallback(async () => {
    if (adminToken && isSuperAdmin) {
      try {
        setAdminExpenseRequests(await fetchAdminExpenseRequests(adminToken));
        return;
      } catch (e: unknown) {
        onError((e as Error)?.message || "Ошибка загрузки заявок на расходы");
      }
    }
    setAdminExpenseRequests(loadExpenseRequestsFromLocalStorage());
  }, [adminToken, isSuperAdmin, onError]);

  const editForm = useAdminExpenseEditForm({
    adminToken,
    onError,
    onSaved: reloadAllExpenseRequests,
  });

  const { updateExpenseStatus, deleteExpenseRequest } = useAdminExpenseMutations({
    adminToken,
    onError,
    reload: reloadAllExpenseRequests,
  });

  const sverki = useAdminSverkiRequests({
    adminToken,
    isSuperAdmin,
    enabled: isAccountingSverki,
    onError,
  });

  const loadPnlExpenseCategoryLinks = useCallback(async () => {
    try {
      const links = await fetchPnlExpenseCategoryLinks();
      setPnlExpenseCategoryLinks(links);
    } catch {
      /* no-op */
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin) employeeDir.fetch();
  }, [isSuperAdmin, employeeDir.fetch]);

  useEffect(() => {
    if (isSuperAdmin) void reloadAllExpenseRequests();
  }, [isSuperAdmin, reloadAllExpenseRequests]);

  useEffect(() => {
    if (isSuperAdmin) void loadPnlExpenseCategoryLinks();
  }, [isSuperAdmin, loadPnlExpenseCategoryLinks]);

  const listView = useMemo(
    () => buildAdminExpenseListView({
      requests: adminExpenseRequests,
      isAccountingExpenses,
      filters: {
        date: expenseFilterDate,
        department: expenseFilterDepartment,
        category: expenseFilterCategory,
        vehicle: expenseFilterVehicle,
        employee: expenseFilterEmployee,
        supplier: expenseFilterSupplier,
        status: expenseFilterStatus,
      },
      sortCol: adminExpenseSortCol,
      sortAsc: adminExpenseSortAsc,
    }),
    [
      adminExpenseRequests,
      isAccountingExpenses,
      expenseFilterDate,
      expenseFilterDepartment,
      expenseFilterCategory,
      expenseFilterVehicle,
      expenseFilterEmployee,
      expenseFilterSupplier,
      expenseFilterStatus,
      adminExpenseSortCol,
      adminExpenseSortAsc,
    ],
  );

  const loginToFullName = useMemo(
    () => buildExpenseLoginDisplayNameMap(employeeDir.items),
    [employeeDir.items],
  );

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

  const toggleSort = (col: AdminExpenseSortCol) => {
    if (adminExpenseSortCol === col) setAdminExpenseSortAsc((p) => !p);
    else {
      setAdminExpenseSortCol(col);
      setAdminExpenseSortAsc(true);
    }
  };

  const arrow = (col: AdminExpenseSortCol) => (adminExpenseSortCol === col ? (adminExpenseSortAsc ? " ▲" : " ▼") : "");
  const getLoginDisplayName = (login: string) => getExpenseLoginDisplayName(loginToFullName, login);
  const statusBadgeMap = getExpenseStatusBadgeMap(isAccountingExpenses);
  const statusLabels = getExpenseStatusLabels(isAccountingExpenses);
  const title = isAccountingSverki
    ? "Бухгалтерия — акты сверок"
    : isAccountingExpenses
      ? `Бухгалтерия — согласованные заявки (${listView.filtered.length})`
      : "Заявки на расходы";

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
    ...editForm,
    ...sverki,
    reloadAllExpenseRequests,
    updateExpenseStatus,
    deleteExpenseRequest,
    checkPnlExpenseCombination,
    statusBadgeMap,
    openPnlExpenseDirectory,
    toggleSort,
    arrow,
    getLoginDisplayName,
    getSupplierLabel,
    filtered: listView.filtered,
    totalAmount: listView.totalAmount,
    depOptions: listView.depOptions,
    catOptions: listView.catOptions,
    vehicleOptions: listView.vehicleOptions,
    employeeOptions: listView.employeeOptions,
    supplierOptions: listView.supplierOptions,
    statusOptions: listView.statusOptions,
    sorted: listView.sorted,
    title,
    statusLabels,
  };
}

export type AdminExpenseRequestsState = ReturnType<typeof useAdminExpenseRequests>;

import React, { useState, useEffect, useCallback } from "react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { Loader2, Copy } from "lucide-react";
import type { ExpenseRequestItem } from "../../../pages/ExpenseRequestsPage";
import { SUBDIVISIONS } from "../../../pnl/constants";
import { formatDisplayDate, formatDisplayDateFromDate } from "../../../lib/dateUtils";
import {
  fetchAdminExpenseRequests,
  patchAdminExpenseRequest,
  deleteAdminExpenseRequest,
  updateAdminExpenseRequest,
} from "../../../api/client/admin/expenseRequests";
import { fetchAdminSverkiRequests, deleteAdminSverkiRequest, updateAdminSverkiRequestStatus } from "../../../api/client/admin/sverki";
import type { useAdminEmployeeDirectory } from "../hooks/useAdminEmployeeDirectory";
import type { AdminExpenseRequestsMode, PnlExpenseCategoryLink, PnlExpensePrefill } from "../types/expenseAccounting";

type EmployeeDir = ReturnType<typeof useAdminEmployeeDirectory>;

export type AdminExpenseRequestsSectionProps = {
  adminToken: string;
  isSuperAdmin: boolean;
  onError: (msg: string | null) => void;
  mode: AdminExpenseRequestsMode;
  employeeDir: EmployeeDir;
  onPnlPrefill: (prefill: PnlExpensePrefill) => void;
  onNavigateToPnl: () => void;
};

export function AdminExpenseRequestsSection({
  adminToken,
  isSuperAdmin,
  onError,
  mode,
  employeeDir,
  onPnlPrefill,
  onNavigateToPnl,
}: AdminExpenseRequestsSectionProps) {
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

  const normalizeMatch = (value: unknown) => String(value ?? "").trim().toLowerCase();
  const resolveSubdivisionId = (departmentLabel: string) => {
    const norm = normalizeMatch(departmentLabel);
    const byLabel = SUBDIVISIONS.find((s) => normalizeMatch(s.label) === norm);
    if (byLabel) return byLabel.id;
    const byId = SUBDIVISIONS.find((s) => normalizeMatch(s.id) === norm);
    return byId?.id || "";
  };
  const hasPnlExpenseCombination = (item: ExpenseRequestItem) => {
    const subdivisionId = resolveSubdivisionId(item.department);
    const subdivision = SUBDIVISIONS.find((s) => s.id === subdivisionId);
    if (!subdivision) return false;
    const reqCategoryId = String(item.categoryId || "").trim();
    const reqCategoryName = normalizeMatch(item.categoryName);
    return pnlExpenseCategoryLinks.some((row) => {
      if (row.department !== subdivision.department) return false;
      if ((row.logisticsStage ?? null) !== (subdivision.logisticsStage ?? null)) return false;
      if (reqCategoryId && row.expenseCategoryId && String(row.expenseCategoryId) === reqCategoryId) return true;
      if (reqCategoryName && normalizeMatch(row.name) === reqCategoryName) return true;
      return false;
    });
  };
  const openPnlExpenseDirectory = (item: ExpenseRequestItem) => {
    const subdivisionId = resolveSubdivisionId(item.department) || "administration";
    onPnlPrefill({
      requestId: item.id,
      expenseCategoryId: item.categoryId || undefined,
      categoryName: item.categoryName || undefined,
      subdivision: subdivisionId,
      type: "OPEX",
    });
    onNavigateToPnl();
  };
  const statusBadge = (s: string) => {
    const map: Record<string, { bg: string; color: string; label: string }> = isAccountingExpenses
      ? {
          draft: { bg: "rgba(245,158,11,0.15)", color: "#f59e0b", label: "Черновик" },
          pending_approval: { bg: "rgba(59,130,246,0.15)", color: "#3b82f6", label: "На согласовании" },
          approved: { bg: "rgba(16,185,129,0.15)", color: "#10b981", label: "В банк" },
          rejected: { bg: "rgba(239,68,68,0.15)", color: "#ef4444", label: "Отклонено" },
          sent: { bg: "rgba(34,197,94,0.15)", color: "#22c55e", label: "Ожидает оплату" },
          paid: { bg: "rgba(139,92,246,0.15)", color: "#8b5cf6", label: "Оплачено" },
        }
      : {
          draft: { bg: "rgba(245,158,11,0.15)", color: "#f59e0b", label: "Черновик" },
          pending_approval: { bg: "rgba(59,130,246,0.15)", color: "#3b82f6", label: "На согласовании" },
          approved: { bg: "rgba(16,185,129,0.15)", color: "#10b981", label: "Согласовано" },
          rejected: { bg: "rgba(239,68,68,0.15)", color: "#ef4444", label: "Отклонено" },
          sent: { bg: "rgba(16,185,129,0.15)", color: "#10b981", label: "Отправлено" },
          paid: { bg: "rgba(139,92,246,0.15)", color: "#8b5cf6", label: "Оплачено" },
        };
    const m = map[s] ?? map.draft;
    return <span style={{ fontSize: "0.7rem", padding: "0.15rem 0.45rem", borderRadius: 999, fontWeight: 600, background: m.bg, color: m.color, whiteSpace: "nowrap" }}>{m.label}</span>;
  };
  const toggleSort = (col: typeof adminExpenseSortCol) => {
    if (adminExpenseSortCol === col) setAdminExpenseSortAsc((p) => !p);
    else { setAdminExpenseSortCol(col); setAdminExpenseSortAsc(true); }
  };
  const arrow = (col: typeof adminExpenseSortCol) => adminExpenseSortCol === col ? (adminExpenseSortAsc ? " ▲" : " ▼") : "";
  const loginToFullName = Object.fromEntries(
    employeeDir.items.map((e) => [e.login.trim().toLowerCase(), e.full_name?.trim() || e.login])
  ) as Record<string, string>;
  const getLoginDisplayName = (login: string) =>
    loginToFullName[login?.trim().toLowerCase() ?? ""] || login || "—";
  const getSupplierLabel = (row: ExpenseRequestItem) => {
    const supplierName = String((row as any).supplierName ?? "").trim();
    const supplierInn = String((row as any).supplierInn ?? "").trim();
    if (supplierName && supplierInn) return `${supplierName}, ИНН ${supplierInn}`;
    if (supplierName) return supplierName;
    if (supplierInn) return `ИНН ${supplierInn}`;
    return "";
  };
  const baseFiltered = isAccountingExpenses ? adminExpenseRequests.filter((r) => r.status === "approved" || r.status === "sent" || r.status === "paid") : adminExpenseRequests;
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
  const title = isAccountingSverki ? "Бухгалтерия — акты сверок" : isAccountingExpenses ? `Бухгалтерия — согласованные заявки (${filtered.length})` : "Заявки на расходы";
  const statusLabels: Record<string, string> = isAccountingExpenses
    ? { draft: "Черновик", pending_approval: "На согласовании", approved: "В банк", rejected: "Отклонено", sent: "Ожидает оплату", paid: "Оплачено" }
    : { draft: "Черновик", pending_approval: "На согласовании", approved: "Согласовано", rejected: "Отклонено", sent: "Отправлено", paid: "Оплачено" };
  return (
    <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
      <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>{title}</Typography.Body>
      {isAccountingSverki && (
        <div style={{ marginBottom: "1rem", border: "1px solid var(--color-border)", borderRadius: 10, padding: "0.75rem" }}>
          <Typography.Body style={{ fontWeight: 600, marginBottom: "0.55rem" }}>Акты сверок — заявки на формирование</Typography.Body>
          {sverkiRequestsLoading ? (
            <Flex align="center" gap="0.5rem" style={{ marginBottom: "0.5rem" }}>
              <Loader2 className="w-4 h-4 animate-spin" />
              <Typography.Body style={{ fontSize: "0.82rem" }}>Загрузка заявок...</Typography.Body>
            </Flex>
          ) : sverkiRequests.length === 0 ? (
            <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>Заявок пока нет</Typography.Body>
          ) : (
            <div style={{ maxHeight: 260, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                <thead>
                  <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Создано</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Логин</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>ИНН</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Договор</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Период</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Статус</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Действие</th>
                  </tr>
                </thead>
                <tbody>
                  {sverkiRequests.map((r) => {
                    const isPending = r.status === "pending";
                    return (
                      <tr key={r.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{formatDisplayDate(r.createdAt)}</td>
                        <td style={{ padding: "6px 8px" }}>{r.login || "—"}</td>
                        <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{r.customerInn || "—"}</td>
                        <td style={{ padding: "6px 8px" }}>{r.contract || "—"}</td>
                        <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                          {formatDisplayDate(r.periodFrom)} - {formatDisplayDate(r.periodTo)}
                        </td>
                        <td style={{ padding: "6px 8px" }}>
                          <span style={{
                            fontSize: "0.7rem",
                            padding: "0.15rem 0.45rem",
                            borderRadius: 999,
                            fontWeight: 600,
                            background: isPending ? "rgba(59,130,246,0.15)" : "rgba(16,185,129,0.15)",
                            color: isPending ? "#3b82f6" : "#10b981",
                            whiteSpace: "nowrap",
                          }}>
                            {isPending ? "Ожидает формирования" : "Отправлена в ЭДО"}
                          </span>
                        </td>
                        <td style={{ padding: "6px 8px" }}>
                          <Flex gap="0.35rem" wrap="wrap">
                            {isPending && (
                              <button
                                type="button"
                                onClick={() => markSverkiRequestAsSent(r.id)}
                                disabled={sverkiRequestsUpdatingId === r.id}
                                style={{ fontSize: "0.68rem", padding: "0.2rem 0.45rem", borderRadius: 6, border: "1px solid #2563eb", background: "transparent", color: "#2563eb", cursor: "pointer" }}
                              >
                                {sverkiRequestsUpdatingId === r.id ? "..." : "Сформировано"}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => deleteSverkiRequest(r.id)}
                              disabled={sverkiRequestsUpdatingId === r.id}
                              style={{ fontSize: "0.68rem", padding: "0.2rem 0.45rem", borderRadius: 6, border: "1px solid #b91c1c", background: "transparent", color: "#b91c1c", cursor: "pointer" }}
                            >
                              Удалить
                            </button>
                          </Flex>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {!isAccountingSverki && (
        <>
      <Flex gap="0.5rem" wrap="wrap" align="center" style={{ marginBottom: "0.75rem" }}>
        <div>
          <label style={{ fontSize: "0.7rem", color: "var(--color-text-secondary)", marginRight: "0.25rem" }}>Дата (период)</label>
          <input type="month" className="admin-form-input" value={expenseFilterDate} onChange={(e) => setExpenseFilterDate(e.target.value)} style={{ padding: "0.3rem 0.5rem", height: 32 }} />
        </div>
        <div>
          <label style={{ fontSize: "0.7rem", color: "var(--color-text-secondary)", marginRight: "0.25rem" }}>Подразделение</label>
          <select className="admin-form-input" value={expenseFilterDepartment} onChange={(e) => setExpenseFilterDepartment(e.target.value)} style={{ padding: "0.3rem 0.5rem", height: 32, minWidth: 140 }}>
            <option value="">Все</option>
            {depOptions.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: "0.7rem", color: "var(--color-text-secondary)", marginRight: "0.25rem" }}>Статья</label>
          <select className="admin-form-input" value={expenseFilterCategory} onChange={(e) => setExpenseFilterCategory(e.target.value)} style={{ padding: "0.3rem 0.5rem", height: 32, minWidth: 140 }}>
            <option value="">Все</option>
            {catOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: "0.7rem", color: "var(--color-text-secondary)", marginRight: "0.25rem" }}>ТС</label>
          <select className="admin-form-input" value={expenseFilterVehicle} onChange={(e) => setExpenseFilterVehicle(e.target.value)} style={{ padding: "0.3rem 0.5rem", height: 32, minWidth: 120 }}>
            <option value="">Все</option>
            {vehicleOptions.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: "0.7rem", color: "var(--color-text-secondary)", marginRight: "0.25rem" }}>Сотрудник</label>
          <select className="admin-form-input" value={expenseFilterEmployee} onChange={(e) => setExpenseFilterEmployee(e.target.value)} style={{ padding: "0.3rem 0.5rem", height: 32, minWidth: 140 }}>
            <option value="">Все</option>
            {employeeOptions.map((emp) => <option key={emp} value={emp}>{emp}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: "0.7rem", color: "var(--color-text-secondary)", marginRight: "0.25rem" }}>Поставщик услуг</label>
          <select className="admin-form-input" value={expenseFilterSupplier} onChange={(e) => setExpenseFilterSupplier(e.target.value)} style={{ padding: "0.3rem 0.5rem", height: 32, minWidth: 180 }}>
            <option value="">Все</option>
            {supplierOptions.map((supplier) => <option key={supplier} value={supplier}>{supplier}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: "0.7rem", color: "var(--color-text-secondary)", marginRight: "0.25rem" }}>Действия</label>
          <select className="admin-form-input" value={expenseFilterStatus} onChange={(e) => setExpenseFilterStatus(e.target.value)} style={{ padding: "0.3rem 0.5rem", height: 32, minWidth: 140 }}>
            <option value="">Все</option>
            {statusOptions.map((s) => <option key={s} value={s}>{statusLabels[s] ?? s}</option>)}
          </select>
        </div>
      </Flex>

      <div style={{ marginBottom: "0.75rem", padding: "0.5rem 0.75rem", background: "var(--color-bg-hover)", borderRadius: 8, fontSize: "0.9rem", fontWeight: 600 }}>
        Итого: {totalAmount.toLocaleString("ru-RU")} ₽
      </div>

      {filtered.length === 0 ? (
        <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>Нет заявок</Typography.Body>
      ) : (
        <div style={{ maxHeight: 600, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
            <thead>
              <tr style={{ position: "sticky", top: 0, background: "var(--color-bg-card, #fff)", zIndex: 1 }}>
                {([
                  ["createdAt", "Создано"],
                  ["docNumber", "№ док."],
                  ["docDate", "Дата док."],
                  ["period", "Период"],
                  ["login", "ФИО"],
                  ["department", "Подразделение"],
                  ["categoryName", "Статья"],
                  ["amount", "Сумма"],
                  ["status", "Статус"],
                ] as [typeof adminExpenseSortCol, string][]).map(([col, label]) => (
                  <th key={col} onClick={() => toggleSort(col)} style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--color-border)", cursor: "pointer", whiteSpace: "nowrap", userSelect: "none" }}>{label}{arrow(col)}</th>
                ))}
                <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--color-border)" }}>Комментарий</th>
                <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--color-border)" }}>ТС</th>
                <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--color-border)" }}>Сотрудник</th>
                <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--color-border)" }}>Поставщик услуг</th>
                <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--color-border)" }}>Вложения</th>
                <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--color-border)" }}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr
                  key={r.id}
                  style={{ borderBottom: "1px solid var(--color-border)", cursor: "pointer" }}
                  onClick={() => setExpenseViewId(r.id)}
                >
                  <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{formatDisplayDate(r.createdAt)}</td>
                  <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{(r as any).docNumber || "—"}</td>
                  <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                    {(() => {
                      const raw = String((r as any).docDate ?? "").trim();
                      if (!raw) return "—";
                      const normalized = /^\d{4}-\d{2}$/.test(raw) ? `${raw}-01` : raw;
                      const parsed = new Date(`${normalized}T00:00:00`);
                      if (Number.isNaN(parsed.getTime())) return "—";
                      return formatDisplayDateFromDate(parsed);
                    })()}
                  </td>
                  <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{(r as any).period || "—"}</td>
                  <td style={{ padding: "6px 8px" }}>{getLoginDisplayName(r.login)}</td>
                  <td style={{ padding: "6px 8px" }}>{r.department}</td>
                  <td style={{ padding: "6px 8px" }}>{r.categoryName}</td>
                  <td style={{ padding: "6px 8px", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{`${r.amount.toLocaleString("ru-RU")}\u00A0₽`}{(r as any).vatRate ? ` (${(r as any).vatRate}%)` : ""}</td>
                  <td style={{ padding: "6px 8px" }}>{statusBadge(r.status)}</td>
                  <td style={{ padding: "6px 8px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.comment || "—"}
                    {(r as any).rejectionReason && <div style={{ fontSize: "0.68rem", color: "#ef4444" }}>Причина: {(r as any).rejectionReason}</div>}
                  </td>
                  <td style={{ padding: "6px 8px" }}>{r.vehicleOrEmployee || "—"}</td>
                  <td style={{ padding: "6px 8px" }}>{(r as any).employeeName || "—"}</td>
                  <td style={{ padding: "6px 8px" }}>
                    {(() => {
                      const sn = (r as any).supplierName;
                      const inn = (r as any).supplierInn;
                      return sn || inn ? [sn, inn ? `ИНН ${inn}` : ""].filter(Boolean).join(", ") : "—";
                    })()}
                  </td>
                  <td style={{ padding: "6px 8px", fontSize: "0.7rem" }} onClick={(e) => e.stopPropagation()}>
                    {(r as any).attachments?.length
                      ? (r as any).attachments.map((att: { id?: number; fileName?: string; name?: string; dataUrl?: string }, i: number) => (
                          <React.Fragment key={att.id ?? att.fileName ?? att.name ?? i}>
                            {i > 0 && ", "}
                            <button
                              type="button"
                              onClick={async (ev) => {
                                ev.stopPropagation();
                                if (att.dataUrl) {
                                  const a = document.createElement("a");
                                  a.href = att.dataUrl;
                                  a.download = att.name ?? att.fileName ?? "file";
                                  a.click();
                                } else if (att.id != null && adminToken) {
                                  try {
                                    const res = await fetch(
                                      `/api/admin-expense-attachment?requestUid=${encodeURIComponent(r.id)}&attachmentId=${att.id}`,
                                      { headers: { Authorization: `Bearer ${adminToken}` } }
                                    );
                                    if (!res.ok) return;
                                    const blob = await res.blob();
                                    const url = URL.createObjectURL(blob);
                                    window.open(url, "_blank", "noopener");
                                    setTimeout(() => URL.revokeObjectURL(url), 60000);
                                  } catch { /* ignore */ }
                                }
                              }}
                              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--color-primary-blue, #2563eb)", textDecoration: "underline", fontSize: "inherit" }}
                            >
                              {att.fileName ?? att.name ?? "файл"}
                            </button>
                          </React.Fragment>
                        ))
                      : r.attachmentNames.length > 0
                        ? r.attachmentNames.join(", ")
                        : "—"}
                  </td>
                  <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                    <Flex gap="0.25rem" wrap="wrap">
                      {!hasPnlExpenseCombination(r) && (
                        <button
                          type="button"
                          onClick={() => openPnlExpenseDirectory(r)}
                          style={{ fontSize: "0.68rem", padding: "0.2rem 0.45rem", borderRadius: 6, border: "1px solid #f97316", background: "rgba(249,115,22,0.12)", color: "#c2410c", cursor: "pointer", fontWeight: 600 }}
                        >
                          Добавить в PnL
                        </button>
                      )}
                      {!isAccounting && r.status !== "approved" && r.status !== "rejected" && r.status !== "paid" && (
                        <button type="button" onClick={() => updateExpenseStatus(r.id, (r as any).login ?? "", "approved", undefined, r)} style={{ fontSize: "0.68rem", padding: "0.2rem 0.45rem", borderRadius: 6, border: "1px solid #10b981", background: "transparent", color: "#10b981", cursor: "pointer" }}>Согласовать</button>
                      )}
                      {!isAccounting && r.status !== "approved" && r.status !== "rejected" && r.status !== "paid" && (
                        <button type="button" onClick={() => { setExpenseRejectId(r.id); setExpenseRejectComment(""); }} style={{ fontSize: "0.68rem", padding: "0.2rem 0.45rem", borderRadius: 6, border: "1px solid #ef4444", background: "transparent", color: "#ef4444", cursor: "pointer" }}>Отказать</button>
                      )}
                      {isAccounting && r.status === "approved" && (
                        <button type="button" onClick={() => updateExpenseStatus(r.id, r.login, "sent", undefined, r)} style={{ fontSize: "0.68rem", padding: "0.2rem 0.45rem", borderRadius: 6, border: "1px solid #2563eb", background: "transparent", color: "#2563eb", cursor: "pointer" }}>Ожидает оплату</button>
                      )}
                      {isAccounting && (r.status === "approved" || r.status === "sent") && (
                        <button type="button" onClick={() => updateExpenseStatus(r.id, r.login, "paid", undefined, r)} style={{ fontSize: "0.68rem", padding: "0.2rem 0.45rem", borderRadius: 6, border: "1px solid #8b5cf6", background: "transparent", color: "#8b5cf6", cursor: "pointer" }}>Оплачено</button>
                      )}
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const supplierName = (r as any).supplierName || "";
                            const supplierInn = (r as any).supplierInn || "";
                            const supplier = supplierName || supplierInn
                              ? [supplierName, supplierInn ? `ИНН ${supplierInn}` : ""].filter(Boolean).join(", ")
                              : "—";
                            const text = [
                              `№ док.: ${(r as any).docNumber || "—"}`,
                              `Дата док.: ${(r as any).docDate || "—"}`,
                              `Период: ${(r as any).period || "—"}`,
                              `ФИО: ${getLoginDisplayName(r.login)}`,
                              `Подразделение: ${r.department || "—"}`,
                              `Статья: ${r.categoryName || "—"}`,
                              `Сумма: ${r.amount.toLocaleString("ru-RU")} ₽${(r as any).vatRate ? ` (НДС ${(r as any).vatRate}%)` : ""}`,
                              `Комментарий: ${r.comment || "—"}`,
                              `ТС: ${r.vehicleOrEmployee || "—"}`,
                              `Сотрудник: ${(r as any).employeeName || "—"}`,
                              `Поставщик услуг: ${supplier}`,
                            ].join("\n");
                            await navigator.clipboard?.writeText(text);
                          } catch {
                            onError("Не удалось скопировать заявку");
                          }
                        }}
                        style={{ fontSize: "0.68rem", padding: "0.2rem 0.45rem", borderRadius: 6, border: "1px solid var(--color-border)", background: "transparent", color: "inherit", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.2rem" }}
                        title="Копировать данные заявки"
                        aria-label="Копировать данные заявки"
                      >
                        <Copy size={12} />
                        Копировать
                      </button>
                      <button type="button" onClick={() => { setExpenseEditId(r.id); setExpenseEditDocNumber((r as any).docNumber ?? ""); setExpenseEditDocDate((r as any).docDate ?? ""); setExpenseEditPeriod((r as any).period ?? ""); setExpenseEditDepartment(r.department); setExpenseEditCategory(r.categoryId); setExpenseEditAmount(String(r.amount)); setExpenseEditVatRate((r as any).vatRate ?? ""); setExpenseEditComment(r.comment); setExpenseEditVehicle(r.vehicleOrEmployee); setExpenseEditTransportType((r as any).transportType === "ferry" ? "ferry" : "auto"); setExpenseEditEmployee((r as any).employeeName ?? ""); setExpenseEditSupplierName((r as any).supplierName ?? ""); setExpenseEditSupplierInn((r as any).supplierInn ?? ""); }} style={{ fontSize: "0.68rem", padding: "0.2rem 0.45rem", borderRadius: 6, border: "1px solid var(--color-border)", background: "transparent", color: "inherit", cursor: "pointer" }}>Изменить</button>
                      <button type="button" onClick={() => { if (window.confirm("Удалить заявку? Действие нельзя отменить.")) deleteExpenseRequest(r.id, r.login); }} style={{ fontSize: "0.68rem", padding: "0.2rem 0.45rem", borderRadius: 6, border: "1px solid #ef4444", background: "transparent", color: "#ef4444", cursor: "pointer" }}>Удалить</button>
                    </Flex>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
        </>
      )}

      {/* View modal */}
      {expenseViewId && (() => {
        const item = adminExpenseRequests.find((r) => r.id === expenseViewId);
        if (!item) return null;
        const atts = (item as any).attachments ?? [];
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setExpenseViewId(null)}>
            <div style={{ background: "var(--color-bg-card, #fff)", borderRadius: 12, padding: "1.25rem", maxWidth: 520, width: "92%", maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
              <Typography.Body style={{ fontWeight: 600, marginBottom: "0.75rem" }}>
                Заявка {(item as any).docNumber || item.id.slice(-8)}
              </Typography.Body>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem", marginBottom: "0.75rem" }}>
                <div><span style={{ color: "var(--color-text-secondary)" }}>Создано:</span> {formatDisplayDate(item.createdAt)}</div>
                <div><span style={{ color: "var(--color-text-secondary)" }}>№ док.:</span> {(item as any).docNumber || "—"}</div>
                <div><span style={{ color: "var(--color-text-secondary)" }}>Дата док.:</span> {(item as any).docDate || "—"}</div>
                <div><span style={{ color: "var(--color-text-secondary)" }}>Период:</span> {(item as any).period || "—"}</div>
                <div><span style={{ color: "var(--color-text-secondary)" }}>ФИО:</span> {getLoginDisplayName(item.login)}</div>
                <div><span style={{ color: "var(--color-text-secondary)" }}>Подразделение:</span> {item.department || "—"}</div>
                <div><span style={{ color: "var(--color-text-secondary)" }}>Статья:</span> {item.categoryName || "—"}</div>
                <div><span style={{ color: "var(--color-text-secondary)" }}>Сумма:</span> {item.amount.toLocaleString("ru-RU")} ₽</div>
                <div><span style={{ color: "var(--color-text-secondary)" }}>Статус:</span> {statusBadge(item.status)}</div>
                <div><span style={{ color: "var(--color-text-secondary)" }}>Комментарий:</span> {item.comment || "—"}</div>
                <div><span style={{ color: "var(--color-text-secondary)" }}>ТС:</span> {item.vehicleOrEmployee || "—"}</div>
                <div><span style={{ color: "var(--color-text-secondary)" }}>Сотрудник:</span> {(item as any).employeeName || "—"}</div>
                <div><span style={{ color: "var(--color-text-secondary)" }}>Поставщик услуг:</span> {(() => {
                  const sn = (item as any).supplierName;
                  const inn = (item as any).supplierInn;
                  return sn || inn ? [sn, inn ? `ИНН ${inn}` : ""].filter(Boolean).join(", ") : "—";
                })()}</div>
                <div>
                  <Typography.Body style={{ fontWeight: 600, fontSize: "0.82rem", marginBottom: "0.25rem", display: "block" }}>Прикреплённые документы</Typography.Body>
                  {atts.length > 0 ? (
                    atts.map((att: { id: number; fileName: string }) => (
                      <div key={att.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.35rem", flexWrap: "wrap" }}>
                        <Typography.Body style={{ fontSize: "0.82rem", minWidth: 0, flex: "1 1 200px" }}>{att.fileName}</Typography.Body>
                        <Flex gap="0.25rem">
                          <button
                            type="button"
                            className="filter-button"
                            style={{ fontSize: "0.72rem", padding: "0.2rem 0.5rem" }}
                            onClick={async () => {
                              if (!adminToken) return;
                              try {
                                const res = await fetch(
                                  `/api/admin-expense-attachment?requestUid=${encodeURIComponent(item.id)}&attachmentId=${att.id}`,
                                  { headers: { Authorization: `Bearer ${adminToken}` } }
                                );
                                if (!res.ok) return;
                                const blob = await res.blob();
                                const url = URL.createObjectURL(blob);
                                window.open(url, "_blank", "noopener");
                                setTimeout(() => URL.revokeObjectURL(url), 60000);
                              } catch { /* ignore */ }
                            }}
                          >
                            Открыть
                          </button>
                          <button
                            type="button"
                            className="filter-button"
                            style={{ fontSize: "0.72rem", padding: "0.2rem 0.5rem" }}
                            onClick={async () => {
                              if (!adminToken) return;
                              try {
                                const res = await fetch(
                                  `/api/admin-expense-attachment?requestUid=${encodeURIComponent(item.id)}&attachmentId=${att.id}`,
                                  { headers: { Authorization: `Bearer ${adminToken}` } }
                                );
                                if (!res.ok) return;
                                const blob = await res.blob();
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement("a");
                                a.href = url;
                                a.download = att.fileName || "файл";
                                a.click();
                                setTimeout(() => URL.revokeObjectURL(url), 5000);
                              } catch { /* ignore */ }
                            }}
                          >
                            Скачать
                          </button>
                        </Flex>
                      </div>
                    ))
                  ) : (
                    <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>
                      Нет. Вложения сохраняются в БД при отправке заявки «На согласование» из мини-приложения. Заявки, созданные до обновления, могли не содержать файлов.
                    </Typography.Body>
                  )}
                </div>
              </div>
              <Flex gap="0.5rem" justify="flex-end">
                <Button type="button" className="filter-button" onClick={() => setExpenseViewId(null)}>Закрыть</Button>
                <Button type="button" className="filter-button" onClick={() => { setExpenseViewId(null); setExpenseEditId(item.id); setExpenseEditDocNumber((item as any).docNumber ?? ""); setExpenseEditDocDate((item as any).docDate ?? ""); setExpenseEditPeriod((item as any).period ?? ""); setExpenseEditDepartment(item.department); setExpenseEditCategory(item.categoryId); setExpenseEditAmount(String(item.amount)); setExpenseEditVatRate((item as any).vatRate ?? ""); setExpenseEditComment(item.comment); setExpenseEditVehicle(item.vehicleOrEmployee); setExpenseEditTransportType((item as any).transportType === "ferry" ? "ferry" : "auto"); setExpenseEditEmployee((item as any).employeeName ?? ""); setExpenseEditSupplierName((item as any).supplierName ?? ""); setExpenseEditSupplierInn((item as any).supplierInn ?? ""); }}>Изменить</Button>
              </Flex>
            </div>
          </div>
        );
      })()}

      {/* Reject modal */}
      {expenseRejectId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setExpenseRejectId(null)}>
          <div style={{ background: "var(--color-bg-card, #fff)", borderRadius: 12, padding: "1.25rem", maxWidth: 400, width: "90%" }} onClick={(e) => e.stopPropagation()}>
            <Typography.Body style={{ fontWeight: 600, marginBottom: "0.75rem" }}>Отказать в заявке</Typography.Body>
            <textarea
              placeholder="Причина отказа (обязательно)"
              value={expenseRejectComment}
              onChange={(e) => setExpenseRejectComment(e.target.value)}
              className="admin-form-input"
              style={{ width: "100%", minHeight: 80, resize: "vertical", marginBottom: "0.75rem" }}
              rows={3}
              autoFocus
            />
            <Flex gap="0.5rem" justify="flex-end">
              <Button type="button" className="filter-button" onClick={() => setExpenseRejectId(null)}>Отмена</Button>
              <Button type="button" className="filter-button" style={{ background: "#ef4444", color: "white" }} disabled={!expenseRejectComment.trim()} onClick={() => {
                const item = adminExpenseRequests.find((r) => r.id === expenseRejectId);
                if (item) updateExpenseStatus(item.id, item.login, "rejected", expenseRejectComment.trim(), item);
                setExpenseRejectId(null);
              }}>Отказать</Button>
            </Flex>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {expenseEditId && (() => {
        const item = adminExpenseRequests.find((r) => r.id === expenseEditId);
        if (!item) return null;
        const fieldLabel = { fontSize: "0.72rem", color: "var(--color-text-secondary)", display: "block" as const, marginBottom: "0.15rem" };
        const fieldInput = { width: "100%", padding: "0.45rem", height: 36, boxSizing: "border-box" as const };
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setExpenseEditId(null)}>
            <div style={{ background: "var(--color-bg-card, #fff)", borderRadius: 12, padding: "1.25rem", maxWidth: 520, width: "92%", maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
              <Typography.Body style={{ fontWeight: 600, marginBottom: "0.75rem" }}>Изменить заявку #{expenseEditDocNumber || item.id.slice(-6)}</Typography.Body>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem", marginBottom: "0.75rem" }}>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 40%", minWidth: 120 }}>
                    <label style={fieldLabel}>№ документа</label>
                    <input type="text" className="admin-form-input" value={expenseEditDocNumber} onChange={(e) => setExpenseEditDocNumber(e.target.value)} style={fieldInput} />
                  </div>
                  <div style={{ flex: "1 1 28%", minWidth: 110 }}>
                    <label style={fieldLabel}>Дата документа</label>
                    <input type="date" className="admin-form-input" value={expenseEditDocDate} onChange={(e) => setExpenseEditDocDate(e.target.value)} style={fieldInput} />
                  </div>
                  <div style={{ flex: "1 1 28%", minWidth: 110 }}>
                    <label style={fieldLabel}>Период</label>
                    <input type="month" className="admin-form-input" value={expenseEditPeriod} onChange={(e) => setExpenseEditPeriod(e.target.value)} style={fieldInput} />
                  </div>
                </div>
                <div>
                  <label style={fieldLabel}>Подразделение</label>
                  <select
                    className="admin-form-input"
                    value={expenseEditDepartment}
                    onChange={(e) => setExpenseEditDepartment(e.target.value)}
                    style={{ ...fieldInput, height: 36 }}
                  >
                    {(() => {
                      const opts = [...depOptions];
                      if (expenseEditDepartment && !opts.includes(expenseEditDepartment)) opts.unshift(expenseEditDepartment);
                      if (!expenseEditDepartment && opts.length === 0) opts.push("—");
                      return opts.map((dep) => <option key={dep} value={dep}>{dep}</option>);
                    })()}
                  </select>
                </div>
                <div>
                  <label style={fieldLabel}>Статья расхода</label>
                  <select className="admin-form-input" value={expenseEditCategory} onChange={(e) => setExpenseEditCategory(e.target.value)} style={{ ...fieldInput, height: 36 }}>
                    {(() => {
                      const options = [...expenseCategories];
                      if (options.length === 0) {
                        options.push({ id: "", name: "Нет статей для подразделения" });
                      }
                      return options.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ));
                    })()}
                  </select>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 55%", minWidth: 120 }}>
                    <label style={fieldLabel}>Сумма (₽)</label>
                    <input type="text" inputMode="decimal" className="admin-form-input" value={expenseEditAmount} onChange={(e) => setExpenseEditAmount(e.target.value)} style={fieldInput} />
                  </div>
                  <div style={{ flex: "1 1 40%", minWidth: 100 }}>
                    <label style={fieldLabel}>НДС</label>
                    <select className="admin-form-input" value={expenseEditVatRate} onChange={(e) => setExpenseEditVatRate(e.target.value)} style={{ ...fieldInput, height: 36 }}>
                      <option value="">Без НДС</option>
                      <option value="0">0%</option>
                      <option value="5">5%</option>
                      <option value="7">7%</option>
                      <option value="10">10%</option>
                      <option value="20">20%</option>
                      <option value="22">22%</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label style={fieldLabel}>Тип ТС</label>
                  <select
                    className="admin-form-input"
                    value={expenseEditTransportType}
                    onChange={(e) => setExpenseEditTransportType(e.target.value === "ferry" ? "ferry" : "auto")}
                    style={{ ...fieldInput, height: 36 }}
                  >
                    <option value="auto">Авто</option>
                    <option value="ferry">Паром</option>
                  </select>
                </div>
                <div>
                  <label style={fieldLabel}>Транспортное средство</label>
                  <input
                    list="expense-edit-vehicle-list"
                    type="text"
                    className="admin-form-input"
                    value={expenseEditVehicle}
                    onChange={(e) => setExpenseEditVehicle(e.target.value)}
                    style={fieldInput}
                    placeholder="Выберите или введите номер / модель ТС"
                  />
                  <datalist id="expense-edit-vehicle-list">
                    {[...new Set(adminExpenseRequests.map((r) => (r as any).vehicleOrEmployee).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "ru")).map((v) => (
                      <option key={v} value={v} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label style={fieldLabel}>Сотрудник</label>
                  <select
                    className="admin-form-input"
                    value={expenseEditEmployee}
                    onChange={(e) => setExpenseEditEmployee(e.target.value)}
                    style={{ ...fieldInput, height: 36 }}
                  >
                    <option value="">—</option>
                    {(() => {
                      const names = employeeDir.items.map((e) => e.full_name || e.login).filter(Boolean);
                      const uniq = [...new Set(names)];
                      const opts = [...uniq];
                      if (expenseEditEmployee && !opts.includes(expenseEditEmployee)) opts.unshift(expenseEditEmployee);
                      return opts.map((n) => <option key={n} value={n}>{n}</option>);
                    })()}
                  </select>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 180px", minWidth: 0 }}>
                    <label style={fieldLabel}>Поставщик услуг (название)</label>
                    <input type="text" className="admin-form-input" value={expenseEditSupplierName} onChange={(e) => setExpenseEditSupplierName(e.target.value)} style={fieldInput} placeholder="Название поставщика" />
                  </div>
                  <div style={{ flex: "0 1 140px", minWidth: 100 }}>
                    <label style={fieldLabel}>ИНН поставщика</label>
                    <input type="text" className="admin-form-input" value={expenseEditSupplierInn} onChange={(e) => setExpenseEditSupplierInn(e.target.value)} style={fieldInput} placeholder="ИНН" />
                  </div>
                </div>
                <div>
                  <label style={fieldLabel}>Комментарий</label>
                  <textarea value={expenseEditComment} onChange={(e) => setExpenseEditComment(e.target.value)} className="admin-form-input" style={{ width: "100%", minHeight: 60, resize: "vertical" }} rows={2} />
                </div>
              </div>
              <Flex gap="0.5rem" justify="flex-end">
                <Button type="button" className="filter-button" onClick={() => setExpenseEditId(null)}>Отмена</Button>
                <Button type="button" className="filter-button" style={{ background: "var(--color-primary-blue)", color: "white" }} onClick={() => saveExpenseEdit(item.id, item.login)} disabled={!expenseEditCategory}>Сохранить</Button>
              </Flex>
            </div>
          </div>
        );
      })()}
    </Panel>
  );
}

import { useCallback, useMemo, useState } from "react";
import {
  fetchAdminEmployeeDirectory,
  fetchAdminEmployeeRateHistory,
} from "../../../api/client/admin/employees";
import { fetchPnlSubdivisions } from "../../../api/client/admin/pnl";
import {
  calcMonthlyByRate,
  type AccrualType,
  type CooperationType,
  type EmployeeDirectoryRow,
  type EmployeeRateHistoryRow,
} from "../types/adminUsers";

type UseAdminEmployeeDirectoryOptions = {
  onLogout?: (reason?: "expired") => void;
  onError?: (msg: string | null) => void;
};

export function useAdminEmployeeDirectory(
  adminToken: string,
  isSuperAdmin: boolean,
  options: UseAdminEmployeeDirectoryOptions = {}
) {
  const { onLogout, onError } = options;
  const onLogoutRef = useCallback(
    (reason?: "expired") => onLogout?.(reason),
    [onLogout]
  );

  const [items, setItems] = useState<EmployeeDirectoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [department, setDepartment] = useState<string>("");
  const [departmentList, setDepartmentList] = useState<string[]>([]);
  const [primaryDepartment, setPrimaryDepartment] = useState<string>("");
  const [position, setPosition] = useState("");
  const [accrualType, setAccrualType] = useState<AccrualType>("hour");
  const [accrualRate, setAccrualRate] = useState("0");
  const [cooperationType, setCooperationType] = useState<CooperationType>("staff");
  const [role, setRole] = useState<"employee" | "department_head">("employee");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editDepartment, setEditDepartment] = useState<string>("");
  const [editDepartments, setEditDepartments] = useState<string[]>([]);
  const [editPrimaryDepartment, setEditPrimaryDepartment] = useState<string>("");
  const [editPosition, setEditPosition] = useState("");
  const [editAccrualType, setEditAccrualType] = useState<AccrualType>("hour");
  const [editAccrualRate, setEditAccrualRate] = useState("0");
  const [editCooperationType, setEditCooperationType] = useState<CooperationType>("staff");
  const [editRole, setEditRole] = useState<"employee" | "department_head">("employee");
  const [editRateEffectiveFrom, setEditRateEffectiveFrom] = useState("");
  const [rateHistory, setRateHistory] = useState<EmployeeRateHistoryRow[]>([]);
  const [historyEditingId, setHistoryEditingId] = useState<number | null>(null);
  const [historyEditDate, setHistoryEditDate] = useState("");
  const [historyEditRate, setHistoryEditRate] = useState("");
  const [historySaving, setHistorySaving] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  const monthlyEstimate = useMemo(
    () => calcMonthlyByRate(accrualRate, accrualType),
    [accrualRate, accrualType]
  );
  const editMonthlyEstimate = useMemo(
    () => calcMonthlyByRate(editAccrualRate, editAccrualType),
    [editAccrualRate, editAccrualType]
  );

  const loadRateHistory = useCallback(
    async (employeeId: number) => {
      if (!adminToken || !isSuperAdmin) return;
      try {
        setRateHistory(await fetchAdminEmployeeRateHistory(adminToken, employeeId));
      } catch {
        setRateHistory([]);
      }
    },
    [adminToken, isSuperAdmin]
  );

  const fetch = useCallback(
    async (monthForTimesheet?: string) => {
      if (!adminToken || !isSuperAdmin) return;
      setLoading(true);
      try {
        setItems(await fetchAdminEmployeeDirectory(adminToken, { month: monthForTimesheet }));
      } catch (e: unknown) {
        if ((e as Error & { status?: number })?.status === 401) {
          onLogoutRef("expired");
          return;
        }
        onError?.((e as Error)?.message || "Ошибка загрузки справочника сотрудников");
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [adminToken, isSuperAdmin, onLogoutRef, onError]
  );

  const fetchDepartments = useCallback(async () => {
    try {
      const names = await fetchPnlSubdivisions();
      setDepartments(names);
      setDepartment((prev) => {
        if (prev && names.includes(prev)) return prev;
        return names[0] ?? "";
      });
    } catch {
      setDepartments([]);
    }
  }, []);

  return {
    items,
    setItems,
    loading,
    departments,
    fetch,
    fetchDepartments,
    loadRateHistory,
    email,
    setEmail,
    fullName,
    setFullName,
    department,
    setDepartment,
    departmentList,
    setDepartmentList,
    primaryDepartment,
    setPrimaryDepartment,
    position,
    setPosition,
    accrualType,
    setAccrualType,
    accrualRate,
    setAccrualRate,
    cooperationType,
    setCooperationType,
    role,
    setRole,
    saving,
    setSaving,
    editingId,
    setEditingId,
    editFullName,
    setEditFullName,
    editDepartment,
    setEditDepartment,
    editDepartments,
    setEditDepartments,
    editPrimaryDepartment,
    setEditPrimaryDepartment,
    editPosition,
    setEditPosition,
    editAccrualType,
    setEditAccrualType,
    editAccrualRate,
    setEditAccrualRate,
    editCooperationType,
    setEditCooperationType,
    editRole,
    setEditRole,
    editRateEffectiveFrom,
    setEditRateEffectiveFrom,
    rateHistory,
    setRateHistory,
    historyEditingId,
    setHistoryEditingId,
    historyEditDate,
    setHistoryEditDate,
    historyEditRate,
    setHistoryEditRate,
    historySaving,
    setHistorySaving,
    editSaving,
    setEditSaving,
    monthlyEstimate,
    editMonthlyEstimate,
  };
}

export type UseAdminEmployeeDirectoryReturn = ReturnType<typeof useAdminEmployeeDirectory>;

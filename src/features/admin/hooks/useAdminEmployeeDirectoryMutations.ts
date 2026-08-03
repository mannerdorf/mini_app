import { useCallback } from "react";
import {
  createAdminEmployee,
  deleteAdminEmployee,
  deleteAdminEmployeeRateHistory,
  patchAdminEmployee,
  patchAdminEmployeeRateHistory,
} from "../../../api/client/admin/employees";
import type { EmployeeRateHistoryRow } from "../types/adminUsers";
import { todayIsoDateMoscow } from "../types/adminUsers";
import { formatEmployeeDepartment, fillEmployeeEditFields } from "../lib/adminEmployeeDirectoryHelpers";
import type { UseAdminEmployeeDirectoryReturn } from "./useAdminEmployeeDirectory";

export type UseAdminEmployeeDirectoryMutationsParams = {
  adminToken: string;
  onError: (msg: string | null) => void;
  employeeDir: UseAdminEmployeeDirectoryReturn;
};

export function useAdminEmployeeDirectoryMutations({
  adminToken,
  onError,
  employeeDir,
}: UseAdminEmployeeDirectoryMutationsParams) {
  const {
    items,
    setItems,
    fetch: fetchEmployeeDirectory,
    loadRateHistory: loadEmployeeRateHistory,
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
    accrualRate,
    cooperationType,
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
    editAccrualRate,
    editCooperationType,
    editRole,
    editRateEffectiveFrom,
    setEditRateEffectiveFrom,
    setRateHistory,
    historyEditingId,
    setHistoryEditingId,
    historyEditDate,
    historyEditRate,
    historySaving,
    setHistorySaving,
    editSaving,
    setEditSaving,
    departments: employeeDepartments,
    setAccrualType,
    setAccrualRate,
    setCooperationType,
    setEditAccrualType,
    setEditAccrualRate,
    setEditCooperationType,
    setEditRole,
    setHistoryEditDate,
    setHistoryEditRate,
  } = employeeDir;

  const openEmployeeEditor = useCallback(
    (emp: (typeof items)[number]) => {
      fillEmployeeEditFields(emp, employeeDepartments, {
        setEditingId,
        setEditFullName,
        setEditDepartment,
        setEditDepartments,
        setEditPrimaryDepartment,
        setEditPosition,
        setEditCooperationType,
        setEditAccrualType,
        setEditAccrualRate,
        setEditRateEffectiveFrom,
        setHistoryEditingId,
        setEditRole,
      });
      void loadEmployeeRateHistory(emp.id);
    },
    [
      employeeDepartments,
      loadEmployeeRateHistory,
      setEditAccrualRate,
      setEditAccrualType,
      setEditCooperationType,
      setEditDepartment,
      setEditDepartments,
      setEditFullName,
      setEditPosition,
      setEditPrimaryDepartment,
      setEditRateEffectiveFrom,
      setEditRole,
      setEditingId,
      setHistoryEditingId,
    ],
  );

  const closeEmployeeEditor = useCallback(() => {
    setEditingId(null);
    setRateHistory([]);
    setHistoryEditingId(null);
  }, [setEditingId, setHistoryEditingId, setRateHistory]);

  const createEmployee = useCallback(async () => {
    setSaving(true);
    onError(null);
    try {
      const departmentValue = formatEmployeeDepartment(role, primaryDepartment, departmentList, department);
      await createAdminEmployee(adminToken, {
        email: email.trim() ? email.trim().toLowerCase() : "",
        full_name: fullName.trim(),
        department: departmentValue,
        position: position.trim(),
        cooperation_type: cooperationType,
        accrual_type: accrualType,
        accrual_rate: Number(accrualRate),
        employee_role: role,
      });
      setEmail("");
      setFullName("");
      setDepartment("");
      setDepartmentList([]);
      setPrimaryDepartment("");
      setPosition("");
      setCooperationType("staff");
      setAccrualType("hour");
      setAccrualRate("0");
      await fetchEmployeeDirectory();
    } catch (e: unknown) {
      onError((e as Error)?.message || "Ошибка сохранения атрибутов сотрудника");
    } finally {
      setSaving(false);
    }
  }, [
    accrualRate,
    accrualType,
    adminToken,
    cooperationType,
    department,
    departmentList,
    email,
    fetchEmployeeDirectory,
    fullName,
    onError,
    position,
    primaryDepartment,
    role,
    setAccrualRate,
    setAccrualType,
    setCooperationType,
    setDepartment,
    setDepartmentList,
    setEmail,
    setFullName,
    setPosition,
    setPrimaryDepartment,
    setSaving,
  ]);

  const toggleEmployeeActive = useCallback(
    async (emp: (typeof items)[number]) => {
      try {
        await patchAdminEmployee(adminToken, emp.id, { active: !emp.active });
        setItems((prev) => prev.map((x) => (x.id === emp.id ? { ...x, active: !x.active } : x)));
      } catch (e: unknown) {
        onError((e as Error)?.message || "Ошибка обновления");
      }
    },
    [adminToken, onError, setItems],
  );

  const removeEmployee = useCallback(
    async (empId: number) => {
      try {
        await deleteAdminEmployee(adminToken, empId);
        setItems((prev) => prev.filter((x) => x.id !== empId));
      } catch (e: unknown) {
        onError((e as Error)?.message || "Ошибка удаления");
      }
    },
    [adminToken, onError, setItems],
  );

  const saveEmployeeEdit = useCallback(
    async (empId: number) => {
      setEditSaving(true);
      onError(null);
      try {
        const departmentValue = formatEmployeeDepartment(
          editRole,
          editPrimaryDepartment,
          editDepartments,
          editDepartment,
        );
        const data = await patchAdminEmployee(adminToken, empId, {
          full_name: editFullName.trim(),
          department: departmentValue,
          position: editPosition.trim(),
          cooperation_type: editCooperationType,
          accrual_type: editAccrualType,
          accrual_rate: Number(editAccrualRate),
          accrual_rate_effective_from: editRateEffectiveFrom || todayIsoDateMoscow(),
          employee_role: editRole,
        });
        const savedRate =
          typeof data?.accrual_rate === "number" && Number.isFinite(data.accrual_rate)
            ? data.accrual_rate
            : Number(editAccrualRate);
        setItems((prev) =>
          prev.map((x) =>
            x.id === empId
              ? {
                  ...x,
                  full_name: editFullName.trim(),
                  department: departmentValue,
                  position: editPosition.trim(),
                  cooperation_type: editCooperationType,
                  accrual_type: editAccrualType,
                  accrual_rate: savedRate,
                  employee_role: editRole,
                }
              : x,
          ),
        );
        closeEmployeeEditor();
      } catch (e: unknown) {
        onError((e as Error)?.message || "Ошибка сохранения атрибутов");
      } finally {
        setEditSaving(false);
      }
    },
    [
      adminToken,
      closeEmployeeEditor,
      editAccrualRate,
      editAccrualType,
      editCooperationType,
      editDepartment,
      editDepartments,
      editFullName,
      editPosition,
      editPrimaryDepartment,
      editRateEffectiveFrom,
      editRole,
      onError,
      setEditSaving,
      setItems,
    ],
  );

  const saveRateHistoryEntry = useCallback(
    async (historyId: number, employeeId: number, fallbackDate: string) => {
      setHistorySaving(true);
      onError(null);
      try {
        const data = await patchAdminEmployeeRateHistory(adminToken, historyId, {
          accrual_rate: Number(historyEditRate),
          effective_from: historyEditDate || fallbackDate,
        });
        setHistoryEditingId(null);
        void loadEmployeeRateHistory(employeeId);
        if (Number.isFinite(data?.accrual_rate)) {
          const nr = Number(data.accrual_rate);
          setItems((prev) => prev.map((x) => (x.id === employeeId ? { ...x, accrual_rate: nr } : x)));
          setEditAccrualRate(String(nr));
        }
      } catch (e: unknown) {
        onError((e as Error)?.message || "Ошибка сохранения записи истории");
      } finally {
        setHistorySaving(false);
      }
    },
    [
      adminToken,
      historyEditDate,
      historyEditRate,
      loadEmployeeRateHistory,
      onError,
      setEditAccrualRate,
      setHistoryEditingId,
      setHistorySaving,
      setItems,
    ],
  );

  const removeRateHistoryEntry = useCallback(
    async (historyId: number, employeeId: number) => {
      if (!window.confirm("Удалить эту запись из истории ставок?")) return;
      setHistorySaving(true);
      onError(null);
      try {
        const data = await deleteAdminEmployeeRateHistory(adminToken, historyId, employeeId);
        if (historyEditingId === historyId) setHistoryEditingId(null);
        void loadEmployeeRateHistory(employeeId);
        if (Number.isFinite(data?.accrual_rate)) {
          const nr = Number(data.accrual_rate);
          setItems((prev) => prev.map((x) => (x.id === employeeId ? { ...x, accrual_rate: nr } : x)));
          setEditAccrualRate(String(nr));
        }
      } catch (e: unknown) {
        onError((e as Error)?.message || "Ошибка удаления записи истории");
      } finally {
        setHistorySaving(false);
      }
    },
    [
      adminToken,
      historyEditingId,
      loadEmployeeRateHistory,
      onError,
      setEditAccrualRate,
      setHistoryEditingId,
      setHistorySaving,
      setItems,
    ],
  );

  const beginRateHistoryEdit = useCallback(
    (row: EmployeeRateHistoryRow) => {
      setHistoryEditingId(row.id);
      setHistoryEditDate(row.effective_from);
      setHistoryEditRate(String(row.accrual_rate));
    },
    [setHistoryEditDate, setHistoryEditRate, setHistoryEditingId],
  );

  return {
    createEmployee,
    toggleEmployeeActive,
    removeEmployee,
    saveEmployeeEdit,
    saveRateHistoryEntry,
    removeRateHistoryEntry,
    openEmployeeEditor,
    closeEmployeeEditor,
    saving,
    editSaving,
    historySaving,
    editingId,
  };
}

export type AdminEmployeeDirectoryMutations = ReturnType<typeof useAdminEmployeeDirectoryMutations>;

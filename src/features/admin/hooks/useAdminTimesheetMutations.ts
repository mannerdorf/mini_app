import { useState, useCallback, useRef } from "react";
import {
  deleteAdminTimesheetPayout,
  fetchAdminTimesheet,
  patchAdminTimesheet,
  postAdminTimesheetPayout,
  putAdminTimesheetCell,
} from "../../../api/client/admin/timesheet";
import type { TimesheetPayout } from "../lib/adminTimesheetSummaries";

type Params = {
  adminToken: string;
  isSuperAdmin: boolean;
  timesheetMonth: string;
  onLogout?: (reason?: "expired") => void;
  onError: (msg: string | null) => void;
};

export function useAdminTimesheetMutations({
  adminToken,
  isSuperAdmin,
  timesheetMonth,
  onLogout,
  onError,
}: Params) {
  const onLogoutRef = useRef(onLogout);
  onLogoutRef.current = onLogout;

  const [timesheetHours, setTimesheetHours] = useState<Record<string, string>>({});
  const [timesheetPaymentMarks, setTimesheetPaymentMarks] = useState<Record<string, boolean>>({});
  const [timesheetShiftRateOverrides, setTimesheetShiftRateOverrides] = useState<Record<string, number>>({});
  const [timesheetPayoutsByEmployee, setTimesheetPayoutsByEmployee] = useState<Record<string, TimesheetPayout[]>>({});
  const [timesheetPayoutSavingEmployeeId, setTimesheetPayoutSavingEmployeeId] = useState<number | null>(null);
  const [timesheetPayoutEditingId, setTimesheetPayoutEditingId] = useState<number | null>(null);
  const [timesheetPayoutEditingEmployeeId, setTimesheetPayoutEditingEmployeeId] = useState<number | null>(null);
  const [timesheetPayoutEditDate, setTimesheetPayoutEditDate] = useState("");
  const [timesheetPayoutEditAmount, setTimesheetPayoutEditAmount] = useState("");
  const [timesheetPayoutActionLoadingId, setTimesheetPayoutActionLoadingId] = useState<number | null>(null);

  const fetchTimesheetEntries = useCallback(async () => {
    if (!adminToken || !isSuperAdmin || !/^\d{4}-\d{2}$/.test(timesheetMonth)) return;
    try {
      const data = await fetchAdminTimesheet(adminToken, timesheetMonth);
      setTimesheetHours(data.entries);
      setTimesheetPaymentMarks(data.paymentMarks);
      setTimesheetShiftRateOverrides(data.shiftRateOverrides);
      setTimesheetPayoutsByEmployee(data.payoutsByEmployee);
    } catch (e: unknown) {
      if ((e as Error & { status?: number })?.status === 401) {
        onLogoutRef.current?.("expired");
        return;
      }
      onError((e as Error)?.message || "Ошибка загрузки табеля");
      setTimesheetHours({});
      setTimesheetPaymentMarks({});
      setTimesheetShiftRateOverrides({});
      setTimesheetPayoutsByEmployee({});
    }
  }, [adminToken, isSuperAdmin, timesheetMonth, onError]);

  const saveTimesheetCell = useCallback(
    async (employeeId: number, dateIso: string, value: string) => {
      if (!adminToken || !isSuperAdmin) return;
      try {
        await putAdminTimesheetCell(adminToken, {
          month: timesheetMonth,
          employeeId,
          date: dateIso,
          value,
        });
      } catch (e: unknown) {
        if ((e as Error & { status?: number })?.status === 401) {
          onLogoutRef.current?.("expired");
          return;
        }
        onError((e as Error)?.message || "Ошибка сохранения табеля");
      }
    },
    [adminToken, isSuperAdmin, timesheetMonth, onError],
  );

  const saveTimesheetPaymentMark = useCallback(
    async (employeeId: number, dateIso: string, paid: boolean) => {
      if (!adminToken || !isSuperAdmin) return;
      try {
        await patchAdminTimesheet(adminToken, {
          month: timesheetMonth,
          employeeId,
          date: dateIso,
          paid,
        });
      } catch (e: unknown) {
        if ((e as Error & { status?: number })?.status === 401) {
          onLogoutRef.current?.("expired");
          return;
        }
        onError((e as Error)?.message || "Ошибка сохранения оплаты");
        await fetchTimesheetEntries();
      }
    },
    [adminToken, isSuperAdmin, timesheetMonth, fetchTimesheetEntries, onError],
  );

  const saveTimesheetShiftRate = useCallback(
    async (employeeId: number, dateIso: string, shiftRate: string) => {
      if (!adminToken || !isSuperAdmin) return;
      try {
        await patchAdminTimesheet(adminToken, {
          month: timesheetMonth,
          employeeId,
          date: dateIso,
          shiftRate,
        });
      } catch (e: unknown) {
        if ((e as Error & { status?: number })?.status === 401) {
          onLogoutRef.current?.("expired");
          return;
        }
        onError((e as Error)?.message || "Ошибка сохранения стоимости смены");
        await fetchTimesheetEntries();
      }
    },
    [adminToken, isSuperAdmin, timesheetMonth, fetchTimesheetEntries, onError],
  );

  const createTimesheetPayout = useCallback(
    async (employeeId: number) => {
      if (!adminToken || !isSuperAdmin) return;
      setTimesheetPayoutSavingEmployeeId(employeeId);
      try {
        await postAdminTimesheetPayout(adminToken, { month: timesheetMonth, employeeId });
        await fetchTimesheetEntries();
      } catch (e: unknown) {
        if ((e as Error & { status?: number })?.status === 401) {
          onLogoutRef.current?.("expired");
          return;
        }
        onError((e as Error)?.message || "Ошибка проведения выплаты");
      } finally {
        setTimesheetPayoutSavingEmployeeId(null);
      }
    },
    [adminToken, isSuperAdmin, timesheetMonth, fetchTimesheetEntries, onError],
  );

  const updateTimesheetPayout = useCallback(
    async (employeeId: number, payoutId: number, payoutDate: string, amountRaw: string) => {
      if (!adminToken || !isSuperAdmin) return;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(payoutDate || "").trim())) {
        onError("Дата выплаты должна быть в формате YYYY-MM-DD");
        return;
      }
      const amount = Number(String(amountRaw || "").replace(",", "."));
      if (!Number.isFinite(amount) || amount < 0) {
        onError("Сумма выплаты должна быть числом не меньше 0");
        return;
      }
      setTimesheetPayoutActionLoadingId(payoutId);
      try {
        await patchAdminTimesheet(adminToken, {
          month: timesheetMonth,
          employeeId,
          payoutId,
          payoutDate,
          amount,
        });
        await fetchTimesheetEntries();
        setTimesheetPayoutEditingId(null);
        setTimesheetPayoutEditingEmployeeId(null);
        setTimesheetPayoutEditDate("");
        setTimesheetPayoutEditAmount("");
      } catch (e: unknown) {
        if ((e as Error & { status?: number })?.status === 401) {
          onLogoutRef.current?.("expired");
          return;
        }
        onError((e as Error)?.message || "Ошибка изменения выплаты");
      } finally {
        setTimesheetPayoutActionLoadingId(null);
      }
    },
    [adminToken, isSuperAdmin, timesheetMonth, fetchTimesheetEntries, onError],
  );

  const deleteTimesheetPayout = useCallback(
    async (employeeId: number, payoutId: number) => {
      if (!adminToken || !isSuperAdmin) return;
      if (!window.confirm("Удалить выплату? Действие нельзя отменить.")) return;
      setTimesheetPayoutActionLoadingId(payoutId);
      try {
        await deleteAdminTimesheetPayout(adminToken, { month: timesheetMonth, employeeId, payoutId });
        await fetchTimesheetEntries();
        if (timesheetPayoutEditingId === payoutId) {
          setTimesheetPayoutEditingId(null);
          setTimesheetPayoutEditingEmployeeId(null);
          setTimesheetPayoutEditDate("");
          setTimesheetPayoutEditAmount("");
        }
      } catch (e: unknown) {
        if ((e as Error & { status?: number })?.status === 401) {
          onLogoutRef.current?.("expired");
          return;
        }
        onError((e as Error)?.message || "Ошибка удаления выплаты");
      } finally {
        setTimesheetPayoutActionLoadingId(null);
      }
    },
    [adminToken, isSuperAdmin, timesheetMonth, fetchTimesheetEntries, timesheetPayoutEditingId, onError],
  );

  return {
    timesheetHours,
    setTimesheetHours,
    timesheetPaymentMarks,
    setTimesheetPaymentMarks,
    timesheetShiftRateOverrides,
    setTimesheetShiftRateOverrides,
    timesheetPayoutsByEmployee,
    timesheetPayoutSavingEmployeeId,
    timesheetPayoutEditingId,
    setTimesheetPayoutEditingId,
    timesheetPayoutEditingEmployeeId,
    setTimesheetPayoutEditingEmployeeId,
    timesheetPayoutEditDate,
    setTimesheetPayoutEditDate,
    timesheetPayoutEditAmount,
    setTimesheetPayoutEditAmount,
    timesheetPayoutActionLoadingId,
    fetchTimesheetEntries,
    saveTimesheetCell,
    saveTimesheetPaymentMark,
    saveTimesheetShiftRate,
    createTimesheetPayout,
    updateTimesheetPayout,
    deleteTimesheetPayout,
  };
}

export type AdminTimesheetMutationsState = ReturnType<typeof useAdminTimesheetMutations>;

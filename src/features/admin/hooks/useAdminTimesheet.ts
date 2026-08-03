import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  normalizeAccrualType,
  isMarkAccrualType,
  getDayRateByAccrualType,
  normalizeShiftMark,
  parseTimesheetHoursValue,
} from "../types/adminUsers";
import type { UseAdminEmployeeDirectoryReturn } from "./useAdminEmployeeDirectory";
import {
  deleteAdminTimesheetPayout,
  fetchAdminTimesheet,
  patchAdminTimesheet,
  postAdminTimesheetPayout,
  putAdminTimesheetCell,
} from "../../../api/client/admin/timesheet";
import {
  SHIFT_MARK_OPTIONS,
  SHIFT_MARK_CODES,
  toHalfHourValue,
  buildTimesheetDays,
  buildTimesheetHalfHourOptions,
  getAdminHourlyCellMark,
  getAdminShiftMarkStyle,
  getTimesheetDepartmentLabel,
} from "../lib/adminTimesheetHelpers";

export type UseAdminTimesheetParams = {
  adminToken: string;
  isSuperAdmin: boolean;
  onLogout?: (reason?: "expired") => void;
  onError: (msg: string | null) => void;
  employeeDir: UseAdminEmployeeDirectoryReturn;
};

export function useAdminTimesheet({
  adminToken,
  isSuperAdmin,
  onLogout,
  onError,
  employeeDir,
}: UseAdminTimesheetParams) {
  const onLogoutRef = useRef(onLogout);
  useEffect(() => {
    onLogoutRef.current = onLogout;
  }, [onLogout]);

  const [timesheetMonth, setTimesheetMonth] = useState<string>(() => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    return `${now.getFullYear()}-${month}`;
  });
  const [timesheetSearch, setTimesheetSearch] = useState("");
  const [timesheetDepartmentFilter, setTimesheetDepartmentFilter] = useState<string>("all");
  const [timesheetHours, setTimesheetHours] = useState<Record<string, string>>({});
  const [timesheetPaymentMarks, setTimesheetPaymentMarks] = useState<Record<string, boolean>>({});
  const [timesheetShiftRateOverrides, setTimesheetShiftRateOverrides] = useState<Record<string, number>>({});
  const [timesheetExpandedEmployeeId, setTimesheetExpandedEmployeeId] = useState<number | null>(null);
  const [timesheetPayoutsByEmployee, setTimesheetPayoutsByEmployee] = useState<Record<string, Array<{
    id: number;
    payoutDate: string;
    periodFrom: string;
    periodTo: string;
    amount: number;
    taxAmount: number;
    cooperationType: string;
    paidDates?: string[];
    createdAt: string;
  }>>>({});
  const [timesheetPayoutSavingEmployeeId, setTimesheetPayoutSavingEmployeeId] = useState<number | null>(null);
  const [timesheetPayoutEditingId, setTimesheetPayoutEditingId] = useState<number | null>(null);
  const [timesheetPayoutEditingEmployeeId, setTimesheetPayoutEditingEmployeeId] = useState<number | null>(null);
  const [timesheetPayoutEditDate, setTimesheetPayoutEditDate] = useState("");
  const [timesheetPayoutEditAmount, setTimesheetPayoutEditAmount] = useState("");
  const [timesheetPayoutActionLoadingId, setTimesheetPayoutActionLoadingId] = useState<number | null>(null);
  const [timesheetMobilePicker, setTimesheetMobilePicker] = useState(false);
  const [adminShiftPicker, setAdminShiftPicker] = useState<{ key: string; employeeId: number; dateIso: string; x: number; y: number; isShift: boolean } | null>(null);
  const adminShiftHoldTimerRef = useRef<number | null>(null);
  const adminShiftHoldTriggeredRef = useRef(false);
  const timesheetHalfHourOptions = useMemo(() => buildTimesheetHalfHourOptions(), []);
  const getHourlyCellMark = getAdminHourlyCellMark;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setTimesheetMobilePicker(window.matchMedia("(max-width: 768px)").matches);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const timesheetDays = useMemo(() => buildTimesheetDays(timesheetMonth), [timesheetMonth]);

  const timesheetEmployeesByDepartment = useMemo(() => {
    const q = timesheetSearch.trim().toLowerCase();
    const filtered = employeeDir.items.filter((emp) => {
      if (!q) return true;
      const haystack = [emp.full_name, emp.login, getTimesheetDepartmentLabel(emp), emp.position]
        .map((x) => String(x || "").toLowerCase())
        .join(" ");
      return haystack.includes(q);
    });
    const grouped = new Map<string, EmployeeDirectoryRow[]>();
    for (const emp of filtered) {
      const dep = getTimesheetDepartmentLabel(emp);
      const list = grouped.get(dep) || [];
      list.push(emp);
      grouped.set(dep, list);
    }
    return Array.from(grouped.entries())
      .map(([department, employees]) => ({
        department,
        employees: [...employees].sort((a, b) => {
          const posA = String(a.position || "").trim();
          const posB = String(b.position || "").trim();
          const posCmp = (posA || "\uffff").localeCompare((posB || "\uffff"), "ru");
          if (posCmp !== 0) return posCmp;
          return String(a.full_name || a.login).localeCompare(String(b.full_name || b.login), "ru");
        }),
      }))
      .sort((a, b) => a.department.localeCompare(b.department, "ru"));
  }, [employeeDir.items, timesheetSearch]);
  const timesheetDepartmentOptions = useMemo(() => {
    return timesheetEmployeesByDepartment.map((group) => group.department);
  }, [timesheetEmployeesByDepartment]);
  const timesheetVisibleGroups = useMemo(() => {
    if (timesheetDepartmentFilter === "all") return timesheetEmployeesByDepartment;
    return timesheetEmployeesByDepartment.filter((group) => group.department === timesheetDepartmentFilter);
  }, [timesheetDepartmentFilter, timesheetEmployeesByDepartment]);
  const timesheetDepartmentSummaries = useMemo(() => {
    return timesheetEmployeesByDepartment.map((group) => {
      let totalHours = 0;
      let totalShifts = 0;
      let totalMoney = 0;
      let totalMoneyToPay = 0;
      let totalPaid = 0;
      for (const emp of group.employees) {
        const accrualType = normalizeAccrualType(emp.accrual_type);
        const isShiftAccrual = accrualType === "shift";
        const isMarkAccrual = isMarkAccrualType(accrualType);
        const rate = Number(emp.accrual_rate ?? 0);
        const employeePaid = (timesheetPayoutsByEmployee[String(emp.id)] || []).reduce((acc, payout) => {
          return acc + Number(payout.amount || 0);
        }, 0);
        totalPaid += employeePaid;
        if (isMarkAccrual) {
          const shifts = timesheetDays.reduce((acc, d) => {
            const key = `${emp.id}__${d.iso}`;
            return acc + (normalizeShiftMark(timesheetHours[key] || "") === "Я" ? 1 : 0);
          }, 0);
          const paidShifts = timesheetDays.reduce((acc, d) => {
            const key = `${emp.id}__${d.iso}`;
            if (!timesheetPaymentMarks[key]) return acc;
            return acc + (normalizeShiftMark(timesheetHours[key] || "") === "Я" ? 1 : 0);
          }, 0);
          const totalShiftMoney = isShiftAccrual
            ? timesheetDays.reduce((acc, d) => {
                const key = `${emp.id}__${d.iso}`;
                if (normalizeShiftMark(timesheetHours[key] || "") !== "Я") return acc;
                const override = Number(timesheetShiftRateOverrides[key]);
                const dayRate = Number.isFinite(override) ? override : rate;
                return acc + dayRate;
              }, 0)
            : shifts * getDayRateByAccrualType(rate, accrualType);
          const paidShiftMoney = isShiftAccrual
            ? timesheetDays.reduce((acc, d) => {
                const key = `${emp.id}__${d.iso}`;
                if (!timesheetPaymentMarks[key]) return acc;
                if (normalizeShiftMark(timesheetHours[key] || "") !== "Я") return acc;
                const override = Number(timesheetShiftRateOverrides[key]);
                const dayRate = Number.isFinite(override) ? override : rate;
                return acc + dayRate;
              }, 0)
            : paidShifts * getDayRateByAccrualType(rate, accrualType);
          totalShifts += shifts;
          totalHours += shifts * 8;
          totalMoney += totalShiftMoney;
          totalMoneyToPay += paidShiftMoney;
        } else {
          const hours = timesheetDays.reduce((acc, d) => {
            const key = `${emp.id}__${d.iso}`;
            return acc + parseTimesheetHoursValue(timesheetHours[key] || "");
          }, 0);
          const paidHours = timesheetDays.reduce((acc, d) => {
            const key = `${emp.id}__${d.iso}`;
            if (!timesheetPaymentMarks[key]) return acc;
            return acc + parseTimesheetHoursValue(timesheetHours[key] || "");
          }, 0);
          totalHours += hours;
          totalMoney += hours * rate;
          totalMoneyToPay += paidHours * rate;
        }
      }
      return {
        department: group.department,
        totalHours: Number(totalHours.toFixed(2)),
        totalShifts,
        totalMoney: Number(totalMoney.toFixed(2)),
        totalMoneyToPay: Number(totalMoneyToPay.toFixed(2)),
        totalPaid: Number(totalPaid.toFixed(2)),
        totalOutstanding: Math.max(0, Number((totalMoney - totalPaid).toFixed(2))),
      };
    });
  }, [timesheetEmployeesByDepartment, timesheetDays, timesheetHours, timesheetPaymentMarks, timesheetShiftRateOverrides, timesheetPayoutsByEmployee]);
  const timesheetCompanySummary = useMemo(() => {
    const totalHours = timesheetDepartmentSummaries.reduce((acc, x) => acc + x.totalHours, 0);
    const totalShifts = timesheetDepartmentSummaries.reduce((acc, x) => acc + x.totalShifts, 0);
    const totalMoney = timesheetDepartmentSummaries.reduce((acc, x) => acc + x.totalMoney, 0);
    const totalMoneyToPay = timesheetDepartmentSummaries.reduce((acc, x) => acc + x.totalMoneyToPay, 0);
    const totalPaid = timesheetDepartmentSummaries.reduce((acc, x) => acc + x.totalPaid, 0);
    return {
      totalHours: Number(totalHours.toFixed(2)),
      totalShifts,
      totalMoney: Number(totalMoney.toFixed(2)),
      totalMoneyToPay: Number(totalMoneyToPay.toFixed(2)),
      totalPaid: Number(totalPaid.toFixed(2)),
      totalOutstanding: Math.max(0, Number((totalMoney - totalPaid).toFixed(2))),
    };
  }, [timesheetDepartmentSummaries]);
  const timesheetMonthPaymentStatus = useMemo(() => {
    const totalAccrued = Number(timesheetCompanySummary.totalMoney || 0);
    const paidTotal = Object.values(timesheetPayoutsByEmployee).reduce((acc, payouts) => {
      return acc + payouts.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    }, 0);
    if (totalAccrued <= 0) {
      return { code: "paid", label: "Все выплачено", bg: "#ecfdf3", border: "#16a34a", color: "#166534" };
    }
    if (paidTotal <= 0) {
      return { code: "unpaid", label: "Не выплачено", bg: "#fef2f2", border: "#dc2626", color: "#991b1b" };
    }
    if (paidTotal + 0.01 >= totalAccrued) {
      return { code: "paid", label: "Все выплачено", bg: "#ecfdf3", border: "#16a34a", color: "#166534" };
    }
    return { code: "partial", label: "Выплачено частично", bg: "#fffbeb", border: "#d97706", color: "#92400e" };
  }, [timesheetCompanySummary.totalMoney, timesheetPayoutsByEmployee]);
  const timesheetPaidDateKeys = useMemo(() => {
    const out = new Set<string>();
    for (const [employeeId, payouts] of Object.entries(timesheetPayoutsByEmployee || {})) {
      for (const payout of payouts || []) {
        for (const date of Array.isArray(payout?.paidDates) ? payout.paidDates : []) {
          out.add(`${employeeId}__${String(date || "")}`);
        }
      }
    }
    return out;
  }, [timesheetPayoutsByEmployee]);

  const getShiftMarkStyle = getAdminShiftMarkStyle;

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
  }, [adminToken, isSuperAdmin, timesheetMonth]);

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
    [adminToken, isSuperAdmin, timesheetMonth]
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
    [adminToken, isSuperAdmin, timesheetMonth, fetchTimesheetEntries]
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
    [adminToken, isSuperAdmin, timesheetMonth, fetchTimesheetEntries]
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
    [adminToken, isSuperAdmin, timesheetMonth, fetchTimesheetEntries]
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
    [adminToken, isSuperAdmin, timesheetMonth, fetchTimesheetEntries]
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
    [adminToken, isSuperAdmin, timesheetMonth, fetchTimesheetEntries, timesheetPayoutEditingId]
  );


  useEffect(() => {
    if (isSuperAdmin) employeeDir.fetch(timesheetMonth);
  }, [isSuperAdmin, employeeDir.fetch, timesheetMonth]);

  useEffect(() => {
    fetchTimesheetEntries();
  }, [fetchTimesheetEntries]);

  useEffect(() => {
    if (timesheetDepartmentFilter !== "all" && !timesheetDepartmentOptions.includes(timesheetDepartmentFilter)) {
      setTimesheetDepartmentFilter("all");
    }
  }, [timesheetDepartmentFilter, timesheetDepartmentOptions]);

  return {
    timesheetMonth,
    setTimesheetMonth,
    timesheetSearch,
    setTimesheetSearch,
    timesheetDepartmentFilter,
    setTimesheetDepartmentFilter,
    timesheetHours,
    setTimesheetHours,
    timesheetPaymentMarks,
    setTimesheetPaymentMarks,
    timesheetShiftRateOverrides,
    setTimesheetShiftRateOverrides,
    timesheetExpandedEmployeeId,
    setTimesheetExpandedEmployeeId,
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
    timesheetMobilePicker,
    SHIFT_MARK_OPTIONS,
    SHIFT_MARK_CODES,
    adminShiftPicker,
    setAdminShiftPicker,
    adminShiftHoldTimerRef,
    adminShiftHoldTriggeredRef,
    toHalfHourValue,
    timesheetHalfHourOptions,
    timesheetDays,
    timesheetEmployeesByDepartment,
    timesheetDepartmentOptions,
    timesheetVisibleGroups,
    timesheetDepartmentSummaries,
    timesheetCompanySummary,
    timesheetMonthPaymentStatus,
    timesheetPaidDateKeys,
    getShiftMarkStyle,
    getHourlyCellMark,
    fetchTimesheetEntries,
    saveTimesheetCell,
    saveTimesheetPaymentMark,
    saveTimesheetShiftRate,
    createTimesheetPayout,
    updateTimesheetPayout,
    deleteTimesheetPayout,
  };
}

export type AdminTimesheetState = ReturnType<typeof useAdminTimesheet>;

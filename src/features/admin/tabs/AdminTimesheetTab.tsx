import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Button, Flex, Panel, Typography, Input } from "@maxhub/max-ui";
import { Loader2 } from "lucide-react";
import { getCurrentMonthYm } from "../../../lib/dateUtils";
import {
  normalizeAccrualType,
  isMarkAccrualType,
  getDayRateByAccrualType,
  normalizeShiftMark,
  parseTimesheetHoursValue,
  type EmployeeDirectoryRow,
  type ShiftMarkCode,
} from "../types/adminUsers";
import type { UseAdminEmployeeDirectoryReturn } from "../hooks/useAdminEmployeeDirectory";
import {
  deleteAdminTimesheetPayout,
  fetchAdminTimesheet,
  patchAdminTimesheet,
  postAdminTimesheetPayout,
  putAdminTimesheetCell,
} from "../../../api/client/admin/timesheet";

type AdminTimesheetTabProps = {
  adminToken: string;
  isSuperAdmin: boolean;
  onLogout?: (reason?: "expired") => void;
  onError: (msg: string | null) => void;
  employeeDir: UseAdminEmployeeDirectoryReturn;
};

export function AdminTimesheetTab({ adminToken, isSuperAdmin, onLogout, onError, employeeDir }: AdminTimesheetTabProps) {
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
  const SHIFT_MARK_OPTIONS = [
    { code: "Я", label: "Явка", bg: "#35c46a", color: "#ffffff", border: "#1f8f45" },
    { code: "ПР", label: "Прогул", bg: "#ef4444", color: "#ffffff", border: "#dc2626" },
    { code: "Б", label: "Болезнь", bg: "#f59e0b", color: "#111827", border: "#d97706" },
    { code: "В", label: "Выходной", bg: "#94a3b8", color: "#ffffff", border: "#64748b" },
    { code: "ОГ", label: "Отгул", bg: "#8b5cf6", color: "#ffffff", border: "#7c3aed" },
    { code: "ОТ", label: "Отпуск", bg: "#3b82f6", color: "#ffffff", border: "#2563eb" },
    { code: "УВ", label: "Уволен", bg: "#6b7280", color: "#ffffff", border: "#4b5563" },
  ] as const;
  const SHIFT_MARK_CODES = SHIFT_MARK_OPTIONS.map((x) => x.code);
  const [adminShiftPicker, setAdminShiftPicker] = useState<{ key: string; employeeId: number; dateIso: string; x: number; y: number; isShift: boolean } | null>(null);
  const adminShiftHoldTimerRef = useRef<number | null>(null);
  const adminShiftHoldTriggeredRef = useRef(false);
  const toHalfHourValue = (raw: string) => {
    const parsed = Number(String(raw || "").replace(",", "."));
    if (!Number.isFinite(parsed)) return "0.0";
    const normalized = Math.max(0, Math.min(24, parsed));
    return (Math.round(normalized * 2) / 2).toFixed(1);
  };
  const getHourlyCellMark = (rawValue: string): ShiftMarkCode | "" => {
    const mark = normalizeShiftMark(rawValue);
    if (mark) return mark;
    return parseTimesheetHoursValue(rawValue) > 0 ? "Я" : "В";
  };
  const timesheetHalfHourOptions = useMemo(() => {
    return Array.from({ length: 49 }, (_, idx) => {
      const hours = Math.floor(idx / 2);
      const mins = idx % 2 === 0 ? "00" : "30";
      const value = (idx * 0.5).toFixed(1);
      return { value, label: `${hours}:${mins}` };
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setTimesheetMobilePicker(window.matchMedia("(max-width: 768px)").matches);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const timesheetDays = useMemo(() => {
    const [yRaw, mRaw] = (timesheetMonth || "").split("-");
    const year = Number(yRaw);
    const month = Number(mRaw);
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return [] as { iso: string; day: number; weekdayShort: string; isWeekend: boolean }[];
    const daysInMonth = new Date(year, month, 0).getDate();
    const weekdayShort = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
    const out: { iso: string; day: number; weekdayShort: string; isWeekend: boolean }[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(year, month - 1, d);
      const wd = dt.getDay();
      out.push({
        iso: `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        day: d,
        weekdayShort: weekdayShort[wd] ?? "",
        isWeekend: wd === 0 || wd === 6,
      });
    }
    return out;
  }, [timesheetMonth]);

  const timesheetEmployeesByDepartment = useMemo(() => {
    const getTimesheetDepartmentLabel = (emp: EmployeeDirectoryRow): string => {
      const raw = String(emp.department || "").trim();
      if (!raw) return "Без подразделения";
      // For department heads, keep only the primary (first) subdivision.
      // For regular employees, department should be single, but we still normalize defensively.
      return raw.split(",").map((part) => part.trim()).find(Boolean) || "Без подразделения";
    };
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

  const getShiftMarkStyle = (mark: ShiftMarkCode | "") => {
    const option = SHIFT_MARK_OPTIONS.find((x) => x.code === mark);
    if (!option) {
      return { border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text-secondary)" };
    }
    return { border: `1px solid ${option.border}`, background: option.bg, color: option.color };
  };

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

  return (
        <Panel
          className="cargo-card timesheet-container timesheet-container-wide"
          style={{ padding: "var(--pad-card, 1rem)" }}
        >
          <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Табель учета рабочего времени</Typography.Body>
          <Panel className="cargo-card" style={{ padding: "0.75rem", marginBottom: "0.75rem" }}>
            <Flex align="center" justify="space-between" wrap="wrap" gap="0.75rem">
              <Typography.Body style={{ fontWeight: 600 }}>
                Подразделение: {timesheetDepartmentFilter === "all" ? "Все подразделения" : timesheetDepartmentFilter}
              </Typography.Body>
              <Flex align="center" gap="0.5rem" wrap="wrap">
                <select
                  value={timesheetDepartmentFilter}
                  onChange={(e) => setTimesheetDepartmentFilter(e.target.value)}
                  style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: "0.4rem 0.6rem", background: "var(--color-bg)", minWidth: "12.5rem" }}
                  aria-label="Фильтр подразделения табеля"
                >
                  <option value="all">Все подразделения</option>
                  {timesheetDepartmentOptions.map((dep) => (
                    <option key={`timesheet-department-filter-${dep}`} value={dep}>
                      {dep}
                    </option>
                  ))}
                </select>
                <input
                  type="month"
                  value={timesheetMonth}
                  onChange={(e) => setTimesheetMonth(e.target.value)}
                  style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: "0.4rem 0.6rem", background: "var(--color-bg)" }}
                  aria-label="Месяц табеля"
                />
                <Button
                  type="button"
                  className="filter-button"
                  title="Текущий месяц"
                  style={{ padding: "0.4rem 0.55rem", whiteSpace: "nowrap" }}
                  onClick={() => setTimesheetMonth(getCurrentMonthYm())}
                >
                  Сегодня
                </Button>
                <Button
                  type="button"
                  className="filter-button"
                  onClick={() => {
                    void employeeDir.fetch(timesheetMonth);
                    void fetchTimesheetEntries();
                  }}
                  disabled={employeeDir.loading}
                >
                  Обновить
                </Button>
              </Flex>
            </Flex>
            <Input
              type="text"
              className="admin-form-input"
              value={timesheetSearch}
              onChange={(e) => setTimesheetSearch(e.target.value)}
              placeholder="Поиск по сотруднику: ФИО, должность, логин"
              style={{ width: "100%", marginTop: "0.55rem", height: "2rem", minHeight: "2rem", boxSizing: "border-box", paddingTop: "0.25rem", paddingBottom: "0.25rem" }}
            />
          </Panel>
          <Typography.Body style={{ fontSize: "0.78rem", color: timesheetMonthPaymentStatus.color, marginTop: "-0.35rem", marginBottom: "0.55rem" }}>
            Статус месяца: {timesheetMonthPaymentStatus.label}
          </Typography.Body>
          <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginTop: "-0.35rem", marginBottom: "0.7rem" }}>
            Нажмите на сотрудника, чтобы открыть таблицу выплат и отметить дни к оплате.
          </Typography.Body>
          {employeeDir.loading ? (
            <Flex align="center" gap="0.5rem">
              <Loader2 className="w-4 h-4 animate-spin" />
              <Typography.Body>Загрузка...</Typography.Body>
            </Flex>
          ) : (
            <>
              {timesheetDays.length === 0 ? (
                <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
                  Выберите месяц для отображения табеля.
                </Typography.Body>
              ) : timesheetVisibleGroups.length === 0 ? (
                <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
                  За выбранный период сотрудники не найдены.
                </Typography.Body>
              ) : (
                <div className="timesheet-groups-wrap" style={{ display: "flex", flexDirection: "column", gap: "0.9rem", width: "100%", paddingRight: "3rem" }}>
                  {timesheetVisibleGroups.map((group) => (
                    <Panel
                      key={`timesheet-group-${group.department}`}
                      className="cargo-card timesheet-panel"
                      style={{ padding: "0.6rem" }}
                    >
                      <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>
                        Подразделение: {group.department}
                      </Typography.Body>
                      <div
                        className="timesheet-table-scroll"
                        style={{
                          overflowX: "auto",
                          overflowY: "auto",
                          minWidth: 0,
                          width: "100%",
                          scrollbarGutter: "stable",
                          paddingLeft: "max(0.5rem, env(safe-area-inset-left))",
                          paddingRight: "max(0.5rem, env(safe-area-inset-right))",
                        }}
                      >
                        <table
                          style={{
                            borderCollapse: "collapse",
                            width: "100%",
                            minWidth: `${380 + timesheetDays.length * 52 + SHIFT_MARK_CODES.length * 52}px`,
                          }}
                        >
                          <thead>
                            <tr>
                              <th style={{ textAlign: "left", padding: "0.35rem 0.45rem", borderBottom: "1px solid var(--color-border)", position: "sticky", top: 0, left: 0, background: "var(--color-bg-card, #fff)", zIndex: 40, minWidth: "15rem", boxShadow: "2px 0 0 var(--color-border)" }}>
                                Сотрудник
                              </th>
                              {timesheetDays.map((d) => (
                                <th
                                  key={`timesheet-head-${group.department}-${d.iso}`}
                                  style={{
                                    position: "sticky",
                                    top: 0,
                                    zIndex: 20,
                                    textAlign: "center",
                                    padding: "0.35rem 0.25rem",
                                    borderBottom: "1px solid var(--color-border)",
                                    minWidth: "3.2rem",
                                    background: d.isWeekend ? "var(--color-bg-hover)" : "var(--color-bg-card)",
                                  }}
                                >
                                  <div style={{ fontSize: "0.76rem", color: d.isWeekend ? "#d93025" : "inherit", fontWeight: d.isWeekend ? 600 : 500 }}>{d.day}</div>
                                  <div style={{ fontSize: "0.68rem", color: d.isWeekend ? "#d93025" : "var(--color-text-secondary)" }}>{d.weekdayShort}</div>
                                </th>
                              ))}
                              <th style={{ position: "sticky", top: 0, zIndex: 20, textAlign: "center", padding: "0.35rem 0.45rem", borderBottom: "1px solid var(--color-border)", minWidth: "4rem", background: "var(--color-bg-card)" }}>Итого</th>
                              {SHIFT_MARK_CODES.map((code) => (
                                <th key={`timesheet-legend-head-${code}`} style={{ position: "sticky", top: 0, zIndex: 20, textAlign: "center", padding: "0.35rem 0.25rem", borderBottom: "1px solid var(--color-border)", minWidth: "52px", background: "var(--color-bg-card)" }}>
                                  {code}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {group.employees.map((emp) => {
                              const accrualType = normalizeAccrualType(emp.accrual_type);
                              const isShiftAccrual = accrualType === "shift";
                              const isMarkAccrual = isMarkAccrualType(accrualType);
                              const hourlyRate = Number(emp.accrual_rate ?? 0);
                              const shiftHours = 8;
                              const totalShifts = timesheetDays.reduce((acc, d) => {
                                const key = `${emp.id}__${d.iso}`;
                                const val = timesheetHours[key] || "";
                                return acc + (normalizeShiftMark(val) === "Я" ? 1 : 0);
                              }, 0);
                              const totalHours = isMarkAccrual
                                ? totalShifts * shiftHours
                                : timesheetDays.reduce((acc, d) => {
                                    const key = `${emp.id}__${d.iso}`;
                                    return acc + parseTimesheetHoursValue(timesheetHours[key] || "");
                                  }, 0);
                              const totalMoney = isMarkAccrual
                                ? (isShiftAccrual
                                    ? timesheetDays.reduce((acc, d) => {
                                        const key = `${emp.id}__${d.iso}`;
                                        if (normalizeShiftMark(timesheetHours[key] || "") !== "Я") return acc;
                                        const override = Number(timesheetShiftRateOverrides[key]);
                                        const dayRate = Number.isFinite(override) ? override : hourlyRate;
                                        return acc + dayRate;
                                      }, 0)
                                    : totalShifts * getDayRateByAccrualType(hourlyRate, accrualType))
                                : totalHours * hourlyRate;
                              const paidShifts = isMarkAccrual
                                ? timesheetDays.reduce((acc, d) => {
                                    const key = `${emp.id}__${d.iso}`;
                                    if (!timesheetPaymentMarks[key]) return acc;
                                    return acc + (normalizeShiftMark(timesheetHours[key] || "") === "Я" ? 1 : 0);
                                  }, 0)
                                : 0;
                              const paidHours = isMarkAccrual
                                ? paidShifts * shiftHours
                                : timesheetDays.reduce((acc, d) => {
                                    const key = `${emp.id}__${d.iso}`;
                                    if (!timesheetPaymentMarks[key]) return acc;
                                    return acc + parseTimesheetHoursValue(timesheetHours[key] || "");
                                  }, 0);
                              const totalMoneyToPay = isMarkAccrual
                                ? (isShiftAccrual
                                    ? timesheetDays.reduce((acc, d) => {
                                        const key = `${emp.id}__${d.iso}`;
                                        if (!timesheetPaymentMarks[key]) return acc;
                                        if (normalizeShiftMark(timesheetHours[key] || "") !== "Я") return acc;
                                        const override = Number(timesheetShiftRateOverrides[key]);
                                        const dayRate = Number.isFinite(override) ? override : hourlyRate;
                                        return acc + dayRate;
                                      }, 0)
                                    : paidShifts * getDayRateByAccrualType(hourlyRate, accrualType))
                                : paidHours * hourlyRate;
                              const totalPrimaryText = isMarkAccrual
                                ? `${totalShifts} ${timesheetMobilePicker ? "смены" : "смен"}`
                                : `${Number(totalHours.toFixed(1))} ${timesheetMobilePicker ? "часы" : "ч"}`;
                              const legendCounts = SHIFT_MARK_CODES.reduce<Record<string, number>>((acc, code) => {
                                acc[code] = 0;
                                return acc;
                              }, {});
                              for (const d of timesheetDays) {
                                const key = `${emp.id}__${d.iso}`;
                                const mark = normalizeShiftMark(timesheetHours[key] || "");
                                if (mark) legendCounts[mark] = (legendCounts[mark] || 0) + 1;
                              }
                              const totalColumnCount = 1 + timesheetDays.length + 1 + SHIFT_MARK_CODES.length;
                              const employeePayouts = timesheetPayoutsByEmployee[String(emp.id)] || [];
                              const employeePaidTotal = employeePayouts.reduce((acc, payout) => acc + Number(payout.amount || 0), 0);
                              const employeeOutstanding = Math.max(0, Number((totalMoney - employeePaidTotal).toFixed(2)));
                              const paidDatesSet = new Set(
                                employeePayouts.flatMap((payout) =>
                                  Array.isArray(payout.paidDates) ? payout.paidDates : []
                                ),
                              );
                              const showTaxColumns = emp.cooperation_type === "ip" || emp.cooperation_type === "self_employed";
                              const markedDaysCount = timesheetDays.reduce((acc, d) => {
                                const key = `${emp.id}__${d.iso}`;
                                return acc + (timesheetPaymentMarks[key] ? 1 : 0);
                              }, 0);
                              const isPayoutExpanded = timesheetExpandedEmployeeId === emp.id;
                              return (
                                <React.Fragment key={`timesheet-row-wrap-${group.department}-${emp.id}`}>
                                <tr>
                                  <td style={{ padding: "0.35rem 0.45rem", borderBottom: "1px solid var(--color-border)", position: "sticky", left: 0, background: "var(--color-bg-card, #fff)", zIndex: 30, minWidth: "15rem", boxShadow: "2px 0 0 var(--color-border)" }}>
                                    <Typography.Body
                                      style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer" }}
                                      onClick={() => {
                                        setTimesheetExpandedEmployeeId((prev) => (prev === emp.id ? null : emp.id));
                                      }}
                                    >
                                      {emp.full_name || emp.login}
                                    </Typography.Body>
                                    <Typography.Body style={{ display: "block", fontSize: "0.74rem", color: "var(--color-text-secondary)", marginTop: "0.1rem" }}>{emp.position || "—"}</Typography.Body>
                                  </td>
                                  {timesheetDays.map((d) => {
                                    const key = `${emp.id}__${d.iso}`;
                                    const value = (timesheetHours[key] || "").trim().toUpperCase();
                                    const fallback = "0";
                                    const shiftMark = normalizeShiftMark(value);
                                    const shiftMarkStyle = getShiftMarkStyle(shiftMark);
                                    const hourlyMark = isMarkAccrual ? shiftMark : getHourlyCellMark(value);
                                    const hourlyMarkStyle = getShiftMarkStyle(hourlyMark);
                                    const hourInputValue = parseTimesheetHoursValue(value) > 0 ? String(parseTimesheetHoursValue(value)) : "";
                                    const hourPickerValue = toHalfHourValue(hourInputValue || fallback);
                                    const hourlyHoursEnabled = isMarkAccrual ? false : hourlyMark === "Я";
                                    const isMarkedForPayment = timesheetPaymentMarks[key] === true;
                                    const isPaidDate = paidDatesSet.has(d.iso);
                                    const baseShiftRate = Number(emp.accrual_rate || 0);
                                    const overrideShiftRate = Number(timesheetShiftRateOverrides[key]);
                                    const hasOverrideShiftRate = Number.isFinite(overrideShiftRate);
                                    const effectiveShiftRate = hasOverrideShiftRate ? overrideShiftRate : baseShiftRate;
                                    const shiftRateHint = hasOverrideShiftRate
                                      ? `База: ${baseShiftRate.toLocaleString("ru-RU")} ₽ · Ручная: ${overrideShiftRate.toLocaleString("ru-RU")} ₽`
                                      : `База: ${baseShiftRate.toLocaleString("ru-RU")} ₽`;
                                    return (
                                      <td
                                        key={`timesheet-cell-${emp.id}-${d.iso}`}
                                        onClick={() => {
                                          if (!isPayoutExpanded) return;
                                          if (isPaidDate) return;
                                          const nextPaid = !isMarkedForPayment;
                                          setTimesheetPaymentMarks((prev) => ({ ...prev, [key]: nextPaid }));
                                          void saveTimesheetPaymentMark(emp.id, d.iso, nextPaid);
                                        }}
                                        style={{
                                          padding: isPaidDate ? "0.2rem 0.2rem 0.72rem 0.2rem" : "0.2rem",
                                          borderBottom: "1px solid var(--color-border)",
                                          background: isMarkedForPayment ? "#fff7d6" : (d.isWeekend ? "var(--color-bg-hover)" : "transparent"),
                                          boxShadow: isMarkedForPayment ? "inset 0 0 0 1px #f59e0b" : (isPaidDate ? "inset 0 0 0 1px #16a34a" : undefined),
                                          cursor: isPayoutExpanded ? (isPaidDate ? "not-allowed" : "pointer") : "default",
                                          opacity: isPayoutExpanded && isPaidDate ? 0.9 : 1,
                                        }}
                                        title={isPaidDate ? "Этот день уже оплачен, повторная оплата запрещена" : undefined}
                                      >
                                        {isMarkAccrual ? (
                                          <div style={{ display: "grid", justifyItems: "center", rowGap: "0.08rem" }}>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                if (isPayoutExpanded || isPaidDate) return;
                                                if (adminShiftHoldTriggeredRef.current) {
                                                  adminShiftHoldTriggeredRef.current = false;
                                                  return;
                                                }
                                                const nextValue = shiftMark === "Я" ? "" : "Я";
                                                setTimesheetHours((prev) => ({
                                                  ...prev,
                                                  [key]: nextValue,
                                                }));
                                                if (isShiftAccrual && nextValue !== "Я") {
                                                  setTimesheetShiftRateOverrides((prev) => {
                                                    const next = { ...prev };
                                                    delete next[key];
                                                    return next;
                                                  });
                                                  void saveTimesheetShiftRate(emp.id, d.iso, "");
                                                }
                                                void saveTimesheetCell(emp.id, d.iso, nextValue);
                                              }}
                                              onMouseDown={(e) => {
                                                if (isPayoutExpanded || isPaidDate) return;
                                                if (adminShiftHoldTimerRef.current) window.clearTimeout(adminShiftHoldTimerRef.current);
                                                adminShiftHoldTriggeredRef.current = false;
                                                const { clientX, clientY } = e;
                                                adminShiftHoldTimerRef.current = window.setTimeout(() => {
                                                  adminShiftHoldTriggeredRef.current = true;
                                                  setAdminShiftPicker({ key, employeeId: emp.id, dateIso: d.iso, x: clientX, y: clientY, isShift: isShiftAccrual });
                                                }, 450);
                                              }}
                                              onMouseUp={() => {
                                                if (isPayoutExpanded || isPaidDate) return;
                                                if (adminShiftHoldTimerRef.current) {
                                                  window.clearTimeout(adminShiftHoldTimerRef.current);
                                                  adminShiftHoldTimerRef.current = null;
                                                }
                                              }}
                                              onMouseLeave={() => {
                                                if (isPayoutExpanded || isPaidDate) return;
                                                if (adminShiftHoldTimerRef.current) {
                                                  window.clearTimeout(adminShiftHoldTimerRef.current);
                                                  adminShiftHoldTimerRef.current = null;
                                                }
                                              }}
                                              onTouchStart={(e) => {
                                                if (isPayoutExpanded || isPaidDate) return;
                                                if (adminShiftHoldTimerRef.current) window.clearTimeout(adminShiftHoldTimerRef.current);
                                                adminShiftHoldTriggeredRef.current = false;
                                                const touch = e.touches[0];
                                                adminShiftHoldTimerRef.current = window.setTimeout(() => {
                                                  adminShiftHoldTriggeredRef.current = true;
                                                  setAdminShiftPicker({ key, employeeId: emp.id, dateIso: d.iso, x: touch.clientX, y: touch.clientY, isShift: isShiftAccrual });
                                                }, 450);
                                              }}
                                              onTouchEnd={() => {
                                                if (isPayoutExpanded || isPaidDate) return;
                                                if (adminShiftHoldTimerRef.current) {
                                                  window.clearTimeout(adminShiftHoldTimerRef.current);
                                                  adminShiftHoldTimerRef.current = null;
                                                }
                                              }}
                                              className="timesheet-mark-btn"
                                              style={{
                                                width: "2.2rem",
                                                height: "1.6rem",
                                                padding: 0,
                                                textAlign: "center",
                                                margin: "0 auto",
                                                display: "block",
                                                borderRadius: 999,
                                                border: shiftMarkStyle.border,
                                                background: shiftMarkStyle.background,
                                                color: shiftMarkStyle.color,
                                                fontWeight: 600,
                                                lineHeight: "1.6rem",
                                                fontSize: shiftMark ? "0.82rem" : "1rem",
                                                WebkitAppearance: "none",
                                                appearance: "none",
                                                position: "relative",
                                                overflow: "visible",
                                                cursor: isPayoutExpanded || isPaidDate ? "default" : "pointer",
                                                opacity: isPayoutExpanded || isPaidDate ? 0.9 : 1,
                                              }}
                                              aria-label={shiftMark ? `Статус ${shiftMark}. Нажмите для Я/○, удерживайте для выбора` : "Нажмите для Я, удерживайте для выбора статуса"}
                                              title={isPaidDate ? `Этот день уже оплачен. ${shiftRateHint}` : (shiftMark ? `Статус: ${shiftMark}. ${shiftRateHint}` : `Нажмите для Я, удерживайте для выбора. ${shiftRateHint}`)}
                                            >
                                              {shiftMark || "○"}
                                              {isPaidDate ? (
                                                <span
                                                  style={{
                                                    position: "absolute",
                                                    left: "50%",
                                                    bottom: "-0.68rem",
                                                    transform: "translateX(-50%)",
                                                    fontSize: "0.58rem",
                                                    fontWeight: 700,
                                                    lineHeight: 1,
                                                    padding: "0.07rem 0.22rem",
                                                    borderRadius: 999,
                                                    border: "1px solid #15803d",
                                                    color: "#15803d",
                                                    background: "#dcfce7",
                                                    whiteSpace: "nowrap",
                                                  }}
                                                >
                                                  опл
                                                </span>
                                              ) : null}
                                            </button>
                                            {isShiftAccrual && shiftMark === "Я" ? (
                                              <input
                                                type="number"
                                                min={0}
                                                step={1}
                                                value={
                                                  Number.isFinite(timesheetShiftRateOverrides[key])
                                                    ? String(timesheetShiftRateOverrides[key])
                                                    : ""
                                                }
                                                placeholder={String(Number(emp.accrual_rate || 0))}
                                                disabled={isPayoutExpanded || isPaidDate}
                                                onChange={(e) => {
                                                  if (isPayoutExpanded || isPaidDate) return;
                                                  const nextRaw = e.target.value;
                                                  if (nextRaw.trim() === "") {
                                                    setTimesheetShiftRateOverrides((prev) => {
                                                      const next = { ...prev };
                                                      delete next[key];
                                                      return next;
                                                    });
                                                    void saveTimesheetShiftRate(emp.id, d.iso, "");
                                                    return;
                                                  }
                                                  const parsed = Number(String(nextRaw).replace(",", "."));
                                                  if (!Number.isFinite(parsed) || parsed < 0) return;
                                                  setTimesheetShiftRateOverrides((prev) => ({
                                                    ...prev,
                                                    [key]: Number(parsed.toFixed(2)),
                                                  }));
                                                  void saveTimesheetShiftRate(emp.id, d.iso, String(parsed));
                                                }}
                                                style={{
                                                  width: "3.4rem",
                                                  minWidth: "3.4rem",
                                                  boxSizing: "border-box",
                                                  border: "1px solid var(--color-border)",
                                                  borderRadius: 6,
                                                  background: "var(--color-bg)",
                                                  padding: "0.08rem 0.2rem",
                                                  textAlign: "center",
                                                  fontSize: "0.68rem",
                                                  lineHeight: 1.1,
                                                }}
                                                aria-label="Ручная стоимость смены"
                                                title={`Стоимость смены (переопределение). ${shiftRateHint}. Факт: ${effectiveShiftRate.toLocaleString("ru-RU")} ₽`}
                                              />
                                            ) : null}
                                          </div>
                                        ) : (
                                          <div style={{ display: "grid", justifyItems: "center", rowGap: "0.08rem" }}>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                if (isPayoutExpanded || isPaidDate) return;
                                                if (adminShiftHoldTriggeredRef.current) {
                                                  adminShiftHoldTriggeredRef.current = false;
                                                  return;
                                                }
                                                const nextMark = hourlyMark === "Я" ? "В" : "Я";
                                                const nextValue = nextMark === "Я" ? (hourInputValue || "Я") : "В";
                                                setTimesheetHours((prev) => ({ ...prev, [key]: nextValue }));
                                                void saveTimesheetCell(emp.id, d.iso, nextValue);
                                              }}
                                              onMouseDown={(e) => {
                                                if (isPayoutExpanded || isPaidDate) return;
                                                if (adminShiftHoldTimerRef.current) window.clearTimeout(adminShiftHoldTimerRef.current);
                                                adminShiftHoldTriggeredRef.current = false;
                                                const { clientX, clientY } = e;
                                                adminShiftHoldTimerRef.current = window.setTimeout(() => {
                                                  adminShiftHoldTriggeredRef.current = true;
                                                  setAdminShiftPicker({ key, employeeId: emp.id, dateIso: d.iso, x: clientX, y: clientY, isShift: false });
                                                }, 450);
                                              }}
                                              onMouseUp={() => {
                                                if (adminShiftHoldTimerRef.current) {
                                                  window.clearTimeout(adminShiftHoldTimerRef.current);
                                                  adminShiftHoldTimerRef.current = null;
                                                }
                                              }}
                                              onMouseLeave={() => {
                                                if (adminShiftHoldTimerRef.current) {
                                                  window.clearTimeout(adminShiftHoldTimerRef.current);
                                                  adminShiftHoldTimerRef.current = null;
                                                }
                                              }}
                                              onTouchStart={(e) => {
                                                if (isPayoutExpanded || isPaidDate) return;
                                                if (adminShiftHoldTimerRef.current) window.clearTimeout(adminShiftHoldTimerRef.current);
                                                adminShiftHoldTriggeredRef.current = false;
                                                const touch = e.touches[0];
                                                adminShiftHoldTimerRef.current = window.setTimeout(() => {
                                                  adminShiftHoldTriggeredRef.current = true;
                                                  setAdminShiftPicker({ key, employeeId: emp.id, dateIso: d.iso, x: touch.clientX, y: touch.clientY, isShift: false });
                                                }, 450);
                                              }}
                                              onTouchEnd={() => {
                                                if (adminShiftHoldTimerRef.current) {
                                                  window.clearTimeout(adminShiftHoldTimerRef.current);
                                                  adminShiftHoldTimerRef.current = null;
                                                }
                                              }}
                                              className="timesheet-mark-btn"
                                              style={{
                                                width: "2.2rem",
                                                height: "1.6rem",
                                                padding: 0,
                                                textAlign: "center",
                                                margin: "0 auto",
                                                display: "block",
                                                borderRadius: 999,
                                                border: hourlyMarkStyle.border,
                                                background: hourlyMarkStyle.background,
                                                color: hourlyMarkStyle.color,
                                                fontWeight: 600,
                                                lineHeight: "1.6rem",
                                                fontSize: hourlyMark ? "0.82rem" : "1rem",
                                                WebkitAppearance: "none",
                                                appearance: "none",
                                                position: "relative",
                                                overflow: "visible",
                                                cursor: isPayoutExpanded || isPaidDate ? "default" : "pointer",
                                                opacity: isPayoutExpanded || isPaidDate ? 0.9 : 1,
                                              }}
                                              aria-label={hourlyMark ? `Статус ${hourlyMark}. Нажмите для Я/В, удерживайте для выбора` : "Нажмите для Я, удерживайте для выбора статуса"}
                                            >
                                              {hourlyMark || "В"}
                                              {isPaidDate ? (
                                                <span
                                                  style={{
                                                    position: "absolute",
                                                    left: "50%",
                                                    bottom: "-0.68rem",
                                                    transform: "translateX(-50%)",
                                                    fontSize: "0.58rem",
                                                    fontWeight: 700,
                                                    lineHeight: 1,
                                                    padding: "0.07rem 0.22rem",
                                                    borderRadius: 999,
                                                    border: "1px solid #15803d",
                                                    color: "#15803d",
                                                    background: "#dcfce7",
                                                    whiteSpace: "nowrap",
                                                  }}
                                                >
                                                  опл
                                                </span>
                                              ) : null}
                                            </button>
                                            {timesheetMobilePicker ? (
                                              <select
                                                value={hourPickerValue}
                                                disabled={isPayoutExpanded || isPaidDate || !hourlyHoursEnabled}
                                                onChange={(e) => {
                                                  if (isPaidDate || !hourlyHoursEnabled) return;
                                                  const nextValue = e.target.value;
                                                  setTimesheetHours((prev) => ({ ...prev, [key]: nextValue }));
                                                  void saveTimesheetCell(emp.id, d.iso, nextValue);
                                                }}
                                                className="admin-form-input"
                                                style={{ width: "4.3rem", padding: "0 0.2rem", textAlign: "center", margin: "0 auto", display: "block" }}
                                                aria-label="Количество часов за день"
                                              >
                                                {timesheetHalfHourOptions.map((opt) => (
                                                  <option key={`${key}-opt-${opt.value}`} value={opt.value}>
                                                    {opt.label}
                                                  </option>
                                                ))}
                                              </select>
                                            ) : (
                                              <input
                                                type="number"
                                                min={0}
                                                max={24}
                                                step={0.5}
                                                value={hourInputValue}
                                                disabled={isPayoutExpanded || isPaidDate || !hourlyHoursEnabled}
                                                onChange={(e) => {
                                                  if (isPaidDate || !hourlyHoursEnabled) return;
                                                  const raw = e.target.value;
                                                  const nextValue = raw.trim() === "" ? "Я" : String(Math.max(0, Math.min(24, Number(raw) || 0)));
                                                  setTimesheetHours((prev) => ({ ...prev, [key]: nextValue }));
                                                  void saveTimesheetCell(emp.id, d.iso, nextValue);
                                                }}
                                                className="admin-form-input"
                                                style={{ width: "3rem", padding: "0 0.25rem", textAlign: "center", margin: "0 auto" }}
                                              />
                                            )}
                                          </div>
                                        )}
                                      </td>
                                    );
                                  })}
                                  <td style={{ textAlign: "center", padding: "0.35rem 0.45rem", borderBottom: "1px solid var(--color-border)", fontWeight: 600, minWidth: "7.2rem" }}>
                                    <div>{totalPrimaryText}</div>
                                    <div style={{ fontSize: "0.76rem", color: "var(--color-text-secondary)" }}>
                                      {Number(totalMoney.toFixed(2))} ₽
                                    </div>
                                    <div style={{ fontSize: "0.72rem", color: "#15803d", marginTop: "0.12rem" }}>
                                      Остаток: {employeeOutstanding.toLocaleString("ru-RU")} ₽
                                    </div>
                                  </td>
                                  {SHIFT_MARK_CODES.map((code) => (
                                    <td key={`${emp.id}-legend-${code}`} style={{ textAlign: "center", padding: "0.35rem 0.25rem", borderBottom: "1px solid var(--color-border)" }}>
                                      <Typography.Body style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                                        {legendCounts[code] || 0}
                                      </Typography.Body>
                                    </td>
                                  ))}
                                </tr>
                                {timesheetExpandedEmployeeId === emp.id ? (
                                  <tr>
                                    <td colSpan={totalColumnCount} style={{ padding: "0.55rem", borderBottom: "1px solid var(--color-border)", background: "var(--color-bg-hover)" }}>
                                      <Flex align="center" justify="space-between" wrap="wrap" gap="0.5rem" style={{ marginBottom: "0.45rem" }}>
                                        <Typography.Body style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                                          Выплаты сотрудника
                                        </Typography.Body>
                                        <Flex align="center" gap="0.45rem" wrap="wrap">
                                          <Typography.Body style={{ fontSize: "0.76rem", color: "var(--color-text-secondary)" }}>
                                            Дней к выплате: {markedDaysCount} · Сумма: {Number(totalMoneyToPay.toFixed(2)).toLocaleString("ru-RU")} ₽
                                          </Typography.Body>
                                          <Button
                                            type="button"
                                            className="filter-button"
                                            disabled={timesheetPayoutSavingEmployeeId === emp.id || markedDaysCount === 0 || Number(totalMoneyToPay) <= 0}
                                            onClick={() => void createTimesheetPayout(emp.id)}
                                            style={{ padding: "0.35rem 0.6rem" }}
                                          >
                                            {timesheetPayoutSavingEmployeeId === emp.id ? "Выплата..." : "+ Новая выплата"}
                                          </Button>
                                        </Flex>
                                      </Flex>
                                      {employeePayouts.length === 0 ? (
                                        <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>
                                          Выплат пока нет.
                                        </Typography.Body>
                                      ) : (
                                        <div style={{ overflowX: "auto" }}>
                                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                                            <thead>
                                              <tr>
                                                <th style={{ textAlign: "left", padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>Дата выплаты</th>
                                                <th style={{ textAlign: "left", padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>За период</th>
                                                <th style={{ textAlign: "right", padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>Сумма</th>
                                                {showTaxColumns ? (
                                                  <th style={{ textAlign: "right", padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>Налог</th>
                                                ) : null}
                                                {showTaxColumns ? (
                                                  <th style={{ textAlign: "right", padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>Сумма с налогом</th>
                                                ) : null}
                                                {isSuperAdmin ? (
                                                  <th style={{ textAlign: "right", padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>Действия</th>
                                                ) : null}
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {employeePayouts.map((payout) => {
                                                const isEditing = timesheetPayoutEditingId === payout.id && timesheetPayoutEditingEmployeeId === emp.id;
                                                const isActionLoading = timesheetPayoutActionLoadingId === payout.id;
                                                const editAmountNumber = Number(String(timesheetPayoutEditAmount || "").replace(",", "."));
                                                const previewTax = Number.isFinite(editAmountNumber) && editAmountNumber >= 0
                                                  ? ((payout.cooperationType === "ip" || payout.cooperationType === "self_employed")
                                                      ? Number((editAmountNumber / 0.94 - editAmountNumber).toFixed(2))
                                                      : 0)
                                                  : Number(payout.taxAmount || 0);
                                                return (
                                                  <tr key={`timesheet-payout-row-${payout.id}`}>
                                                    <td style={{ padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>
                                                      {isEditing ? (
                                                        <input
                                                          type="date"
                                                          className="admin-form-input"
                                                          value={timesheetPayoutEditDate}
                                                          onChange={(e) => setTimesheetPayoutEditDate(e.target.value)}
                                                          style={{ minWidth: "8.6rem", padding: "0.2rem 0.3rem" }}
                                                        />
                                                      ) : (
                                                        payout.payoutDate
                                                      )}
                                                    </td>
                                                    <td style={{ padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>
                                                      {payout.periodFrom} — {payout.periodTo}
                                                    </td>
                                                    <td style={{ padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)", textAlign: "right", fontWeight: 600 }}>
                                                      {isEditing ? (
                                                        <input
                                                          type="number"
                                                          min={0}
                                                          step={0.01}
                                                          className="admin-form-input"
                                                          value={timesheetPayoutEditAmount}
                                                          onChange={(e) => setTimesheetPayoutEditAmount(e.target.value)}
                                                          style={{ width: "7.2rem", textAlign: "right", padding: "0.2rem 0.3rem" }}
                                                        />
                                                      ) : (
                                                        `${Number(payout.amount || 0).toLocaleString("ru-RU")} ₽`
                                                      )}
                                                    </td>
                                                    {showTaxColumns ? (
                                                      <td style={{ padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)", textAlign: "right", fontWeight: 600, color: "#b45309" }}>
                                                        {isEditing
                                                          ? `${Number(previewTax || 0).toLocaleString("ru-RU")} ₽`
                                                          : `${Number(payout.taxAmount || 0).toLocaleString("ru-RU")} ₽`}
                                                      </td>
                                                    ) : null}
                                                    {showTaxColumns ? (
                                                      <td style={{ padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)", textAlign: "right", fontWeight: 700, color: "#92400e" }}>
                                                        {isEditing
                                                          ? `${Number((Number.isFinite(editAmountNumber) ? editAmountNumber + Number(previewTax || 0) : Number(payout.amount || 0) + Number(payout.taxAmount || 0))).toLocaleString("ru-RU")} ₽`
                                                          : `${Number(Number(payout.amount || 0) + Number(payout.taxAmount || 0)).toLocaleString("ru-RU")} ₽`}
                                                      </td>
                                                    ) : null}
                                                    {isSuperAdmin ? (
                                                      <td style={{ padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)", textAlign: "right" }}>
                                                        {isEditing ? (
                                                          <Flex align="center" justify="flex-end" gap="0.3rem">
                                                            <Button
                                                              type="button"
                                                              className="filter-button"
                                                              disabled={isActionLoading}
                                                              onClick={() => void updateTimesheetPayout(emp.id, payout.id, timesheetPayoutEditDate, timesheetPayoutEditAmount)}
                                                              style={{ padding: "0.2rem 0.45rem" }}
                                                            >
                                                              {isActionLoading ? "Сохранение..." : "Сохранить"}
                                                            </Button>
                                                            <Button
                                                              type="button"
                                                              className="filter-button"
                                                              disabled={isActionLoading}
                                                              onClick={() => {
                                                                setTimesheetPayoutEditingId(null);
                                                                setTimesheetPayoutEditingEmployeeId(null);
                                                                setTimesheetPayoutEditDate("");
                                                                setTimesheetPayoutEditAmount("");
                                                              }}
                                                              style={{ padding: "0.2rem 0.45rem" }}
                                                            >
                                                              Отмена
                                                            </Button>
                                                          </Flex>
                                                        ) : (
                                                          <Flex align="center" justify="flex-end" gap="0.3rem">
                                                            <Button
                                                              type="button"
                                                              className="filter-button"
                                                              disabled={timesheetPayoutActionLoadingId !== null}
                                                              onClick={() => {
                                                                setTimesheetPayoutEditingId(payout.id);
                                                                setTimesheetPayoutEditingEmployeeId(emp.id);
                                                                setTimesheetPayoutEditDate(payout.payoutDate || "");
                                                                setTimesheetPayoutEditAmount(String(Number(payout.amount || 0)));
                                                              }}
                                                              style={{ padding: "0.2rem 0.45rem" }}
                                                            >
                                                              Изменить
                                                            </Button>
                                                            <Button
                                                              type="button"
                                                              className="filter-button"
                                                              disabled={timesheetPayoutActionLoadingId !== null}
                                                              onClick={() => void deleteTimesheetPayout(emp.id, payout.id)}
                                                              style={{ padding: "0.2rem 0.45rem", borderColor: "#dc2626", color: "#b91c1c" }}
                                                            >
                                                              Удалить
                                                            </Button>
                                                          </Flex>
                                                        )}
                                                      </td>
                                                    ) : null}
                                                  </tr>
                                                );
                                              })}
                                            </tbody>
                                          </table>
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                ) : null}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </Panel>
                  ))}
                  <Flex align="center" gap="0.5rem" wrap="wrap">
                    <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>Я - Явка</Typography.Body>
                    <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>ПР - прогул</Typography.Body>
                    <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>Б - Болезнь</Typography.Body>
                    <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>В - Выходной</Typography.Body>
                    <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>ОГ - Отгул</Typography.Body>
                    <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>ОТ - отпуск</Typography.Body>
                    <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>УВ - Уволен</Typography.Body>
                    <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>
                      Смена: нажмите и удерживайте для выбора статуса
                    </Typography.Body>
                  </Flex>
                  {timesheetDepartmentSummaries.map((row) => (
                    <Panel key={`timesheet-summary-${row.department}`} className="cargo-card" style={{ marginTop: "0.65rem", padding: "0.7rem" }}>
                      <Typography.Body style={{ fontWeight: 600 }}>
                        Итого по подразделению: {row.department} · {row.totalShifts} смен · {row.totalHours} ч
                      </Typography.Body>
                      <Flex align="center" gap="0.35rem" wrap="wrap" style={{ marginTop: "0.14rem" }}>
                        <span style={{ fontSize: "0.74rem", padding: "0.14rem 0.4rem", borderRadius: 999, border: "1px solid #cbd5e1", background: "#f8fafc", color: "#0f172a", fontWeight: 600 }}>
                          {row.totalMoney.toLocaleString("ru-RU")} ₽
                        </span>
                        <span style={{ fontSize: "0.74rem", padding: "0.14rem 0.4rem", borderRadius: 999, border: "1px solid #86efac", background: "#dcfce7", color: "#166534", fontWeight: 600 }}>
                          {row.totalPaid.toLocaleString("ru-RU")} ₽
                        </span>
                        <span style={{ fontSize: "0.74rem", padding: "0.14rem 0.4rem", borderRadius: 999, border: "1px solid #fcd34d", background: "#fef3c7", color: "#92400e", fontWeight: 700 }}>
                          {row.totalOutstanding.toLocaleString("ru-RU")} ₽
                        </span>
                      </Flex>
                    </Panel>
                  ))}
                  <Panel className="cargo-card" style={{ marginTop: "0.65rem", padding: "0.7rem" }}>
                    <Typography.Body style={{ fontWeight: 600 }}>
                      Итого по компании: {timesheetCompanySummary.totalShifts} смен · {timesheetCompanySummary.totalHours} ч
                    </Typography.Body>
                    <Flex align="center" gap="0.35rem" wrap="wrap" style={{ marginTop: "0.14rem" }}>
                      <span style={{ fontSize: "0.74rem", padding: "0.14rem 0.4rem", borderRadius: 999, border: "1px solid #cbd5e1", background: "#f8fafc", color: "#0f172a", fontWeight: 600 }}>
                        {timesheetCompanySummary.totalMoney.toLocaleString("ru-RU")} ₽
                      </span>
                      <span style={{ fontSize: "0.74rem", padding: "0.14rem 0.4rem", borderRadius: 999, border: "1px solid #86efac", background: "#dcfce7", color: "#166534", fontWeight: 600 }}>
                        {timesheetCompanySummary.totalPaid.toLocaleString("ru-RU")} ₽
                      </span>
                      <span style={{ fontSize: "0.74rem", padding: "0.14rem 0.4rem", borderRadius: 999, border: "1px solid #fcd34d", background: "#fef3c7", color: "#92400e", fontWeight: 700 }}>
                        {timesheetCompanySummary.totalOutstanding.toLocaleString("ru-RU")} ₽
                      </span>
                    </Flex>
                  </Panel>
                </div>
              )}
            </>
          )}
          {adminShiftPicker ? (
            <div style={{ position: "fixed", inset: 0, zIndex: 10000 }} onClick={() => setAdminShiftPicker(null)}>
              <div
                style={{
                  position: "fixed",
                  top: typeof window !== "undefined" ? Math.min(adminShiftPicker.y + 8, window.innerHeight - 220) : adminShiftPicker.y + 8,
                  left: typeof window !== "undefined" ? Math.min(adminShiftPicker.x - 80, window.innerWidth - 190) : adminShiftPicker.x - 80,
                  width: 180,
                  background: "var(--color-bg-card, #fff)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 10,
                  padding: "0.4rem",
                  boxShadow: "0 10px 24px rgba(0,0,0,0.15)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {SHIFT_MARK_OPTIONS.map((opt) => (
                  <button
                    key={`admin-shift-mark-${opt.code}`}
                    type="button"
                    onClick={() => {
                      if (timesheetPaidDateKeys.has(adminShiftPicker.key)) return;
                      const currentValue = timesheetHours[adminShiftPicker.key] || "";
                      const currentHours = parseTimesheetHoursValue(currentValue);
                      const nextValue = opt.code === "Я" && !adminShiftPicker.isShift
                        ? (currentHours > 0 ? String(currentHours) : "Я")
                        : opt.code;
                      setTimesheetHours((prev) => ({ ...prev, [adminShiftPicker.key]: nextValue }));
                      if (adminShiftPicker.isShift && nextValue !== "Я") {
                        setTimesheetShiftRateOverrides((prev) => {
                          const next = { ...prev };
                          delete next[adminShiftPicker.key];
                          return next;
                        });
                        void saveTimesheetShiftRate(adminShiftPicker.employeeId, adminShiftPicker.dateIso, "");
                      }
                      void saveTimesheetCell(adminShiftPicker.employeeId, adminShiftPicker.dateIso, nextValue);
                      setAdminShiftPicker(null);
                    }}
                    style={{
                      width: "100%",
                      marginBottom: "0.25rem",
                      padding: "0.35rem 0.5rem",
                      borderRadius: 8,
                      border: `1px solid ${opt.border}`,
                      background: opt.bg,
                      color: opt.color,
                      textAlign: "left",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {opt.code} - {opt.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    if (timesheetPaidDateKeys.has(adminShiftPicker.key)) return;
                    setTimesheetHours((prev) => ({ ...prev, [adminShiftPicker.key]: "" }));
                    if (adminShiftPicker.isShift) {
                      setTimesheetShiftRateOverrides((prev) => {
                        const next = { ...prev };
                        delete next[adminShiftPicker.key];
                        return next;
                      });
                      void saveTimesheetShiftRate(adminShiftPicker.employeeId, adminShiftPicker.dateIso, "");
                    }
                    void saveTimesheetCell(adminShiftPicker.employeeId, adminShiftPicker.dateIso, "");
                    setAdminShiftPicker(null);
                  }}
                  style={{
                    width: "100%",
                    padding: "0.3rem 0.5rem",
                    borderRadius: 8,
                    border: "1px solid var(--color-border)",
                    background: "var(--color-bg)",
                    color: "var(--color-text-secondary)",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  ○ - очистить
                </button>
              </div>
            </div>
          ) : null}
        </Panel>

  );
}

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Account } from "../../../types";
import type { DepartmentTimesheetPayoutRow } from "../../../pages/profile/departmentTimesheetTypes";
import {
    deleteMyDepartmentTimesheet,
    patchMyDepartmentTimesheet,
    postMyDepartmentTimesheet,
    putMyDepartmentTimesheet,
} from "../../../api/client/profile/accounting";
import {
    WORK_DAYS_IN_MONTH,
    normalizeDepartmentAccrualType,
    normalizeShiftMark,
    getDayRateByAccrualType,
} from "../departmentTimesheetHelpers";

export type DepartmentTimesheetEmployee = {
    id: number;
    login: string;
    fullName: string;
    department: string;
    position: string;
    cooperationType?: "self_employed" | "ip" | "staff" | string;
    employeeRole: "employee" | "department_head";
    accrualType: "hour" | "shift" | "month";
    accrualRate: number;
    active: boolean;
};

export type UseDepartmentTimesheetParams = {
    activeAccount: Account | null;
    fetchEnabled: boolean;
};

export function useDepartmentTimesheet({ activeAccount, fetchEnabled }: UseDepartmentTimesheetParams) {
    const [departmentTimesheetDepartment, setDepartmentTimesheetDepartment] = useState("");
    const [departmentTimesheetAllDepartments, setDepartmentTimesheetAllDepartments] = useState(false);
    const [departmentTimesheetDepartmentFilter, setDepartmentTimesheetDepartmentFilter] = useState<string>("all");
    const [departmentTimesheetEmployees, setDepartmentTimesheetEmployees] = useState<Array<{
        id: number;
        login: string;
        fullName: string;
        department: string;
        position: string;
        cooperationType?: "self_employed" | "ip" | "staff" | string;
        employeeRole: "employee" | "department_head";
        accrualType: "hour" | "shift" | "month";
        accrualRate: number;
        active: boolean;
    }>>([]);
    const [departmentTimesheetAvailableEmployees, setDepartmentTimesheetAvailableEmployees] = useState<Array<{
        id: number;
        login: string;
        fullName: string;
        position: string;
        employeeRole: "employee" | "department_head";
    }>>([]);
    const [departmentTimesheetSelectedEmployeeId, setDepartmentTimesheetSelectedEmployeeId] = useState<string>("");
    const [departmentTimesheetLoading, setDepartmentTimesheetLoading] = useState(false);
    const [departmentTimesheetError, setDepartmentTimesheetError] = useState<string | null>(null);
    const [departmentTimesheetSearch, setDepartmentTimesheetSearch] = useState("");
    const [departmentTimesheetManageExpanded, setDepartmentTimesheetManageExpanded] = useState(false);
    const [departmentTimesheetMonth, setDepartmentTimesheetMonth] = useState<string>(() => {
        const now = new Date();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        return `${now.getFullYear()}-${month}`;
    });
    const departmentTimesheetIsEditableMonth = true;
    const [departmentTimesheetHours, setDepartmentTimesheetHours] = useState<Record<string, string>>({});
    const [departmentTimesheetPayoutsByEmployee, setDepartmentTimesheetPayoutsByEmployee] = useState<Record<string, number>>({});
    const [departmentTimesheetPaidDayMarks, setDepartmentTimesheetPaidDayMarks] = useState<Record<string, boolean>>({});
    const [departmentTimesheetPayoutsDetailByEmployee, setDepartmentTimesheetPayoutsDetailByEmployee] = useState<
        Record<string, DepartmentTimesheetPayoutRow[]>
    >({});
    const [departmentTimesheetExpandedEmployeeId, setDepartmentTimesheetExpandedEmployeeId] = useState<number | null>(null);
    const [departmentTimesheetShiftRateOverrides, setDepartmentTimesheetShiftRateOverrides] = useState<Record<string, number>>({});
    const [departmentTimesheetMobilePicker, setDepartmentTimesheetMobilePicker] = useState(false);
    const [departmentTimesheetWideMode, setDepartmentTimesheetWideMode] = useState<boolean>(() => {
        if (typeof window === "undefined") return true;
        try {
            const saved = window.localStorage.getItem("haulz.profile.timesheetWideMode");
            if (saved === "0") return false;
            if (saved === "1") return true;
        } catch {
            // ignore storage access errors
        }
        return true;
    });
    const sortedDepartmentTimesheetEmployees = useMemo(() => {
        return [...departmentTimesheetEmployees].sort((a, b) => {
            const posA = String(a.position || "").trim();
            const posB = String(b.position || "").trim();
            const posCmp = (posA || "\uffff").localeCompare((posB || "\uffff"), "ru");
            if (posCmp !== 0) return posCmp;
            const nameA = String(a.fullName || a.login || "").trim();
            const nameB = String(b.fullName || b.login || "").trim();
            return nameA.localeCompare(nameB, "ru");
        });
    }, [departmentTimesheetEmployees]);
    const departmentTimesheetDepartmentOptions = useMemo(() => {
        const uniq = new Set<string>();
        for (const emp of departmentTimesheetEmployees) {
            const dep = String(emp.department || "").trim();
            if (dep) uniq.add(dep);
        }
        return Array.from(uniq).sort((a, b) => a.localeCompare(b, "ru"));
    }, [departmentTimesheetEmployees]);
    const filteredDepartmentTimesheetEmployees = useMemo(() => {
        const selectedDepartment = String(departmentTimesheetDepartmentFilter || "all").trim();
        const byDepartment =
            departmentTimesheetAllDepartments && selectedDepartment !== "all"
                ? sortedDepartmentTimesheetEmployees.filter((emp) => String(emp.department || "").trim() === selectedDepartment)
                : sortedDepartmentTimesheetEmployees;
        const q = departmentTimesheetSearch.trim().toLowerCase();
        if (!q) return byDepartment;
        return byDepartment.filter((emp) => {
            const haystack = [emp.fullName, emp.login, emp.position, emp.department]
                .map((x) => String(x || "").toLowerCase())
                .join(" ");
            return haystack.includes(q);
        });
    }, [departmentTimesheetSearch, sortedDepartmentTimesheetEmployees, departmentTimesheetDepartmentFilter, departmentTimesheetAllDepartments]);
    const [departmentTimesheetEmployeeFullName, setDepartmentTimesheetEmployeeFullName] = useState("");
    const [departmentTimesheetEmployeePosition, setDepartmentTimesheetEmployeePosition] = useState("");
    const [departmentTimesheetEmployeeAccrualType, setDepartmentTimesheetEmployeeAccrualType] = useState<"hour" | "shift" | "month">("hour");
    const [departmentTimesheetEmployeeAccrualRate, setDepartmentTimesheetEmployeeAccrualRate] = useState("0");
    const [departmentTimesheetEmployeeCooperationType, setDepartmentTimesheetEmployeeCooperationType] = useState<"self_employed" | "ip" | "staff">("staff");
    const [departmentTimesheetEmployeeSaving, setDepartmentTimesheetEmployeeSaving] = useState(false);
    const [departmentShiftPicker, setDepartmentShiftPicker] = useState<{ key: string; employeeId: number; day: number; x: number; y: number; isShift: boolean } | null>(null);
    const departmentShiftHoldTimerRef = useRef<number | null>(null);
    const departmentShiftHoldTriggeredRef = useRef(false);
    const departmentTimesheetMonthlyEstimate = useMemo(() => {
        const rate = Number(String(departmentTimesheetEmployeeAccrualRate || "").replace(",", "."));
        if (!Number.isFinite(rate) || rate < 0) return 0;
        if (departmentTimesheetEmployeeAccrualType === "month") return rate;
        return departmentTimesheetEmployeeAccrualType === "shift"
            ? rate * WORK_DAYS_IN_MONTH
            : rate * 8 * WORK_DAYS_IN_MONTH;
    }, [departmentTimesheetEmployeeAccrualRate, departmentTimesheetEmployeeAccrualType]);
    const departmentTimesheetHalfHourOptions = useMemo(
        () =>
            Array.from({ length: 49 }, (_, idx) => {
                const hours = Math.floor(idx / 2);
                const mins = idx % 2 === 0 ? "00" : "30";
                const value = (idx * 0.5).toFixed(1);
                return { value, label: `${hours}:${mins}` };
            }),
        [],
    );
    const departmentTimesheetDays = useMemo(() => {
        if (!/^\d{4}-\d{2}$/.test(departmentTimesheetMonth)) return [];
        const [yearRaw, monthRaw] = departmentTimesheetMonth.split("-");
        const year = Number(yearRaw);
        const month = Number(monthRaw);
        if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return [];
        const daysInMonth = new Date(year, month, 0).getDate();
        return Array.from({ length: daysInMonth }, (_, idx) => idx + 1);
    }, [departmentTimesheetMonth]);
    const departmentTimesheetWeekdayByDay = useMemo(() => {
        if (!/^\d{4}-\d{2}$/.test(departmentTimesheetMonth)) return {} as Record<number, { short: string; isWeekend: boolean }>;
        const [yearRaw, monthRaw] = departmentTimesheetMonth.split("-");
        const year = Number(yearRaw);
        const month = Number(monthRaw);
        if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return {} as Record<number, { short: string; isWeekend: boolean }>;
        const weekdayShort = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
        const out: Record<number, { short: string; isWeekend: boolean }> = {};
        for (const day of departmentTimesheetDays) {
            const dt = new Date(year, month - 1, day);
            const wd = dt.getDay();
            out[day] = { short: weekdayShort[wd] ?? "", isWeekend: wd === 0 || wd === 6 };
        }
        return out;
    }, [departmentTimesheetMonth, departmentTimesheetDays]);
    const calculateTimesheetSummary = (employees: typeof departmentTimesheetEmployees) => {
        let totalHours = 0;
        let totalShifts = 0;
        let totalMoney = 0;
        let totalPaid = 0;
        for (const emp of employees) {
            const accrualType = normalizeDepartmentAccrualType(emp.accrualType);
            const isShift = accrualType === "shift";
            const isMarkAccrualType = accrualType === "shift" || accrualType === "month";
            const rate = Number(emp.accrualRate ?? 0);
            if (isMarkAccrualType) {
                const shifts = departmentTimesheetDays.reduce((acc, day) => {
                    const key = `${emp.id}:${day}`;
                    return acc + (normalizeShiftMark(departmentTimesheetHours[key] || '') === 'Я' ? 1 : 0);
                }, 0);
                const shiftMoney = departmentTimesheetDays.reduce((acc, day) => {
                    const key = `${emp.id}:${day}`;
                    if (normalizeShiftMark(departmentTimesheetHours[key] || '') !== 'Я') return acc;
                    const override = Number(departmentTimesheetShiftRateOverrides[key]);
                    const dayRate = isShift
                        ? (Number.isFinite(override) ? override : rate)
                        : getDayRateByAccrualType(rate, accrualType);
                    return acc + dayRate;
                }, 0);
                totalShifts += shifts;
                totalHours += shifts * 8;
                totalMoney += shiftMoney;
            } else {
                const hours = departmentTimesheetDays.reduce((acc, day) => {
                    const key = `${emp.id}:${day}`;
                    const value = Number(String(departmentTimesheetHours[key] || '').trim().replace(',', '.'));
                    return acc + (Number.isFinite(value) ? value : 0);
                }, 0);
                totalHours += hours;
                totalMoney += hours * rate;
            }
            totalPaid += Number(departmentTimesheetPayoutsByEmployee[String(emp.id)] || 0);
        }
        return {
            totalHours: Number(totalHours.toFixed(2)),
            totalShifts,
            totalMoney: Number(totalMoney.toFixed(2)),
            totalPaid: Number(totalPaid.toFixed(2)),
            totalOutstanding: Math.max(0, Number((totalMoney - totalPaid).toFixed(2))),
        };
    };
    const departmentTimesheetDepartmentSummaries = useMemo(() => {
        const grouped = new Map<string, typeof departmentTimesheetEmployees>();
        for (const emp of departmentTimesheetEmployees) {
            const dep = String(emp.department || "").trim() || "Без подразделения";
            const prev = grouped.get(dep) || [];
            grouped.set(dep, [...prev, emp]);
        }
        return Array.from(grouped.entries())
            .map(([departmentName, employees]) => ({
                departmentName,
                ...calculateTimesheetSummary(employees),
            }))
            .sort((a, b) => a.departmentName.localeCompare(b.departmentName, "ru"));
    }, [departmentTimesheetEmployees, departmentTimesheetDays, departmentTimesheetHours, departmentTimesheetPayoutsByEmployee, departmentTimesheetShiftRateOverrides]);
    const companyTimesheetSummary = useMemo(() => {
        return calculateTimesheetSummary(departmentTimesheetEmployees);
    }, [departmentTimesheetEmployees, departmentTimesheetDays, departmentTimesheetHours, departmentTimesheetPayoutsByEmployee, departmentTimesheetShiftRateOverrides]);
    const filteredDepartmentTimesheetSummary = useMemo(() => {
        return calculateTimesheetSummary(filteredDepartmentTimesheetEmployees);
    }, [filteredDepartmentTimesheetEmployees, departmentTimesheetDays, departmentTimesheetHours, departmentTimesheetPayoutsByEmployee, departmentTimesheetShiftRateOverrides]);
    const visibleDepartmentTimesheetSummaries = useMemo(() => {
        if (!departmentTimesheetAllDepartments) {
            return [{
                departmentName: departmentTimesheetDepartment || "—",
                ...filteredDepartmentTimesheetSummary,
            }];
        }
        if (departmentTimesheetDepartmentFilter === "all") return departmentTimesheetDepartmentSummaries;
        return departmentTimesheetDepartmentSummaries.filter((summary) => summary.departmentName === departmentTimesheetDepartmentFilter);
    }, [
        departmentTimesheetAllDepartments,
        departmentTimesheetDepartment,
        filteredDepartmentTimesheetSummary,
        departmentTimesheetDepartmentFilter,
        departmentTimesheetDepartmentSummaries,
    ]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const update = () => {
            // Some embedded WebViews can miss matchMedia; avoid crashing Profile on mount.
            if (typeof window.matchMedia !== 'function') {
                setDepartmentTimesheetMobilePicker(false);
                return;
            }
            setDepartmentTimesheetMobilePicker(window.matchMedia('(max-width: 768px)').matches);
        };
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, []);
    useEffect(() => {
        if (!departmentTimesheetAllDepartments) {
            setDepartmentTimesheetDepartmentFilter("all");
            return;
        }
        if (
            departmentTimesheetDepartmentFilter !== "all" &&
            !departmentTimesheetDepartmentOptions.includes(departmentTimesheetDepartmentFilter)
        ) {
            setDepartmentTimesheetDepartmentFilter("all");
        }
    }, [departmentTimesheetAllDepartments, departmentTimesheetDepartmentFilter, departmentTimesheetDepartmentOptions]);
    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            window.localStorage.setItem("haulz.profile.timesheetWideMode", departmentTimesheetWideMode ? "1" : "0");
        } catch {
            // ignore storage access errors
        }
    }, [departmentTimesheetWideMode]);
    const departmentTimesheetContainerStyle = useMemo<CSSProperties | undefined>(() => {
        if (departmentTimesheetMobilePicker || !departmentTimesheetWideMode) return undefined;
        return {
            width: "100vw",
            maxWidth: "100vw",
            marginLeft: "calc(50% - 50vw)",
            marginRight: "calc(50% - 50vw)",
            paddingLeft: "max(1rem, env(safe-area-inset-left))",
            paddingRight: "max(1rem, env(safe-area-inset-right))",
            boxSizing: "border-box",
        };
    }, [departmentTimesheetMobilePicker, departmentTimesheetWideMode]);

    const fetchDepartmentTimesheet = useCallback(async () => {
        if (!activeAccount?.login || !activeAccount?.password) return;
        if (!/^\d{4}-\d{2}$/.test(departmentTimesheetMonth)) return;
        setDepartmentTimesheetLoading(true);
        setDepartmentTimesheetError(null);
        const auth = { login: activeAccount.login, password: activeAccount.password };
        try {
            const data = await postMyDepartmentTimesheet(auth, { month: departmentTimesheetMonth });
            setDepartmentTimesheetDepartment(typeof data.department === "string" ? data.department : "");
            setDepartmentTimesheetAllDepartments(data?.allDepartments === true);
            setDepartmentTimesheetEmployees(Array.isArray(data.employees) ? data.employees : []);
            setDepartmentTimesheetAvailableEmployees(Array.isArray(data.availableEmployees) ? data.availableEmployees : []);
            const loadedEntries: Record<string, string> = {};
            if (data.entries && typeof data.entries === "object") {
                for (const [entryKey, entryValue] of Object.entries(data.entries as Record<string, string>)) {
                    const match = /^(\d+)__(\d{4}-\d{2})-(\d{2})$/.exec(entryKey);
                    if (!match) continue;
                    if (match[2] !== departmentTimesheetMonth) continue;
                    const employeeId = Number(match[1]);
                    const day = Number(match[3]);
                    if (!Number.isFinite(employeeId) || !Number.isFinite(day)) continue;
                    loadedEntries[`${employeeId}:${day}`] = String(entryValue || "");
                }
            }
            setDepartmentTimesheetHours(loadedEntries);
            setDepartmentTimesheetPayoutsByEmployee(
                data?.payoutsByEmployee && typeof data.payoutsByEmployee === "object"
                    ? (data.payoutsByEmployee as Record<string, number>)
                    : {}
            );
            if (data?.payoutsDetailByEmployee && typeof data.payoutsDetailByEmployee === "object") {
                const raw = data.payoutsDetailByEmployee as Record<string, unknown>;
                const next: Record<string, DepartmentTimesheetPayoutRow[]> = {};
                for (const [empId, rows] of Object.entries(raw)) {
                    if (!Array.isArray(rows)) continue;
                    next[empId] = rows
                        .map((r) => {
                            const o = r as Record<string, unknown>;
                            const id = Number(o.id);
                            if (!Number.isFinite(id)) return null;
                            return {
                                id,
                                payoutDate: String(o.payoutDate ?? ""),
                                periodFrom: String(o.periodFrom ?? ""),
                                periodTo: String(o.periodTo ?? ""),
                                amount: Number(o.amount) || 0,
                                taxAmount: Number(o.taxAmount) || 0,
                                cooperationType: String(o.cooperationType ?? ""),
                                paidDates: Array.isArray(o.paidDates) ? o.paidDates.map((x) => String(x)) : [],
                                createdAt: String(o.createdAt ?? ""),
                            };
                        })
                        .filter((x): x is DepartmentTimesheetPayoutRow => x !== null);
                }
                setDepartmentTimesheetPayoutsDetailByEmployee(next);
            } else {
                setDepartmentTimesheetPayoutsDetailByEmployee({});
            }
            setDepartmentTimesheetExpandedEmployeeId(null);
            const paidDayMarks: Record<string, boolean> = {};
            if (data?.paidDatesByEmployee && typeof data.paidDatesByEmployee === "object") {
                for (const [employeeId, dates] of Object.entries(data.paidDatesByEmployee as Record<string, string[]>)) {
                    for (const date of Array.isArray(dates) ? dates : []) {
                        const match = /^\d{4}-\d{2}-(\d{2})$/.exec(String(date || ""));
                        if (!match) continue;
                        const day = Number(match[1]);
                        if (!Number.isFinite(day) || day <= 0) continue;
                        paidDayMarks[`${employeeId}:${day}`] = true;
                    }
                }
            }
            setDepartmentTimesheetPaidDayMarks(paidDayMarks);
            const loadedShiftRateOverrides: Record<string, number> = {};
            if (data?.shiftRateOverrides && typeof data.shiftRateOverrides === "object") {
                for (const [entryKey, entryValue] of Object.entries(data.shiftRateOverrides as Record<string, number>)) {
                    const match = /^(\d+)__(\d{4}-\d{2})-(\d{2})$/.exec(entryKey);
                    if (!match) continue;
                    if (match[2] !== departmentTimesheetMonth) continue;
                    const employeeId = Number(match[1]);
                    const day = Number(match[3]);
                    const rateValue = Number(entryValue);
                    if (!Number.isFinite(employeeId) || !Number.isFinite(day) || !Number.isFinite(rateValue)) continue;
                    loadedShiftRateOverrides[`${employeeId}:${day}`] = Number(rateValue);
                }
            }
            setDepartmentTimesheetShiftRateOverrides(loadedShiftRateOverrides);
        } catch (e) {
            setDepartmentTimesheetError((e as Error)?.message || "Ошибка загрузки табеля");
            setDepartmentTimesheetAllDepartments(false);
            setDepartmentTimesheetEmployees([]);
            setDepartmentTimesheetAvailableEmployees([]);
            setDepartmentTimesheetHours({});
            setDepartmentTimesheetPayoutsByEmployee({});
            setDepartmentTimesheetPayoutsDetailByEmployee({});
            setDepartmentTimesheetExpandedEmployeeId(null);
            setDepartmentTimesheetPaidDayMarks({});
            setDepartmentTimesheetShiftRateOverrides({});
        } finally {
            setDepartmentTimesheetLoading(false);
        }
    }, [activeAccount?.login, activeAccount?.password, departmentTimesheetMonth]);
    const saveDepartmentTimesheetCell = useCallback(async (employeeId: number, day: number, value: string) => {
        if (!activeAccount?.login || !activeAccount?.password) return;
        if (!/^\d{4}-\d{2}$/.test(departmentTimesheetMonth)) return;
        if (!departmentTimesheetIsEditableMonth) {
            setDepartmentTimesheetError('Редактирование доступно только для текущего, предыдущего месяца и декабря 2025.');
            return;
        }
        const dayNormalized = String(day).padStart(2, "0");
        const dateIso = `${departmentTimesheetMonth}-${dayNormalized}`;
        const auth = { login: activeAccount.login, password: activeAccount.password };
        try {
            await patchMyDepartmentTimesheet(auth, {
                month: departmentTimesheetMonth,
                employeeId,
                date: dateIso,
                value,
            });
        } catch (e) {
            setDepartmentTimesheetError((e as Error)?.message || "Ошибка сохранения табеля");
        }
    }, [activeAccount?.login, activeAccount?.password, departmentTimesheetMonth, departmentTimesheetIsEditableMonth]);
    const saveDepartmentTimesheetShiftRate = useCallback(async (employeeId: number, day: number, shiftRate: string) => {
        if (!activeAccount?.login || !activeAccount?.password) return;
        if (!/^\d{4}-\d{2}$/.test(departmentTimesheetMonth)) return;
        if (!departmentTimesheetIsEditableMonth) {
            setDepartmentTimesheetError('Редактирование доступно только для текущего, предыдущего месяца и декабря 2025.');
            return;
        }
        const dayNormalized = String(day).padStart(2, "0");
        const dateIso = `${departmentTimesheetMonth}-${dayNormalized}`;
        const auth = { login: activeAccount.login, password: activeAccount.password };
        try {
            await patchMyDepartmentTimesheet(auth, {
                month: departmentTimesheetMonth,
                employeeId,
                date: dateIso,
                shiftRate: shiftRate.trim() === '' ? null : Number(shiftRate),
            });
        } catch (e) {
            setDepartmentTimesheetError((e as Error)?.message || "Ошибка сохранения стоимости смены");
            await fetchDepartmentTimesheet();
        }
    }, [activeAccount?.login, activeAccount?.password, departmentTimesheetMonth, departmentTimesheetIsEditableMonth, fetchDepartmentTimesheet]);

    const removeDepartmentEmployeeFromMonth = useCallback(async (employeeId: number) => {
        if (!activeAccount?.login || !activeAccount?.password) return;
        if (!departmentTimesheetIsEditableMonth) {
            setDepartmentTimesheetError('Редактирование доступно только для текущего, предыдущего месяца и декабря 2025.');
            return;
        }
        const auth = { login: activeAccount.login, password: activeAccount.password };
        const confirmed = typeof window !== 'undefined' ? window.confirm('Удалить сотрудника из табеля выбранного месяца?') : true;
        if (!confirmed) return;
        try {
            await deleteMyDepartmentTimesheet(auth, {
                month: departmentTimesheetMonth,
                employeeId,
            });
            await fetchDepartmentTimesheet();
        } catch (e) {
            setDepartmentTimesheetError((e as Error)?.message || 'Ошибка удаления сотрудника из месяца');
        }
    }, [activeAccount?.login, activeAccount?.password, departmentTimesheetMonth, departmentTimesheetIsEditableMonth, fetchDepartmentTimesheet]);

    const addExistingDepartmentTimesheetEmployee = useCallback(async () => {
        if (!activeAccount?.login || !activeAccount?.password) return;
        if (!departmentTimesheetIsEditableMonth) {
            setDepartmentTimesheetError('Редактирование доступно только для текущего, предыдущего месяца и декабря 2025.');
            return;
        }
        const selectedId = Number(departmentTimesheetSelectedEmployeeId);
        if (!Number.isFinite(selectedId) || selectedId <= 0) {
            setDepartmentTimesheetError('Выберите сотрудника из списка');
            return;
        }
        const auth = { login: activeAccount.login, password: activeAccount.password };
        setDepartmentTimesheetEmployeeSaving(true);
        setDepartmentTimesheetError(null);
        try {
            await putMyDepartmentTimesheet(auth, {
                month: departmentTimesheetMonth,
                existingEmployeeId: selectedId,
            });
            setDepartmentTimesheetSelectedEmployeeId("");
            await fetchDepartmentTimesheet();
        } catch (e) {
            setDepartmentTimesheetError((e as Error)?.message || 'Ошибка добавления сотрудника');
        } finally {
            setDepartmentTimesheetEmployeeSaving(false);
        }
    }, [activeAccount?.login, activeAccount?.password, departmentTimesheetMonth, departmentTimesheetIsEditableMonth, departmentTimesheetSelectedEmployeeId, fetchDepartmentTimesheet]);

    const addDepartmentTimesheetEmployee = useCallback(async () => {
        if (!activeAccount?.login || !activeAccount?.password) return;
        if (!departmentTimesheetIsEditableMonth) {
            setDepartmentTimesheetError('Редактирование доступно только для текущего, предыдущего месяца и декабря 2025.');
            return;
        }
        if (!departmentTimesheetEmployeeFullName.trim()) {
            setDepartmentTimesheetError('Укажите ФИО');
            return;
        }
        const rate = Number(departmentTimesheetEmployeeAccrualRate);
        if (!Number.isFinite(rate) || rate < 0) {
            setDepartmentTimesheetError('Укажите корректную ставку');
            return;
        }
        const auth = { login: activeAccount.login, password: activeAccount.password };
        setDepartmentTimesheetEmployeeSaving(true);
        setDepartmentTimesheetError(null);
        try {
            await putMyDepartmentTimesheet(auth, {
                month: departmentTimesheetMonth,
                fullName: departmentTimesheetEmployeeFullName.trim(),
                department: departmentTimesheetDepartment,
                position: departmentTimesheetEmployeePosition.trim(),
                accrualType: departmentTimesheetEmployeeAccrualType,
                accrualRate: rate,
                cooperationType: departmentTimesheetEmployeeCooperationType,
                employeeRole: 'employee',
            });
            setDepartmentTimesheetEmployeeFullName("");
            setDepartmentTimesheetEmployeePosition("");
            setDepartmentTimesheetEmployeeAccrualType("hour");
            setDepartmentTimesheetEmployeeAccrualRate("0");
            setDepartmentTimesheetEmployeeCooperationType("staff");
            await fetchDepartmentTimesheet();
        } catch (e) {
            setDepartmentTimesheetError((e as Error)?.message || 'Ошибка добавления сотрудника');
        } finally {
            setDepartmentTimesheetEmployeeSaving(false);
        }
    }, [
        activeAccount?.login,
        activeAccount?.password,
        departmentTimesheetMonth,
        departmentTimesheetIsEditableMonth,
        departmentTimesheetEmployeeFullName,
        departmentTimesheetDepartment,
        departmentTimesheetEmployeePosition,
        departmentTimesheetEmployeeAccrualType,
        departmentTimesheetEmployeeAccrualRate,
        departmentTimesheetEmployeeCooperationType,
        fetchDepartmentTimesheet,
    ]);

    useEffect(() => {
        if (fetchEnabled && activeAccount?.login) void fetchDepartmentTimesheet();
    }, [fetchEnabled, activeAccount?.login, fetchDepartmentTimesheet]);

    return {
        departmentTimesheetDepartment,
        setDepartmentTimesheetDepartment,
        departmentTimesheetAllDepartments,
        departmentTimesheetDepartmentFilter,
        setDepartmentTimesheetDepartmentFilter,
        departmentTimesheetEmployees,
        departmentTimesheetAvailableEmployees,
        departmentTimesheetSelectedEmployeeId,
        setDepartmentTimesheetSelectedEmployeeId,
        departmentTimesheetLoading,
        departmentTimesheetError,
        setDepartmentTimesheetError,
        departmentTimesheetSearch,
        setDepartmentTimesheetSearch,
        departmentTimesheetManageExpanded,
        setDepartmentTimesheetManageExpanded,
        departmentTimesheetMonth,
        setDepartmentTimesheetMonth,
        departmentTimesheetIsEditableMonth,
        departmentTimesheetHours,
        setDepartmentTimesheetHours,
        departmentTimesheetPayoutsByEmployee,
        departmentTimesheetPaidDayMarks,
        departmentTimesheetPayoutsDetailByEmployee,
        departmentTimesheetExpandedEmployeeId,
        setDepartmentTimesheetExpandedEmployeeId,
        departmentTimesheetShiftRateOverrides,
        setDepartmentTimesheetShiftRateOverrides,
        departmentTimesheetMobilePicker,
        departmentTimesheetWideMode,
        setDepartmentTimesheetWideMode,
        sortedDepartmentTimesheetEmployees,
        departmentTimesheetDepartmentOptions,
        filteredDepartmentTimesheetEmployees,
        departmentTimesheetEmployeeFullName,
        setDepartmentTimesheetEmployeeFullName,
        departmentTimesheetEmployeePosition,
        setDepartmentTimesheetEmployeePosition,
        departmentTimesheetEmployeeAccrualType,
        setDepartmentTimesheetEmployeeAccrualType,
        departmentTimesheetEmployeeAccrualRate,
        setDepartmentTimesheetEmployeeAccrualRate,
        departmentTimesheetEmployeeCooperationType,
        setDepartmentTimesheetEmployeeCooperationType,
        departmentTimesheetEmployeeSaving,
        departmentShiftPicker,
        setDepartmentShiftPicker,
        departmentShiftHoldTimerRef,
        departmentShiftHoldTriggeredRef,
        departmentTimesheetMonthlyEstimate,
        departmentTimesheetHalfHourOptions,
        departmentTimesheetDays,
        departmentTimesheetWeekdayByDay,
        departmentTimesheetDepartmentSummaries,
        companyTimesheetSummary,
        filteredDepartmentTimesheetSummary,
        visibleDepartmentTimesheetSummaries,
        departmentTimesheetContainerStyle,
        fetchDepartmentTimesheet,
        saveDepartmentTimesheetCell,
        saveDepartmentTimesheetShiftRate,
        removeDepartmentEmployeeFromMonth,
        addExistingDepartmentTimesheetEmployee,
        addDepartmentTimesheetEmployee,
    };
}

export type DepartmentTimesheetState = ReturnType<typeof useDepartmentTimesheet>;

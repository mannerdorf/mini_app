import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
    LogOut, Loader2, Check, Moon, Sun, Eye, EyeOff, User as UserIcon, Users, ChevronDown,
    Building2, Bell, Shield, Settings, Info, ArrowLeft, Plus, Trash2, MessageCircle, FileText, LayoutGrid, Mic, Receipt,
} from "lucide-react";
import { Button, Flex, Grid, Input, Panel, Switch, Typography } from "@maxhub/max-ui";
import type { Account, AuthData, ProfileView } from "../types";
import { getWebApp } from "../webApp";
import { TapSwitch } from "../components/TapSwitch";
import { AiChatProfilePage } from "./AiChatProfilePage";
import { CompaniesListPage } from "./CompaniesListPage";
import { CompaniesPage } from "./CompaniesPage";
import { AddCompanyByINNPage } from "./AddCompanyByINNPage";
import { AddCompanyByLoginPage } from "./AddCompanyByLoginPage";
import { TinyUrlTestPage } from "./TinyUrlTestPage";
import { AboutCompanyPage } from "./AboutCompanyPage";
import { NotificationsPage } from "./NotificationsPage";
import { AisStreamPage } from "./AisStreamPage";
import { getCurrentMonthYm } from "../lib/dateUtils";
import type { DepartmentTimesheetPayoutRow } from "./profile/departmentTimesheetTypes";
import { ProfileTwoFactorSection } from "../components/profile/ProfileTwoFactorSection";
import { ProfilePasswordSection } from "../components/profile/ProfilePasswordSection";
import { ProfileVoiceAssistantsSection } from "../components/profile/ProfileVoiceAssistantsSection";
import { ProfileFaqSection } from "../components/profile/ProfileFaqSection";
import { ProfileRolesSection } from "../components/profile/ProfileRolesSection";
import { ProfileHaulzSection } from "../components/profile/ProfileHaulzSection";
import { ProfileParcelScannerSection } from "../components/profile/ProfileParcelScannerSection";
import { ProfileExpenseRequestsSection } from "../components/profile/ProfileExpenseRequestsSection";
import { cargoListContainerVariants, cargoListItemVariants, cargoSummaryMotion } from "./cargoMotion";

export function ProfilePage({
    accounts,
    activeAccountId,
    onSwitchAccount,
    onAddAccount,
    onRemoveAccount,
    onOpenOffer,
    onOpenPersonalConsent,
    onOpenNotifications,
    onOpenCargo,
    onOpenDocumentsWithSection,
    aisOpenWithMmsi,
    setAisOpenWithMmsi,
    onOpenTelegramBot,
    onOpenMaxBot,
    onUpdateAccount,
    onOpenWildberries,
    profileSaasShellActive = false,
}: {
    accounts: Account[];
    activeAccountId: string | null;
    onSwitchAccount: (accountId: string) => void;
    onAddAccount: (login: string, password: string) => Promise<void>;
    onRemoveAccount: (accountId: string) => void;
    onOpenOffer: () => void;
    onOpenPersonalConsent: () => void;
    onOpenNotifications: () => void;
    onOpenCargo: (cargoNumber: string) => void;
    onOpenDocumentsWithSection?: (section: string) => void;
    aisOpenWithMmsi?: string | null;
    setAisOpenWithMmsi?: (value: string | null) => void;
    onOpenTelegramBot?: () => Promise<void>;
    onOpenMaxBot?: () => Promise<void>;
    onUpdateAccount: (accountId: string, patch: Partial<Account>) => void;
    onOpenWildberries?: () => void;
    /** Активна оболочка «мягкая панель» (суперадмин или право haulz). */
    profileSaasShellActive?: boolean;
}) {
    const [currentView, setCurrentView] = useState<ProfileView>('main');
    const activeAccount = accounts.find(acc => acc.id === activeAccountId) || null;
    const prefersReducedMotion = useReducedMotion();
    const profileMotionEnabled = prefersReducedMotion !== true;
    const shellMotion = profileSaasShellActive && profileMotionEnabled;
    useEffect(() => {
        if (aisOpenWithMmsi) {
            setCurrentView('ais');
        }
    }, [aisOpenWithMmsi]);
    const [employeesList, setEmployeesList] = useState<{ id: number; login: string; active: boolean; createdAt: string; presetLabel: string; fullName?: string; department?: string; employeeRole?: "employee" | "department_head" }[]>([]);
    const [employeesLoading, setEmployeesLoading] = useState(false);
    const [employeesError, setEmployeesError] = useState<string | null>(null);
    const [rolePresets, setRolePresets] = useState<{ id: string; label: string }[]>([]);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteFullName, setInviteFullName] = useState('');
    const [invitePresetId, setInvitePresetId] = useState('');
    const [inviteLoading, setInviteLoading] = useState(false);
    const [inviteError, setInviteError] = useState<string | null>(null);
    const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
    const [employeeDeleteId, setEmployeeDeleteId] = useState<number | null>(null);
    const [employeeDeleteLoading, setEmployeeDeleteLoading] = useState(false);
    const [employeePresetLoadingId, setEmployeePresetLoadingId] = useState<number | null>(null);
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
    const WORK_DAYS_IN_MONTH = 21;
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
    type ShiftMarkCode = typeof SHIFT_MARK_OPTIONS[number]["code"];
    const [departmentShiftPicker, setDepartmentShiftPicker] = useState<{ key: string; employeeId: number; day: number; x: number; y: number; isShift: boolean } | null>(null);
    const departmentShiftHoldTimerRef = useRef<number | null>(null);

    const [accountingRequestsItems, setAccountingRequestsItems] = useState<Array<{ id: string; createdAt: string; department: string; docNumber?: string; docDate?: string; period?: string; categoryName: string; amount: number; comment: string; vehicleOrEmployee: string; status: string; login: string; attachments?: Array<{ id: number; fileName: string; mimeType: string | null }> }>>([]);
    const [selectedAccountingRequest, setSelectedAccountingRequest] = useState<typeof accountingRequestsItems[0] | null>(null);
    const [accountingRequestsLoading, setAccountingRequestsLoading] = useState(false);
    const [accountingRequestsError, setAccountingRequestsError] = useState<string | null>(null);
    const [accountingSubsection, setAccountingSubsection] = useState<"expense_requests" | "sverki" | "claims">("expense_requests");
    const [accountingClaimsItems, setAccountingClaimsItems] = useState<Array<{
        id: number;
        claimNumber?: string;
        cargoNumber?: string;
        description?: string;
        requestedAmount?: number;
        approvedAmount?: number;
        status?: string;
        slaDueAt?: string | null;
        createdAt?: string;
    }>>([]);
    const [accountingClaimsLoading, setAccountingClaimsLoading] = useState(false);
    const [accountingClaimsError, setAccountingClaimsError] = useState<string | null>(null);
    const [accountingClaimsView, setAccountingClaimsView] = useState<"new" | "in_progress" | "all">("all");
    const [accountingClaimsSearch, setAccountingClaimsSearch] = useState("");
    const [accountingClaimsStatusFilter, setAccountingClaimsStatusFilter] = useState("");
    const [sverkiRequests, setSverkiRequests] = useState<Array<{ id: number; login: string; customerInn: string; contract: string; periodFrom: string; periodTo: string; status: string; createdAt: string }>>([]);
    const [sverkiRequestsLoading, setSverkiRequestsLoading] = useState(false);
    const [sverkiRequestsUpdatingId, setSverkiRequestsUpdatingId] = useState<number | null>(null);
    const departmentShiftHoldTriggeredRef = useRef(false);
    const normalizeShiftMark = (rawValue: string): ShiftMarkCode | "" => {
        const raw = String(rawValue || "").trim().toUpperCase();
        if (!raw) return "";
        if (raw === "Я") return "Я";
        if (raw === "ПР") return "ПР";
        if (raw === "Б") return "Б";
        if (raw === "В") return "В";
        if (raw === "ОГ") return "ОГ";
        if (raw === "ОТ") return "ОТ";
        if (raw === "УВ") return "УВ";
        // Backward compatibility with old shift markers.
        if (raw === "С" || raw === "C" || raw === "1" || raw === "TRUE") return "Я";
        return "";
    };
    const getShiftMarkStyle = (mark: ShiftMarkCode | "") => {
        const option = SHIFT_MARK_OPTIONS.find((x) => x.code === mark);
        if (!option) {
            return { border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text-secondary)" };
        }
        return { border: `1px solid ${option.border}`, background: option.bg, color: option.color };
    };
    const normalizeDepartmentAccrualType = (value: unknown): "hour" | "shift" | "month" => {
        const raw = String(value || '').trim().toLowerCase();
        if (!raw) return "hour";
        if (raw === "month" || raw === "месяц" || raw === "monthly" || raw.includes("month") || raw.includes("месяц")) return "month";
        if (raw === "shift" || raw === "смена" || raw.includes("shift") || raw.includes("смен")) return "shift";
        return "hour";
    };
    const isShiftAccrual = (value: string) => {
        return normalizeDepartmentAccrualType(value) === "shift";
    };
    const getDayRateByAccrualType = (rate: number, accrualType: "hour" | "shift" | "month") => {
        return accrualType === "month" ? rate / WORK_DAYS_IN_MONTH : rate;
    };
    const departmentTimesheetMonthlyEstimate = useMemo(() => {
        const rate = Number(String(departmentTimesheetEmployeeAccrualRate || '').replace(',', '.'));
        if (!Number.isFinite(rate) || rate < 0) return 0;
        if (departmentTimesheetEmployeeAccrualType === "month") return rate;
        return departmentTimesheetEmployeeAccrualType === 'shift' ? rate * WORK_DAYS_IN_MONTH : rate * 8 * WORK_DAYS_IN_MONTH;
    }, [departmentTimesheetEmployeeAccrualRate, departmentTimesheetEmployeeAccrualType]);
    const toHalfHourValue = (raw: string) => {
        const parsed = Number(String(raw || '').replace(',', '.'));
        if (!Number.isFinite(parsed)) return '0.0';
        const normalized = Math.max(0, Math.min(24, parsed));
        return (Math.round(normalized * 2) / 2).toFixed(1);
    };
    const parseHourValue = (rawValue: string): number => {
        const raw = String(rawValue || '').trim();
        if (!raw) return 0;
        const hhmm = raw.match(/^(\d{1,2}):(\d{2})$/);
        if (hhmm) {
            const h = Number(hhmm[1]);
            const m = Number(hhmm[2]);
            if (Number.isFinite(h) && Number.isFinite(m) && m >= 0 && m < 60) return h + m / 60;
        }
        const parsed = Number(raw.replace(',', '.'));
        return Number.isFinite(parsed) ? parsed : 0;
    };
    const getHourlyCellMark = (rawValue: string): ShiftMarkCode | "" => {
        const mark = normalizeShiftMark(rawValue);
        if (mark) return mark;
        return parseHourValue(rawValue) > 0 ? "Я" : "В";
    };
    const departmentTimesheetHalfHourOptions = useMemo(() => {
        return Array.from({ length: 49 }, (_, idx) => {
            const hours = Math.floor(idx / 2);
            const mins = idx % 2 === 0 ? '00' : '30';
            const value = (idx * 0.5).toFixed(1);
            return { value, label: `${hours}:${mins}` };
        });
    }, []);

    const COOPERATION_TYPE_OPTIONS = [
        { value: "self_employed", label: "Самозанятость" },
        { value: "ip", label: "ИП" },
        { value: "staff", label: "Штатный сотрудник" },
    ] as const;
    const cooperationTypeLabel = (value?: string) => {
        if (value === "self_employed") return "Самозанятость";
        if (value === "ip") return "ИП";
        return "Штатный сотрудник";
    };

    const fetchEmployeesAndPresets = useCallback(async () => {
        if (!activeAccount?.login) return;
        setEmployeesLoading(true);
        setEmployeesError(null);
        const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
        try {
            // Пресеты ролей — без авторизации, загружаем всегда (чтобы выпадающий список ролей появлялся)
            const presetsRes = await fetch(`${origin}/api/role-presets`);
            const presetsData = await presetsRes.json().catch(() => ({}));
            if (presetsRes.ok && Array.isArray(presetsData.presets)) {
                setRolePresets(presetsData.presets.map((p: { id: string; label: string }) => ({ id: String(p.id), label: p.label || '' })));
            }

            if (!activeAccount?.password) {
                setEmployeesList([]);
                return;
            }
            const listRes = await fetch(`${origin}/api/my-employees`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ login: activeAccount.login, password: activeAccount.password }),
            });
            const listData = await listRes.json().catch(() => ({}));
            if (listRes.ok && listData.employees) setEmployeesList(listData.employees);
            else setEmployeesError(listData.error || 'Ошибка загрузки');
        } catch {
            setEmployeesError('Ошибка сети');
        } finally {
            setEmployeesLoading(false);
        }
    }, [activeAccount?.login, activeAccount?.password]);

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
    const departmentTimesheetContainerStyle = useMemo<React.CSSProperties | undefined>(() => {
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
        const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
        try {
            const res = await fetch(`${origin}/api/my-department-timesheet`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ login: activeAccount.login, password: activeAccount.password, month: departmentTimesheetMonth }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setDepartmentTimesheetError(data.error || "Ошибка загрузки табеля");
                setDepartmentTimesheetAllDepartments(false);
                setDepartmentTimesheetEmployees([]);
                setDepartmentTimesheetAvailableEmployees([]);
                setDepartmentTimesheetHours({});
                setDepartmentTimesheetPayoutsByEmployee({});
                setDepartmentTimesheetPayoutsDetailByEmployee({});
                setDepartmentTimesheetExpandedEmployeeId(null);
                setDepartmentTimesheetPaidDayMarks({});
                setDepartmentTimesheetShiftRateOverrides({});
                return;
            }
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
        } catch {
            setDepartmentTimesheetError("Ошибка сети");
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

    const fetchAccountingRequests = useCallback(async () => {
        if (!activeAccount?.login || !activeAccount?.password || activeAccount?.permissions?.accounting !== true) return;
        setAccountingRequestsLoading(true);
        setAccountingRequestsError(null);
        const origin = typeof window !== "undefined" && window.location?.origin ? window.location.origin : "";
        try {
            const res = await fetch(`${origin}/api/accounting-expense-requests`, {
                method: "GET",
                headers: {
                    "x-login": activeAccount.login,
                    "x-password": activeAccount.password,
                },
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setAccountingRequestsError(data.error || "Ошибка загрузки заявок");
                setAccountingRequestsItems([]);
                return;
            }
            const items = Array.isArray(data.items)
                ? data.items.map((r: any) => ({
                    id: String(r.id ?? ""),
                    createdAt: r.createdAt ?? "",
                    department: r.department ?? "",
                    docNumber: r.docNumber,
                    docDate: r.docDate,
                    period: r.period,
                    categoryName: r.categoryName ?? r.categoryId ?? "",
                    amount: Number(r.amount) || 0,
                    comment: r.comment ?? "",
                    vehicleOrEmployee: r.vehicleOrEmployee ?? "",
                    status: r.status ?? "",
                    login: r.login ?? "",
                    attachments: Array.isArray(r.attachments) ? r.attachments : [],
                }))
                : [];
            setAccountingRequestsItems(items);
        } catch {
            setAccountingRequestsError("Ошибка сети");
            setAccountingRequestsItems([]);
        } finally {
            setAccountingRequestsLoading(false);
        }
    }, [activeAccount?.login, activeAccount?.password, activeAccount?.permissions?.accounting]);

    const fetchSverkiRequests = useCallback(async () => {
        if (!activeAccount?.login || !activeAccount?.password || activeAccount?.permissions?.accounting !== true) return;
        setSverkiRequestsLoading(true);
        const origin = typeof window !== "undefined" && window.location?.origin ? window.location.origin : "";
        try {
            const res = await fetch(`${origin}/api/accounting-sverki-requests`, {
                method: "GET",
                headers: { "x-login": activeAccount.login, "x-password": activeAccount.password },
            });
            const data = await res.json().catch(() => ({}));
            setSverkiRequests(Array.isArray(data?.requests) ? data.requests : []);
        } catch {
            setSverkiRequests([]);
        } finally {
            setSverkiRequestsLoading(false);
        }
    }, [activeAccount?.login, activeAccount?.password, activeAccount?.permissions?.accounting]);

    const markSverkiRequestAsSent = useCallback(async (id: number) => {
        if (!activeAccount?.login || !activeAccount?.password) return;
        setSverkiRequestsUpdatingId(id);
        const origin = typeof window !== "undefined" && window.location?.origin ? window.location.origin : "";
        try {
            const res = await fetch(`${origin}/api/accounting-sverki-requests`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-login": activeAccount.login, "x-password": activeAccount.password },
                body: JSON.stringify({ id, status: "edo_sent" }),
            });
            if (res.ok) {
                setSverkiRequests((prev) => prev.map((r) => r.id === id ? { ...r, status: "edo_sent", updatedAt: new Date().toISOString() } as any : r));
            }
        } finally {
            setSverkiRequestsUpdatingId(null);
        }
    }, [activeAccount?.login, activeAccount?.password]);

    const deleteSverkiRequest = useCallback(async (id: number) => {
        if (!window.confirm("Удалить заявку акта сверки? Действие нельзя отменить.")) return;
        if (!activeAccount?.login || !activeAccount?.password) return;
        setSverkiRequestsUpdatingId(id);
        const origin = typeof window !== "undefined" && window.location?.origin ? window.location.origin : "";
        try {
            const res = await fetch(`${origin}/api/accounting-sverki-requests?id=${id}`, {
                method: "DELETE",
                headers: { "x-login": activeAccount.login, "x-password": activeAccount.password },
            });
            if (res.ok) setSverkiRequests((prev) => prev.filter((r) => r.id !== id));
        } finally {
            setSverkiRequestsUpdatingId(null);
        }
    }, [activeAccount?.login, activeAccount?.password]);

    const CLAIM_STATUS_LABELS: Record<string, string> = {
        draft: "Черновик",
        new: "Новая",
        under_review: "На рассмотрении",
        waiting_docs: "Ожидает документы",
        in_progress: "В работе",
        awaiting_leader: "Ожидает решения руководителя",
        sent_to_accounting: "Передана в бухгалтерию",
        approved: "Удовлетворена",
        rejected: "Отказ",
        paid: "Выплачено",
        offset: "Зачтено",
        closed: "Закрыта",
    };
    const CLAIM_STATUS_BADGE: Record<string, { bg: string; color: string }> = {
        draft: { bg: "rgba(107,114,128,0.15)", color: "#6b7280" },
        new: { bg: "rgba(107,114,128,0.15)", color: "#6b7280" },
        under_review: { bg: "rgba(245,158,11,0.18)", color: "#b45309" },
        waiting_docs: { bg: "rgba(245,158,11,0.18)", color: "#b45309" },
        in_progress: { bg: "rgba(59,130,246,0.15)", color: "#2563eb" },
        awaiting_leader: { bg: "rgba(59,130,246,0.15)", color: "#2563eb" },
        sent_to_accounting: { bg: "rgba(59,130,246,0.15)", color: "#2563eb" },
        approved: { bg: "rgba(16,185,129,0.15)", color: "#059669" },
        paid: { bg: "rgba(16,185,129,0.15)", color: "#059669" },
        offset: { bg: "rgba(16,185,129,0.15)", color: "#059669" },
        rejected: { bg: "rgba(239,68,68,0.15)", color: "#dc2626" },
        closed: { bg: "rgba(107,114,128,0.15)", color: "#6b7280" },
    };
    const reloadAccountingClaims = useCallback(async () => {
        if (!activeAccount?.login || !activeAccount?.password || activeAccount?.permissions?.accounting !== true) return;
        setAccountingClaimsLoading(true);
        setAccountingClaimsError(null);
        const params = new URLSearchParams();
        const q = accountingClaimsSearch.trim();
        if (q) params.set("q", q);
        if (accountingClaimsStatusFilter) {
            params.set("status", accountingClaimsStatusFilter);
        } else if (accountingClaimsView === "new") {
            params.set("status", "new");
        }
        const selectedInn = String(activeAccount.activeCustomerInn || activeAccount.inn || "").trim();
        if (selectedInn) params.set("inn", selectedInn);
        const origin = typeof window !== "undefined" && window.location?.origin ? window.location.origin : "";
        try {
            const res = await fetch(`${origin}/api/claims${params.toString() ? `?${params.toString()}` : ""}`, {
                method: "GET",
                headers: {
                    "x-login": activeAccount.login,
                    "x-password": activeAccount.password,
                    "x-inn": selectedInn,
                },
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setAccountingClaimsItems([]);
                setAccountingClaimsError(data?.error || "Ошибка загрузки претензий");
                return;
            }
            const items = Array.isArray(data?.claims) ? data.claims : [];
            setAccountingClaimsItems(items);
        } catch {
            setAccountingClaimsItems([]);
            setAccountingClaimsError("Ошибка сети");
        } finally {
            setAccountingClaimsLoading(false);
        }
    }, [
        activeAccount?.activeCustomerInn,
        activeAccount?.inn,
        activeAccount?.login,
        activeAccount?.password,
        activeAccount?.permissions?.accounting,
        accountingClaimsSearch,
        accountingClaimsStatusFilter,
        accountingClaimsView,
    ]);

    useEffect(() => {
        if (currentView === "accounting" && activeAccount?.permissions?.accounting === true) {
            void fetchAccountingRequests();
        }
    }, [currentView, activeAccount?.permissions?.accounting, fetchAccountingRequests]);

    useEffect(() => {
        if (currentView === "accounting" && accountingSubsection === "sverki" && activeAccount?.permissions?.accounting === true) {
            void fetchSverkiRequests();
        }
    }, [currentView, accountingSubsection, activeAccount?.permissions?.accounting, fetchSverkiRequests]);
    useEffect(() => {
        if (currentView === "accounting" && accountingSubsection === "claims" && activeAccount?.permissions?.accounting === true) {
            void reloadAccountingClaims();
        }
    }, [currentView, accountingSubsection, activeAccount?.permissions?.accounting, reloadAccountingClaims]);

    const saveDepartmentTimesheetCell = useCallback(async (employeeId: number, day: number, value: string) => {
        if (!activeAccount?.login || !activeAccount?.password) return;
        if (!/^\d{4}-\d{2}$/.test(departmentTimesheetMonth)) return;
        if (!departmentTimesheetIsEditableMonth) {
            setDepartmentTimesheetError('Редактирование доступно только для текущего, предыдущего месяца и декабря 2025.');
            return;
        }
        const dayNormalized = String(day).padStart(2, "0");
        const dateIso = `${departmentTimesheetMonth}-${dayNormalized}`;
        const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
        try {
            const res = await fetch(`${origin}/api/my-department-timesheet`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    login: activeAccount.login,
                    password: activeAccount.password,
                    month: departmentTimesheetMonth,
                    employeeId,
                    date: dateIso,
                    value,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Ошибка сохранения табеля");
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
        const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
        try {
            const res = await fetch(`${origin}/api/my-department-timesheet`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    login: activeAccount.login,
                    password: activeAccount.password,
                    month: departmentTimesheetMonth,
                    employeeId,
                    date: dateIso,
                    shiftRate: shiftRate.trim() === '' ? null : Number(shiftRate),
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Ошибка сохранения стоимости смены");
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
        const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
        const confirmed = typeof window !== 'undefined' ? window.confirm('Удалить сотрудника из табеля выбранного месяца?') : true;
        if (!confirmed) return;
        try {
            const res = await fetch(`${origin}/api/my-department-timesheet`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    login: activeAccount.login,
                    password: activeAccount.password,
                    month: departmentTimesheetMonth,
                    employeeId,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Ошибка удаления сотрудника из месяца');
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
        const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
        setDepartmentTimesheetEmployeeSaving(true);
        setDepartmentTimesheetError(null);
        try {
            const res = await fetch(`${origin}/api/my-department-timesheet`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    login: activeAccount.login,
                    password: activeAccount.password,
                    month: departmentTimesheetMonth,
                    existingEmployeeId: selectedId,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Ошибка добавления сотрудника');
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
        const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
        setDepartmentTimesheetEmployeeSaving(true);
        setDepartmentTimesheetError(null);
        try {
            const res = await fetch(`${origin}/api/my-department-timesheet`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    login: activeAccount.login,
                    password: activeAccount.password,
                    month: departmentTimesheetMonth,
                    fullName: departmentTimesheetEmployeeFullName.trim(),
                    department: departmentTimesheetDepartment,
                    position: departmentTimesheetEmployeePosition.trim(),
                    accrualType: departmentTimesheetEmployeeAccrualType,
                    accrualRate: rate,
                    cooperationType: departmentTimesheetEmployeeCooperationType,
                    employeeRole: 'employee',
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Ошибка добавления сотрудника');
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
        if ((currentView === 'employees' || currentView === 'haulz') && activeAccount?.login) void fetchEmployeesAndPresets();
    }, [currentView, activeAccount?.login, fetchEmployeesAndPresets]);

    useEffect(() => {
        if (currentView === 'departmentTimesheet' && activeAccount?.login) void fetchDepartmentTimesheet();
    }, [currentView, activeAccount?.login, fetchDepartmentTimesheet]);

    // Настройки
    const settingsItems = [
        { 
            id: 'companies', 
            label: 'Мои компании', 
            icon: <Building2 className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />,
            onClick: () => setCurrentView('companies')
        },
        { 
            id: 'roles', 
            label: 'Роли', 
            icon: <UserIcon className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />,
            onClick: () => setCurrentView('roles')
        },
        {
            id: 'parcelScanner',
            label: 'Сканер посылки',
            icon: <Receipt className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />,
            onClick: () => setCurrentView('parcelScanner')
        },
        ...((activeAccount?.isSuperAdmin || activeAccount?.permissions?.haulz === true) ? [{
            id: 'haulz',
            label: 'HAULZ',
            icon: <LayoutGrid className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />,
            onClick: () => setCurrentView('haulz')
        }] : []),
        ...(activeAccount?.isRegisteredUser && activeAccount?.inCustomerDirectory === true ? [
        ...(activeAccount?.permissions?.supervisor === true ? [{
            id: 'employees',
            label: 'Справочник сотрудников',
            icon: <Users className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />,
            onClick: () => setCurrentView('employees')
        }] : [])
        ] : []),
        ...(!!activeAccount?.isRegisteredUser && activeAccount?.permissions?.service_mode === true ? [
        { 
            id: 'voiceAssistants', 
            label: 'Голосовые помощники', 
            icon: <Mic className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />,
            onClick: () => setCurrentView('voiceAssistants')
        },
        ] : []),
        ...(activeAccount?.permissions?.chat === true ? [{
            id: 'chat' as const,
            label: 'Чат с Грузиком',
            icon: <MessageCircle className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />,
            onClick: () => setCurrentView('chat')
        }] : []),
        { 
            id: 'notifications', 
            label: 'Уведомления', 
            icon: <Bell className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />,
            onClick: () => setCurrentView('notifications')
        },
    ];


    // Информация
    const infoItems = [
        { 
            id: 'about', 
            label: 'О компании', 
            icon: <Info className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />,
            onClick: () => setCurrentView('about')
        },
        { 
            id: 'faq', 
            label: 'FAQ', 
            icon: <MessageCircle className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />,
            onClick: () => setCurrentView('faq')
        },
        { 
            id: 'offer', 
            label: 'Публичная оферта', 
            icon: <FileText className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />,
            onClick: () => onOpenOffer()
        },
        { 
            id: 'consent', 
            label: 'Согласие на обработку персональных данных', 
            icon: <Shield className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />,
            onClick: () => onOpenPersonalConsent()
        },
    ];
    
    if (currentView === 'chat') {
        const auth: AuthData | null = activeAccount ? {
            login: activeAccount.login,
            password: activeAccount.password,
            inn: activeAccount.activeCustomerInn ?? activeAccount.customers?.[0]?.inn,
            ...(activeAccount.isRegisteredUser === true ? { isRegisteredUser: true } : {}),
        } : null;
        const webApp = typeof window !== "undefined" ? getWebApp() : undefined;
        const chatIdFromWebApp = webApp?.initDataUnsafe?.chat?.id;
        const chatId = chatIdFromWebApp != null ? String(chatIdFromWebApp) : null;
        return (
            <AiChatProfilePage
                onBack={() => setCurrentView('main')}
                auth={auth}
                accountId={activeAccountId}
                customer={activeAccount?.customer ?? activeAccount?.customers?.[0]?.name ?? null}
                onOpenCargo={onOpenCargo}
                chatId={chatId}
                onOpenTelegramBot={onOpenTelegramBot}
                onOpenMaxBot={onOpenMaxBot}
            />
        );
    }

    if (currentView === 'companies') {
        return <CompaniesListPage 
            accounts={accounts}
            activeAccountId={activeAccountId}
            onSwitchAccount={onSwitchAccount}
            onRemoveAccount={onRemoveAccount}
            onUpdateAccount={onUpdateAccount}
            onBack={() => setCurrentView('main')}
            onAddCompany={() => setCurrentView('addCompanyMethod')}
        />;
    }

    if (currentView === 'roles') {
        return (
            <ProfileRolesSection
                activeAccount={activeAccount}
                activeAccountId={activeAccountId}
                onBack={() => setCurrentView('main')}
                onUpdateAccount={onUpdateAccount}
            />
        );
    }

    if (currentView === 'haulz') {
        return (
            <ProfileHaulzSection
                activeAccount={activeAccount}
                onBack={() => setCurrentView("main")}
                navigateTo={(view) => setCurrentView(view)}
                onOpenDocumentsWithSection={onOpenDocumentsWithSection}
                onOpenWildberries={onOpenWildberries}
            />
        );
    }

    if (currentView === 'ais') {
        return (
            <AisStreamPage
                onBack={() => setCurrentView('haulz')}
                initialMmsi={aisOpenWithMmsi ?? undefined}
                onConsumedInitialMmsi={() => setAisOpenWithMmsi?.(null)}
            />
        );
    }

    if (currentView === 'parcelScanner') {
        return (
            <ProfileParcelScannerSection
                activeAccount={activeAccount}
                onBack={() => setCurrentView("main")}
            />
        );
    }

    if (currentView === 'expenseRequests') {
        return (
            <ProfileExpenseRequestsSection activeAccount={activeAccount} onBack={() => setCurrentView("haulz")} />
        );
    }

    if (currentView === 'accounting') {
        const patchStatus = async (itemId: string, status: "sent" | "paid") => {
            if (!activeAccount?.login || !activeAccount?.password) return;
            const origin = typeof window !== "undefined" && window.location?.origin ? window.location.origin : "";
            try {
                const res = await fetch(`${origin}/api/accounting-expense-requests`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json", "x-login": activeAccount.login, "x-password": activeAccount.password },
                    body: JSON.stringify({ uid: itemId, status }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    setAccountingRequestsError(data.error || "Ошибка обновления статуса");
                    return;
                }
                void fetchAccountingRequests();
            } catch {
                setAccountingRequestsError("Ошибка сети");
            }
        };
        const markAwaitingPayment = (itemId: string) => { void patchStatus(itemId, "sent"); };
        const markPaid = (itemId: string) => { void patchStatus(itemId, "paid"); };

        const statusBadge = (s: string) => {
            const map: Record<string, { bg: string; color: string; label: string }> = {
                approved: { bg: "rgba(16,185,129,0.15)", color: "#10b981", label: "В банк" },
                sent: { bg: "rgba(34,197,94,0.15)", color: "#22c55e", label: "Ожидает оплату" },
                paid: { bg: "rgba(139,92,246,0.15)", color: "#8b5cf6", label: "Оплачено" },
            };
            const m = map[s] ?? { bg: "rgba(107,114,128,0.15)", color: "#6b7280", label: s };
            return <span style={{ fontSize: "0.7rem", padding: "0.15rem 0.45rem", borderRadius: 999, fontWeight: 600, background: m.bg, color: m.color }}>{m.label}</span>;
        };

        const allRequests = accountingRequestsItems;
        const accountingClaimsDisplayed = accountingClaimsItems.filter((item) => {
            const status = String(item?.status || "");
            if (!accountingClaimsStatusFilter) {
                if (accountingClaimsView === "new" && status !== "new") return false;
                if (accountingClaimsView === "in_progress" && !["under_review", "waiting_docs", "in_progress", "awaiting_leader", "sent_to_accounting"].includes(status)) {
                    return false;
                }
            }
            return true;
        });
        const accountingClaimsKpi = accountingClaimsDisplayed.reduce((acc, item) => {
            const status = String(item?.status || "");
            const isClosed = ["paid", "offset", "rejected", "closed"].includes(status);
            if (!isClosed) acc.activeCount += 1;
            if (!isClosed && item?.slaDueAt && new Date(item.slaDueAt).getTime() < Date.now()) {
                acc.overdueCount += 1;
            }
            acc.requestedSum += Number(item?.requestedAmount || 0);
            acc.approvedSum += Number(item?.approvedAmount || 0);
            return acc;
        }, { activeCount: 0, overdueCount: 0, requestedSum: 0, approvedSum: 0 });

        return (
            <div className="w-full">
                <Flex align="center" style={{ marginBottom: '1rem', gap: '0.75rem' }}>
                    <Button className="filter-button" onClick={() => setCurrentView('haulz')} style={{ padding: '0.5rem' }}>
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <Typography.Headline style={{ fontSize: '1.25rem' }}>Бухгалтерия</Typography.Headline>
                </Flex>
                <Panel className="cargo-card" style={{ padding: '0.75rem 1rem', marginBottom: '1rem' }}>
                    <Typography.Body style={{ fontWeight: 600, marginBottom: '0.55rem' }}>Бухгалтерия — подразделы</Typography.Body>
                    <Flex gap="0.5rem" wrap="wrap">
                        <Button
                            type="button"
                            className="filter-button"
                            style={{
                                background: accountingSubsection === "expense_requests" ? "var(--color-primary-blue)" : undefined,
                                color: accountingSubsection === "expense_requests" ? "white" : undefined,
                                height: 36,
                                padding: "0 0.85rem",
                                minWidth: 170,
                            }}
                            onClick={() => { setAccountingSubsection("expense_requests"); setSelectedAccountingRequest(null); }}
                        >
                            Заявки на расходы
                        </Button>
                        <Button
                            type="button"
                            className="filter-button"
                            style={{
                                background: accountingSubsection === "sverki" ? "var(--color-primary-blue)" : undefined,
                                color: accountingSubsection === "sverki" ? "white" : undefined,
                                height: 36,
                                padding: "0 0.85rem",
                                minWidth: 130,
                            }}
                            onClick={() => { setAccountingSubsection("sverki"); setSelectedAccountingRequest(null); }}
                        >
                            Акты сверок
                        </Button>
                        {activeAccount?.permissions?.doc_claims === true && (
                            <Button
                                type="button"
                                className="filter-button"
                                style={{
                                    background: accountingSubsection === "claims" ? "var(--color-primary-blue)" : undefined,
                                    color: accountingSubsection === "claims" ? "white" : undefined,
                                    height: 36,
                                    padding: "0 0.85rem",
                                    minWidth: 120,
                                }}
                                onClick={() => { setAccountingSubsection("claims"); setSelectedAccountingRequest(null); }}
                            >
                                Претензии
                            </Button>
                        )}
                    </Flex>
                </Panel>
                {accountingSubsection === "expense_requests" && (
                <Panel className="cargo-card" style={{ padding: '1rem' }}>
                    <Flex align="center" justify="space-between" wrap="wrap" gap="0.5rem" style={{ marginBottom: "0.5rem" }}>
                        <Typography.Body style={{ fontWeight: 600 }}>
                            Согласованные заявки ({allRequests.length})
                        </Typography.Body>
                        {!accountingRequestsLoading && (
                            <Button type="button" className="filter-button" onClick={() => void fetchAccountingRequests()} style={{ padding: "0.25rem 0.5rem", fontSize: "0.8rem" }}>
                                Обновить
                            </Button>
                        )}
                    </Flex>
                    {accountingRequestsLoading ? (
                        <Flex align="center" gap="0.5rem" style={{ padding: "1rem", color: "var(--color-text-secondary)" }}>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <Typography.Body>Загрузка заявок...</Typography.Body>
                        </Flex>
                    ) : accountingRequestsError ? (
                        <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-text-error, #dc2626)" }}>{accountingRequestsError}</Typography.Body>
                    ) : allRequests.length === 0 ? (
                        <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>Нет согласованных заявок</Typography.Body>
                    ) : (
                        <div style={{ maxHeight: 600, overflowY: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                                <thead>
                                    <tr style={{ position: "sticky", top: 0, background: "var(--color-bg-card, #fff)", zIndex: 1 }}>
                                        <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--color-border)" }}>Дата</th>
                                        <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--color-border)" }}>№ док.</th>
                                        <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--color-border)" }}>Подразделение</th>
                                        <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--color-border)" }}>Статья</th>
                                        <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--color-border)" }}>Сумма</th>
                                        <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--color-border)" }}>Статус</th>
                                        <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--color-border)" }}>Действия</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {allRequests.map((r) => (
                                        <tr
                                            key={r.id}
                                            style={{ borderBottom: "1px solid var(--color-border)", cursor: "pointer" }}
                                            onClick={() => setSelectedAccountingRequest(r)}
                                        >
                                            <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{r.createdAt ? new Date(r.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" }) : "—"}</td>
                                            <td style={{ padding: "6px 8px" }}>{r.docNumber || "—"}</td>
                                            <td style={{ padding: "6px 8px" }}>{r.department}</td>
                                            <td style={{ padding: "6px 8px" }}>{r.categoryName}</td>
                                            <td style={{ padding: "6px 8px", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{r.amount.toLocaleString("ru-RU")} ₽</td>
                                            <td style={{ padding: "6px 8px" }}>{statusBadge(r.status)}</td>
                                            <td style={{ padding: "6px 8px" }} onClick={(e) => e.stopPropagation()}>
                                                <Flex gap="0.25rem" wrap="wrap">
                                                    {r.status === "approved" && (
                                                        <button type="button" onClick={() => markAwaitingPayment(r.id)} style={{ fontSize: "0.68rem", padding: "0.2rem 0.45rem", borderRadius: 6, border: "1px solid #2563eb", background: "transparent", color: "#2563eb", cursor: "pointer" }}>Ожидает оплату</button>
                                                    )}
                                                    {(r.status === "approved" || r.status === "sent") && (
                                                        <button type="button" onClick={() => markPaid(r.id)} style={{ fontSize: "0.68rem", padding: "0.2rem 0.45rem", borderRadius: 6, border: "1px solid #8b5cf6", background: "transparent", color: "#8b5cf6", cursor: "pointer" }}>Оплачено</button>
                                                    )}
                                                </Flex>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Panel>
                )}
                {accountingSubsection === "claims" && (
                <Panel className="cargo-card" style={{ padding: "1rem", marginBottom: "1rem" }}>
                    <Typography.Body style={{ fontWeight: 600, marginBottom: "0.55rem" }}>Претензии (финансовый контур)</Typography.Body>
                    <Flex gap="0.5rem" wrap="wrap" style={{ marginBottom: "0.75rem" }}>
                        <Button
                            type="button"
                            className="filter-button"
                            style={{ background: accountingClaimsView === "new" ? "var(--color-primary-blue)" : undefined, color: accountingClaimsView === "new" ? "white" : undefined, height: 36, minWidth: 70 }}
                            onClick={() => { setAccountingClaimsView("new"); setAccountingClaimsStatusFilter(""); }}
                        >
                            Новые
                        </Button>
                        <Button
                            type="button"
                            className="filter-button"
                            style={{ background: accountingClaimsView === "in_progress" ? "var(--color-primary-blue)" : undefined, color: accountingClaimsView === "in_progress" ? "white" : undefined, height: 36, minWidth: 86 }}
                            onClick={() => { setAccountingClaimsView("in_progress"); setAccountingClaimsStatusFilter(""); }}
                        >
                            В работе
                        </Button>
                        <Button
                            type="button"
                            className="filter-button"
                            style={{ background: accountingClaimsView === "all" ? "var(--color-primary-blue)" : undefined, color: accountingClaimsView === "all" ? "white" : undefined, height: 36, minWidth: 58 }}
                            onClick={() => setAccountingClaimsView("all")}
                        >
                            Все
                        </Button>
                    </Flex>
                    <Flex gap="0.5rem" wrap="wrap" style={{ marginBottom: "0.75rem" }}>
                        <div className="cargo-card" style={{ padding: "0 0.65rem", minWidth: 130, minHeight: 36, display: "flex", alignItems: "center" }}>
                            <Typography.Body style={{ fontSize: "0.76rem", color: "var(--color-text-secondary)" }}>Активные: <strong style={{ color: "var(--color-text-primary)" }}>{accountingClaimsKpi.activeCount}</strong></Typography.Body>
                        </div>
                        <div className="cargo-card" style={{ padding: "0 0.65rem", minWidth: 130, minHeight: 36, display: "flex", alignItems: "center" }}>
                            <Typography.Body style={{ fontSize: "0.76rem", color: "var(--color-text-secondary)" }}>Просроченные: <strong style={{ color: accountingClaimsKpi.overdueCount > 0 ? "#ef4444" : "var(--color-text-primary)" }}>{accountingClaimsKpi.overdueCount}</strong></Typography.Body>
                        </div>
                        <div className="cargo-card" style={{ padding: "0 0.65rem", minWidth: 170, minHeight: 36, display: "flex", alignItems: "center" }}>
                            <Typography.Body style={{ fontSize: "0.76rem", color: "var(--color-text-secondary)" }}>Сумма требований: <strong style={{ color: "var(--color-text-primary)" }}>{accountingClaimsKpi.requestedSum.toLocaleString("ru-RU")} ₽</strong></Typography.Body>
                        </div>
                        <div className="cargo-card" style={{ padding: "0 0.65rem", minWidth: 190, minHeight: 36, display: "flex", alignItems: "center" }}>
                            <Typography.Body style={{ fontSize: "0.76rem", color: "var(--color-text-secondary)" }}>Сумма одобренных: <strong style={{ color: "var(--color-text-primary)" }}>{accountingClaimsKpi.approvedSum.toLocaleString("ru-RU")} ₽</strong></Typography.Body>
                        </div>
                    </Flex>
                    <Flex gap="0.5rem" wrap="wrap" align="center" style={{ marginBottom: "0.75rem" }}>
                        <Input
                            type="text"
                            className="admin-form-input"
                            placeholder="Поиск: номер претензии / перевозка"
                            value={accountingClaimsSearch}
                            onChange={(e) => setAccountingClaimsSearch(e.target.value)}
                            style={{ minWidth: 260, maxWidth: 420, height: 36, padding: "0 0.55rem", boxSizing: "border-box" }}
                        />
                        <select
                            className="admin-form-input"
                            value={accountingClaimsStatusFilter}
                            onChange={(e) => { setAccountingClaimsView("all"); setAccountingClaimsStatusFilter(e.target.value); }}
                            style={{ padding: "0 0.5rem", height: 36, minWidth: 210, boxSizing: "border-box" }}
                        >
                            <option value="">Все статусы</option>
                            <option value="new">Новая</option>
                            <option value="under_review">На рассмотрении</option>
                            <option value="waiting_docs">Ожидает документы</option>
                            <option value="in_progress">В работе</option>
                            <option value="awaiting_leader">Ожидает решения руководителя</option>
                            <option value="sent_to_accounting">Передана в бухгалтерию</option>
                            <option value="approved">Удовлетворена</option>
                            <option value="paid">Выплачено</option>
                            <option value="offset">Зачтено</option>
                            <option value="rejected">Отказ</option>
                        </select>
                        <Button type="button" className="filter-button" style={{ height: 36, minWidth: 92, padding: "0 0.65rem" }} onClick={() => void reloadAccountingClaims()} disabled={accountingClaimsLoading}>
                            {accountingClaimsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Обновить"}
                        </Button>
                    </Flex>
                    {accountingClaimsLoading ? (
                        <Flex align="center" gap="0.5rem">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <Typography.Body>Загрузка претензий...</Typography.Body>
                        </Flex>
                    ) : accountingClaimsError ? (
                        <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-text-error, #dc2626)" }}>{accountingClaimsError}</Typography.Body>
                    ) : accountingClaimsDisplayed.length === 0 ? (
                        <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>Претензий не найдено</Typography.Body>
                    ) : (
                        <div style={{ maxHeight: 360, overflowY: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                                <thead>
                                    <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                                        <th style={{ textAlign: "left", padding: "6px 8px" }}>Претензия</th>
                                        <th style={{ textAlign: "left", padding: "6px 8px" }}>Перевозка</th>
                                        <th style={{ textAlign: "left", padding: "6px 8px" }}>Сумма</th>
                                        <th style={{ textAlign: "left", padding: "6px 8px" }}>Статус</th>
                                        <th style={{ textAlign: "left", padding: "6px 8px" }}>Создана</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {accountingClaimsDisplayed.map((c) => {
                                        const statusKey = String(c?.status || "");
                                        const badge = CLAIM_STATUS_BADGE[statusKey] || { bg: "rgba(107,114,128,0.15)", color: "#6b7280" };
                                        const statusLabel = CLAIM_STATUS_LABELS[statusKey] || statusKey || "—";
                                        return (
                                            <tr key={c.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                                                <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{String(c?.claimNumber || `#${c.id}`)}</td>
                                                <td style={{ padding: "6px 8px" }}>{String(c?.cargoNumber || "—")}</td>
                                                <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{Number(c?.requestedAmount || 0).toLocaleString("ru-RU")} ₽</td>
                                                <td style={{ padding: "6px 8px" }}>
                                                    <span style={{ fontSize: "0.7rem", padding: "0.15rem 0.45rem", borderRadius: 999, fontWeight: 600, background: badge.bg, color: badge.color }}>
                                                        {statusLabel}
                                                    </span>
                                                </td>
                                                <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{c?.createdAt ? new Date(c.createdAt).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—"}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Panel>
                )}
                {accountingSubsection === "sverki" && (
                <Panel className="cargo-card" style={{ padding: "1rem", marginBottom: "1rem" }}>
                    <Typography.Body style={{ fontWeight: 600, marginBottom: "0.55rem" }}>Бухгалтерия — акты сверок</Typography.Body>
                    <Typography.Body style={{ fontWeight: 600, marginBottom: "0.55rem", fontSize: "0.9rem" }}>Акты сверок — заявки на формирование</Typography.Body>
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
                                                <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{new Date(r.createdAt).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })}</td>
                                                <td style={{ padding: "6px 8px" }}>{r.login || "—"}</td>
                                                <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{r.customerInn || "—"}</td>
                                                <td style={{ padding: "6px 8px" }}>{r.contract || "—"}</td>
                                                <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                                                    {new Date(r.periodFrom).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })} - {new Date(r.periodTo).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })}
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
                    <Button type="button" className="filter-button" onClick={() => void fetchSverkiRequests()} style={{ marginTop: "0.75rem", padding: "0.25rem 0.5rem", fontSize: "0.8rem" }}>
                        Обновить
                    </Button>
                </Panel>
                )}
                {selectedAccountingRequest && (
                    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setSelectedAccountingRequest(null)}>
                        <div style={{ background: "var(--color-bg-card, #fff)", borderRadius: 12, padding: "1.25rem", maxWidth: 480, width: "92%", maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
                            <Typography.Body style={{ fontWeight: 600, marginBottom: "0.75rem" }}>
                                Заявка {selectedAccountingRequest.docNumber || selectedAccountingRequest.id.slice(-8)}
                            </Typography.Body>
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem", marginBottom: "0.75rem" }}>
                                <div><span style={{ color: "var(--color-text-secondary)" }}>Создано:</span> {selectedAccountingRequest.createdAt ? new Date(selectedAccountingRequest.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" }) : "—"}</div>
                                <div><span style={{ color: "var(--color-text-secondary)" }}>№ док.:</span> {selectedAccountingRequest.docNumber || "—"}</div>
                                <div><span style={{ color: "var(--color-text-secondary)" }}>Дата док.:</span> {selectedAccountingRequest.docDate || "—"}</div>
                                <div><span style={{ color: "var(--color-text-secondary)" }}>Период:</span> {selectedAccountingRequest.period || "—"}</div>
                                <div><span style={{ color: "var(--color-text-secondary)" }}>Логин:</span> {selectedAccountingRequest.login || "—"}</div>
                                <div><span style={{ color: "var(--color-text-secondary)" }}>Подразделение:</span> {selectedAccountingRequest.department || "—"}</div>
                                <div><span style={{ color: "var(--color-text-secondary)" }}>Статья:</span> {selectedAccountingRequest.categoryName || "—"}</div>
                                <div><span style={{ color: "var(--color-text-secondary)" }}>Сумма:</span> {selectedAccountingRequest.amount.toLocaleString("ru-RU")} ₽</div>
                                <div><span style={{ color: "var(--color-text-secondary)" }}>Статус:</span> {statusBadge(selectedAccountingRequest.status)}</div>
                                <div><span style={{ color: "var(--color-text-secondary)" }}>Комментарий:</span> {selectedAccountingRequest.comment || "—"}</div>
                                <div><span style={{ color: "var(--color-text-secondary)" }}>ТС:</span> {selectedAccountingRequest.vehicleOrEmployee || "—"}</div>
                                {selectedAccountingRequest.attachments && selectedAccountingRequest.attachments.length > 0 && (
                                    <div>
                                        <Typography.Body style={{ fontWeight: 600, fontSize: "0.82rem", marginBottom: "0.25rem", display: "block" }}>Прикреплённые документы</Typography.Body>
                                        {selectedAccountingRequest.attachments.map((att) => (
                                            <div key={att.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.35rem", flexWrap: "wrap" }}>
                                                <Typography.Body style={{ fontSize: "0.82rem", minWidth: 0, flex: "1 1 200px" }}>{att.fileName}</Typography.Body>
                                                <Flex gap="0.25rem">
                                                    <Button type="button" className="filter-button" style={{ fontSize: "0.72rem", padding: "0.2rem 0.5rem" }} onClick={async () => {
                                                        if (!activeAccount?.login || !activeAccount?.password) return;
                                                        const origin = typeof window !== "undefined" && window.location?.origin ? window.location.origin : "";
                                                        try {
                                                            const res = await fetch(
                                                                `${origin}/api/accounting-expense-attachment?requestUid=${encodeURIComponent(selectedAccountingRequest.id)}&attachmentId=${att.id}`,
                                                                { headers: { "x-login": activeAccount.login, "x-password": activeAccount.password } }
                                                            );
                                                            if (!res.ok) return;
                                                            const blob = await res.blob();
                                                            const url = URL.createObjectURL(blob);
                                                            window.open(url, "_blank", "noopener");
                                                            setTimeout(() => URL.revokeObjectURL(url), 60000);
                                                        } catch { /* ignore */ }
                                                    }}>Открыть</Button>
                                                    <Button type="button" className="filter-button" style={{ fontSize: "0.72rem", padding: "0.2rem 0.5rem" }} onClick={async () => {
                                                        if (!activeAccount?.login || !activeAccount?.password) return;
                                                        const origin = typeof window !== "undefined" && window.location?.origin ? window.location.origin : "";
                                                        try {
                                                            const res = await fetch(
                                                                `${origin}/api/accounting-expense-attachment?requestUid=${encodeURIComponent(selectedAccountingRequest.id)}&attachmentId=${att.id}`,
                                                                { headers: { "x-login": activeAccount.login, "x-password": activeAccount.password } }
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
                                                    }}>Скачать</Button>
                                                </Flex>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <Flex gap="0.5rem" justify="flex-end">
                                <Button type="button" className="filter-button" onClick={() => setSelectedAccountingRequest(null)}>Закрыть</Button>
                                {selectedAccountingRequest.status === "approved" && (
                                    <Button type="button" className="filter-button" onClick={() => { markAwaitingPayment(selectedAccountingRequest.id); setSelectedAccountingRequest(null); }} style={{ borderColor: "#2563eb", color: "#2563eb" }}>
                                        Ожидает оплату
                                    </Button>
                                )}
                                {(selectedAccountingRequest.status === "approved" || selectedAccountingRequest.status === "sent") && (
                                    <Button type="button" className="button-primary" onClick={() => { markPaid(selectedAccountingRequest.id); setSelectedAccountingRequest(null); }}>
                                        Оплачено
                                    </Button>
                                )}
                            </Flex>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    if (currentView === 'departmentTimesheet') {
        return (
            <div className="w-full" style={departmentTimesheetContainerStyle}>
                <Flex align="center" style={{ marginBottom: '1rem', gap: '0.75rem' }}>
                    <Button className="filter-button" onClick={() => setCurrentView('haulz')} style={{ padding: '0.5rem' }}>
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <Typography.Headline style={{ fontSize: '1.25rem' }}>Табель учета рабочего времени</Typography.Headline>
                    {!departmentTimesheetMobilePicker && (
                        <Button
                            type="button"
                            className="filter-button"
                            onClick={() => setDepartmentTimesheetWideMode((prev) => !prev)}
                            style={{ marginLeft: "auto" }}
                        >
                            {departmentTimesheetWideMode ? "Стандартная ширина" : "Шире экран"}
                        </Button>
                    )}
                </Flex>
                <Typography.Body style={{ marginBottom: '0.75rem', color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                    Отображаются только сотрудники вашего подразделения HAULZ.
                </Typography.Body>
                <Panel className="cargo-card" style={{ padding: '1rem', marginBottom: '0.75rem' }}>
                    <Flex align="center" justify="space-between" wrap="wrap" gap="0.75rem">
                        <Typography.Body style={{ fontWeight: 600 }}>
                            Подразделение: {departmentTimesheetAllDepartments ? "Все подразделения" : (departmentTimesheetDepartment || "—")}
                        </Typography.Body>
                        <Flex align="center" gap="0.5rem">
                            {departmentTimesheetAllDepartments && (
                                <select
                                    value={departmentTimesheetDepartmentFilter}
                                    onChange={(e) => setDepartmentTimesheetDepartmentFilter(e.target.value)}
                                    style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.4rem 0.6rem', background: 'var(--color-bg)', minWidth: '12.5rem' }}
                                    aria-label="Фильтр подразделения"
                                >
                                    <option value="all">Все подразделения</option>
                                    {departmentTimesheetDepartmentOptions.map((dep) => (
                                        <option key={`timesheet-department-filter-${dep}`} value={dep}>
                                            {dep}
                                        </option>
                                    ))}
                                </select>
                            )}
                            <input
                                type="month"
                                value={departmentTimesheetMonth}
                                onChange={(e) => setDepartmentTimesheetMonth(e.target.value)}
                                style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.4rem 0.6rem', background: 'var(--color-bg)' }}
                            />
                            <Button
                                type="button"
                                className="filter-button"
                                title="Текущий месяц"
                                style={{ padding: '0.4rem 0.55rem', whiteSpace: 'nowrap' }}
                                onClick={() => setDepartmentTimesheetMonth(getCurrentMonthYm())}
                            >
                                Сегодня
                            </Button>
                            <Button type="button" className="filter-button" onClick={() => void fetchDepartmentTimesheet()}>
                                Обновить
                            </Button>
                        </Flex>
                    </Flex>
                    <Input
                        type="text"
                        className="admin-form-input"
                        value={departmentTimesheetSearch}
                        onChange={(e) => setDepartmentTimesheetSearch(e.target.value)}
                        placeholder="Поиск по сотруднику: ФИО, должность, логин"
                        style={{ width: "100%", marginTop: "0.55rem", minHeight: "2.4rem", boxSizing: "border-box" }}
                    />
                    {!departmentTimesheetIsEditableMonth ? (
                        <Typography.Body style={{ marginTop: '0.55rem', fontSize: '0.78rem', color: '#b45309' }}>
                            Редактирование доступно только для текущего, предыдущего месяца и декабря 2025.
                        </Typography.Body>
                    ) : null}
                </Panel>
                <Panel className="cargo-card" style={{ padding: '1rem', marginBottom: '0.75rem' }}>
                    <Flex align="center" justify="space-between" gap="0.6rem" wrap="wrap">
                        <Typography.Body style={{ fontWeight: 600 }}>Управление сотрудниками табеля</Typography.Body>
                        <Button
                            type="button"
                            className="filter-button"
                            onClick={() => setDepartmentTimesheetManageExpanded((prev) => !prev)}
                            style={{ padding: '0.35rem 0.6rem' }}
                        >
                            {departmentTimesheetManageExpanded ? 'Свернуть' : 'Развернуть'}
                        </Button>
                    </Flex>
                    {departmentTimesheetManageExpanded ? (
                        <div style={{ marginTop: '0.75rem', display: 'grid', gap: '0.75rem' }}>
                            <div>
                                <Typography.Body style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Добавить существующего сотрудника из подразделения</Typography.Body>
                                <Flex align="center" gap="0.5rem" wrap="wrap">
                                    <select
                                        value={departmentTimesheetSelectedEmployeeId}
                                        onChange={(e) => { setDepartmentTimesheetSelectedEmployeeId(e.target.value); setDepartmentTimesheetError(null); }}
                                        style={{ padding: '0 0.6rem', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', fontSize: '0.9rem', height: '2.4rem', boxSizing: 'border-box', minWidth: '18rem' }}
                                        aria-label="Сотрудник подразделения"
                                    >
                                        <option value="">Выберите сотрудника</option>
                                        {departmentTimesheetAvailableEmployees.map((emp) => (
                                            <option key={`existing-dep-emp-${emp.id}`} value={String(emp.id)}>
                                                {(emp.fullName || emp.login) + (emp.position ? ` — ${emp.position}` : "")}
                                            </option>
                                        ))}
                                    </select>
                                    <Button
                                        type="button"
                                        className="filter-button"
                                        disabled={!departmentTimesheetIsEditableMonth || departmentTimesheetEmployeeSaving || !departmentTimesheetAvailableEmployees.length}
                                        onClick={() => void addExistingDepartmentTimesheetEmployee()}
                                        style={{ height: '2.4rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                                    >
                                        {departmentTimesheetEmployeeSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                        Добавить выбранного
                                    </Button>
                                    {!departmentTimesheetAvailableEmployees.length ? (
                                        <Typography.Body style={{ color: 'var(--color-text-secondary)', fontSize: '0.82rem' }}>
                                            Нет скрытых сотрудников для этого месяца.
                                        </Typography.Body>
                                    ) : null}
                                </Flex>
                            </div>
                            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '0.75rem' }}>
                                <Typography.Body style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Добавить сотрудника в табель</Typography.Body>
                                <Typography.Body style={{ marginBottom: '0.75rem', color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
                                    Новый сотрудник будет добавлен в ваше подразделение как сотрудник.
                                </Typography.Body>
                                <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: '0.1rem' }}>
                                <Flex className="form-row-same-height invite-form-row" gap="0.5rem" wrap="nowrap" align="center" style={{ width: 'max-content', minWidth: '100%' }}>
                                    <Input
                                        type="text"
                                        placeholder="ФИО"
                                        value={departmentTimesheetEmployeeFullName}
                                        onChange={(e) => { setDepartmentTimesheetEmployeeFullName(e.target.value); setDepartmentTimesheetError(null); }}
                                        style={{ width: '14rem', minWidth: '12rem', height: '2.4rem', boxSizing: 'border-box' }}
                                        className="admin-form-input"
                                    />
                                    <Input
                                        type="text"
                                        placeholder="Должность"
                                        value={departmentTimesheetEmployeePosition}
                                        onChange={(e) => { setDepartmentTimesheetEmployeePosition(e.target.value); setDepartmentTimesheetError(null); }}
                                        style={{ width: '12rem', minWidth: '10rem', height: '2.4rem', boxSizing: 'border-box' }}
                                        className="admin-form-input"
                                    />
                                    <select
                                        value={departmentTimesheetEmployeeAccrualType}
                                        onChange={(e) => setDepartmentTimesheetEmployeeAccrualType(normalizeDepartmentAccrualType(e.target.value))}
                                        style={{ padding: '0 0.6rem', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', fontSize: '0.9rem', height: '2.4rem', boxSizing: 'border-box', minWidth: '9rem' }}
                                        aria-label="Тип начисления"
                                    >
                                        <option value="hour">Почасовая</option>
                                        <option value="shift">Сменная</option>
                                        <option value="month">Месячная (21 раб. дн.)</option>
                                    </select>
                                    <select
                                        value={departmentTimesheetEmployeeCooperationType}
                                        onChange={(e) => setDepartmentTimesheetEmployeeCooperationType(
                                            e.target.value === "self_employed" || e.target.value === "ip" ? e.target.value : "staff"
                                        )}
                                        style={{ padding: '0 0.6rem', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', fontSize: '0.9rem', height: '2.4rem', boxSizing: 'border-box', minWidth: '11rem' }}
                                        aria-label="Тип занятости"
                                    >
                                        {COOPERATION_TYPE_OPTIONS.map((opt) => (
                                            <option key={`cooperation-type-${opt.value}`} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                    <Input
                                        type="number"
                                        placeholder="Ставка"
                                        min={0}
                                        step={0.01}
                                        value={departmentTimesheetEmployeeAccrualRate}
                                        onChange={(e) => { setDepartmentTimesheetEmployeeAccrualRate(e.target.value); setDepartmentTimesheetError(null); }}
                                        style={{ width: '5.2rem', minWidth: '4.6rem', height: '2.4rem', boxSizing: 'border-box' }}
                                        className="admin-form-input"
                                    />
                                    <Button
                                        type="button"
                                        className="filter-button"
                                        disabled={!departmentTimesheetIsEditableMonth || departmentTimesheetEmployeeSaving}
                                        onClick={() => void addDepartmentTimesheetEmployee()}
                                        style={{ height: '2.4rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                                    >
                                        {departmentTimesheetEmployeeSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                        Добавить
                                    </Button>
                                </Flex>
                                </div>
                                <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '0.4rem' }}>
                                    За {departmentTimesheetEmployeeAccrualType === "month" ? "месяц" : (departmentTimesheetEmployeeAccrualType === 'shift' ? 'смену' : 'час')}: {Number(departmentTimesheetEmployeeAccrualRate || 0).toLocaleString('ru-RU')} ₽ ·
                                    За месяц ({WORK_DAYS_IN_MONTH} раб. дн.): {Math.round(departmentTimesheetMonthlyEstimate).toLocaleString('ru-RU')} ₽
                                </Typography.Body>
                            </div>
                        </div>
                    ) : null}
                </Panel>
                {departmentTimesheetLoading ? (
                    <Flex align="center" gap="0.5rem"><Loader2 className="w-4 h-4 animate-spin" /><Typography.Body>Загрузка...</Typography.Body></Flex>
                ) : departmentTimesheetError ? (
                    <Typography.Body style={{ color: 'var(--color-error)' }}>{departmentTimesheetError}</Typography.Body>
                ) : departmentTimesheetEmployees.length === 0 ? (
                    <Panel className="cargo-card" style={{ padding: '1rem' }}>
                        <Typography.Body style={{ color: 'var(--color-text-secondary)' }}>В вашем подразделении пока нет сотрудников.</Typography.Body>
                    </Panel>
                ) : filteredDepartmentTimesheetEmployees.length === 0 ? (
                    <Panel className="cargo-card" style={{ padding: '1rem' }}>
                        <Typography.Body style={{ color: 'var(--color-text-secondary)' }}>По вашему фильтру сотрудники не найдены.</Typography.Body>
                    </Panel>
                ) : (
                    <>
                    <Typography.Body style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginBottom: '0.35rem', display: 'block' }}>
                        Нажмите на ФИО сотрудника, чтобы открыть таблицу выплат за выбранный месяц.
                    </Typography.Body>
                    <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '70vh', WebkitOverflowScrolling: 'touch', paddingLeft: 'max(0.5rem, env(safe-area-inset-left))', paddingRight: 'max(0.5rem, env(safe-area-inset-right))' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: `${340 + departmentTimesheetDays.length * 44 + SHIFT_MARK_CODES.length * 52}px` }}>
                            <thead>
                                <tr>
                                    <th style={{ position: 'sticky', top: 0, left: 0, zIndex: 40, background: 'var(--color-bg-card, #fff)', textAlign: 'left', borderBottom: '1px solid var(--color-border)', padding: '0.5rem', minWidth: '220px', boxShadow: '2px 0 0 var(--color-border)' }}>Сотрудник</th>
                                    {departmentTimesheetDays.map((day) => {
                                        const dayMeta = departmentTimesheetWeekdayByDay[day];
                                        const isWeekend = !!dayMeta?.isWeekend;
                                        return (
                                            <th key={day} style={{ position: 'sticky', top: 0, zIndex: 20, textAlign: 'center', borderBottom: '1px solid var(--color-border)', padding: '0.3rem 0.2rem', minWidth: '44px', background: isWeekend ? 'var(--color-bg-hover)' : 'var(--color-bg-card, #fff)' }}>
                                                <div style={{ fontSize: '0.76rem', color: isWeekend ? '#d93025' : 'inherit', fontWeight: isWeekend ? 600 : 500 }}>{day}</div>
                                                <div style={{ fontSize: '0.68rem', color: isWeekend ? '#d93025' : 'var(--color-text-secondary)' }}>{dayMeta?.short || ''}</div>
                                            </th>
                                        );
                                    })}
                                    <th style={{ position: 'sticky', top: 0, zIndex: 20, textAlign: 'center', borderBottom: '1px solid var(--color-border)', padding: '0.4rem', minWidth: '120px', background: 'var(--color-bg-card, #fff)' }}>Итого</th>
                                    {SHIFT_MARK_CODES.map((code) => (
                                        <th key={`legend-col-${code}`} style={{ position: 'sticky', top: 0, zIndex: 20, textAlign: 'center', borderBottom: '1px solid var(--color-border)', padding: '0.35rem 0.25rem', minWidth: '52px', background: 'var(--color-bg-card, #fff)' }}>
                                            {code}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredDepartmentTimesheetEmployees.map((emp) => {
                                    const accrualType = normalizeDepartmentAccrualType(emp.accrualType);
                                    const isShift = accrualType === "shift";
                                    const isMarkAccrualType = accrualType === "shift" || accrualType === "month";
                                    const rate = Number(emp.accrualRate ?? 0);
                                    const totalShiftCount = departmentTimesheetDays.reduce((acc, day) => {
                                        const key = `${emp.id}:${day}`;
                                        return acc + (normalizeShiftMark(departmentTimesheetHours[key] || '') === 'Я' ? 1 : 0);
                                    }, 0);
                                    const totalHours = isMarkAccrualType
                                        ? totalShiftCount * 8
                                        : departmentTimesheetDays.reduce((acc, day) => {
                                            const key = `${emp.id}:${day}`;
                                            const value = (departmentTimesheetHours[key] || '').trim().replace(',', '.');
                                            const num = Number(value);
                                            return acc + (Number.isFinite(num) ? num : 0);
                                        }, 0);
                                    const totalMoney = isMarkAccrualType
                                        ? departmentTimesheetDays.reduce((acc, day) => {
                                            const key = `${emp.id}:${day}`;
                                            if (normalizeShiftMark(departmentTimesheetHours[key] || '') !== 'Я') return acc;
                                            const override = Number(departmentTimesheetShiftRateOverrides[key]);
                                            const dayRate = isShift
                                                ? (Number.isFinite(override) ? override : rate)
                                                : getDayRateByAccrualType(rate, accrualType);
                                            return acc + dayRate;
                                        }, 0)
                                        : totalHours * rate;
                                    const totalPaid = Number(departmentTimesheetPayoutsByEmployee[String(emp.id)] || 0);
                                    const totalOutstanding = Math.max(0, Number((totalMoney - totalPaid).toFixed(2)));
                                    const totalPrimaryText = isMarkAccrualType
                                        ? `${totalShiftCount} ${departmentTimesheetMobilePicker ? 'смены' : 'смен'}`
                                        : `${Number(totalHours.toFixed(2))} ${departmentTimesheetMobilePicker ? 'часы' : 'ч'}`;
                                    const legendCounts = SHIFT_MARK_CODES.reduce<Record<string, number>>((acc, code) => {
                                        acc[code] = 0;
                                        return acc;
                                    }, {});
                                    for (const day of departmentTimesheetDays) {
                                        const key = `${emp.id}:${day}`;
                                        const mark = normalizeShiftMark(departmentTimesheetHours[key] || '');
                                        if (mark) legendCounts[mark] = (legendCounts[mark] || 0) + 1;
                                    }

                                    const employeePayouts = departmentTimesheetPayoutsDetailByEmployee[String(emp.id)] || [];
                                    const showPayoutTaxColumns = emp.cooperationType === "ip" || emp.cooperationType === "self_employed";
                                    const deptTimesheetColSpan = 1 + departmentTimesheetDays.length + 1 + SHIFT_MARK_CODES.length;

                                    return (
                                    <React.Fragment key={emp.id}>
                                    <tr>
                                        <td style={{ position: 'sticky', left: 0, zIndex: 30, minWidth: '220px', background: 'var(--color-bg-card, #fff)', borderBottom: '1px solid var(--color-border)', padding: '0.5rem', boxShadow: '2px 0 0 var(--color-border)' }}>
                                            <Flex align="center" justify="space-between" gap="0.35rem" style={{ alignItems: 'flex-start' }}>
                                                <div
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={() => setDepartmentTimesheetExpandedEmployeeId((prev) => (prev === emp.id ? null : emp.id))}
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter" || e.key === " ") {
                                                            e.preventDefault();
                                                            setDepartmentTimesheetExpandedEmployeeId((prev) => (prev === emp.id ? null : emp.id));
                                                        }
                                                    }}
                                                    style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
                                                    aria-expanded={departmentTimesheetExpandedEmployeeId === emp.id}
                                                >
                                                    <Typography.Body style={{ display: 'block', fontWeight: 600 }}>{emp.fullName || emp.login}</Typography.Body>
                                                    <Typography.Body style={{ display: 'block', fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginTop: '0.1rem' }}>
                                                        {cooperationTypeLabel(emp.cooperationType)}
                                                    </Typography.Body>
                                                    {emp.position ? (
                                                        <Typography.Body style={{ display: 'block', fontSize: '0.74rem', color: 'var(--color-text-secondary)', marginTop: '0.06rem' }}>
                                                            {emp.position}
                                                        </Typography.Body>
                                                    ) : null}
                                                    <Typography.Body style={{ display: 'block', fontSize: '0.74rem', color: 'var(--color-text-secondary)' }}>
                                                        {accrualType === "month" ? "Месяц" : (isShift ? 'Смена' : 'Часы')}
                                                    </Typography.Body>
                                                </div>
                                                <Button
                                                    type="button"
                                                    className="filter-button"
                                                    disabled={!departmentTimesheetIsEditableMonth}
                                                    style={{ padding: '0.25rem' }}
                                                    aria-label="Удалить сотрудника из выбранного месяца"
                                                    title="Удалить из выбранного месяца"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        void removeDepartmentEmployeeFromMonth(emp.id);
                                                    }}
                                                >
                                                    <Trash2 className="w-4 h-4" style={{ color: 'var(--color-error)' }} />
                                                </Button>
                                            </Flex>
                                        </td>
                                        {departmentTimesheetDays.map((day) => {
                                            const key = `${emp.id}:${day}`;
                                            const value = departmentTimesheetHours[key] || '';
                                            const isShift = accrualType === "shift";
                                            const isMarkAccrual = accrualType === "shift" || accrualType === "month";
                                            const shiftMark = normalizeShiftMark(value);
                                            const shiftMarkStyle = getShiftMarkStyle(shiftMark);
                                            const hourlyMark = isMarkAccrual ? shiftMark : getHourlyCellMark(value);
                                            const hourlyMarkStyle = getShiftMarkStyle(hourlyMark);
                                            const hourValue = parseHourValue(value);
                                            const hourInputValue = hourValue > 0 ? String(hourValue) : '';
                                            const hourPickerValue = toHalfHourValue(hourInputValue || '0');
                                            const hourlyHoursEnabled = isMarkAccrual ? false : hourlyMark === 'Я';
                                            const isPaidDate = departmentTimesheetPaidDayMarks[key] === true;
                                            const baseShiftRate = Number(emp.accrualRate || 0);
                                            const overrideShiftRate = Number(departmentTimesheetShiftRateOverrides[key]);
                                            const hasOverrideShiftRate = Number.isFinite(overrideShiftRate);
                                            const effectiveShiftRate = hasOverrideShiftRate ? overrideShiftRate : baseShiftRate;
                                            const shiftRateHint = isShift
                                                ? (hasOverrideShiftRate
                                                    ? `База: ${baseShiftRate.toLocaleString('ru-RU')} ₽ · Ручная: ${overrideShiftRate.toLocaleString('ru-RU')} ₽`
                                                    : `База: ${baseShiftRate.toLocaleString('ru-RU')} ₽`)
                                                : `База за день: ${(baseShiftRate / WORK_DAYS_IN_MONTH).toLocaleString('ru-RU')} ₽`;
                                            return (
                                                <td key={key} style={{ borderBottom: '1px solid var(--color-border)', padding: isPaidDate ? '0.2rem 0.2rem 0.72rem 0.2rem' : '0.2rem' }}>
                                                    {isMarkAccrual ? (
                                                        <div style={{ display: 'grid', justifyItems: 'center', rowGap: '0.12rem' }}>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    if (isPaidDate) return;
                                                                    if (!departmentTimesheetIsEditableMonth) return;
                                                                    if (departmentShiftHoldTriggeredRef.current) {
                                                                        departmentShiftHoldTriggeredRef.current = false;
                                                                        return;
                                                                    }
                                                                    const nextValue = shiftMark === 'Я' ? '' : 'Я';
                                                                    setDepartmentTimesheetHours((prev) => ({
                                                                        ...prev,
                                                                        [key]: nextValue,
                                                                    }));
                                                                    if (isShift && nextValue !== 'Я') {
                                                                        setDepartmentTimesheetShiftRateOverrides((prev) => {
                                                                            const next = { ...prev };
                                                                            delete next[key];
                                                                            return next;
                                                                        });
                                                                        void saveDepartmentTimesheetShiftRate(emp.id, day, '');
                                                                    }
                                                                    void saveDepartmentTimesheetCell(emp.id, day, nextValue);
                                                                }}
                                                                onMouseDown={(e) => {
                                                                    if (isPaidDate) return;
                                                                    if (!departmentTimesheetIsEditableMonth) return;
                                                                    if (departmentShiftHoldTimerRef.current) window.clearTimeout(departmentShiftHoldTimerRef.current);
                                                                    departmentShiftHoldTriggeredRef.current = false;
                                                                    const { clientX, clientY } = e;
                                                                    departmentShiftHoldTimerRef.current = window.setTimeout(() => {
                                                                        departmentShiftHoldTriggeredRef.current = true;
                                                                        setDepartmentShiftPicker({ key, employeeId: emp.id, day, x: clientX, y: clientY, isShift });
                                                                    }, 450);
                                                                }}
                                                                onMouseUp={() => {
                                                                    if (isPaidDate) return;
                                                                    if (!departmentTimesheetIsEditableMonth) return;
                                                                    if (departmentShiftHoldTimerRef.current) {
                                                                        window.clearTimeout(departmentShiftHoldTimerRef.current);
                                                                        departmentShiftHoldTimerRef.current = null;
                                                                    }
                                                                }}
                                                                onMouseLeave={() => {
                                                                    if (isPaidDate) return;
                                                                    if (!departmentTimesheetIsEditableMonth) return;
                                                                    if (departmentShiftHoldTimerRef.current) {
                                                                        window.clearTimeout(departmentShiftHoldTimerRef.current);
                                                                        departmentShiftHoldTimerRef.current = null;
                                                                    }
                                                                }}
                                                                onTouchStart={(e) => {
                                                                    if (isPaidDate) return;
                                                                    if (!departmentTimesheetIsEditableMonth) return;
                                                                    if (departmentShiftHoldTimerRef.current) window.clearTimeout(departmentShiftHoldTimerRef.current);
                                                                    departmentShiftHoldTriggeredRef.current = false;
                                                                    const touch = e.touches[0];
                                                                    departmentShiftHoldTimerRef.current = window.setTimeout(() => {
                                                                        departmentShiftHoldTriggeredRef.current = true;
                                                                        setDepartmentShiftPicker({ key, employeeId: emp.id, day, x: touch.clientX, y: touch.clientY, isShift });
                                                                    }, 450);
                                                                }}
                                                                onTouchEnd={() => {
                                                                    if (isPaidDate) return;
                                                                    if (!departmentTimesheetIsEditableMonth) return;
                                                                    if (departmentShiftHoldTimerRef.current) {
                                                                        window.clearTimeout(departmentShiftHoldTimerRef.current);
                                                                        departmentShiftHoldTimerRef.current = null;
                                                                    }
                                                                }}
                                                                style={{
                                                                    width: '2.2rem',
                                                                    height: '1.6rem',
                                                                    minWidth: '2.2rem',
                                                                    boxSizing: 'border-box',
                                                                    border: shiftMarkStyle.border,
                                                                    borderRadius: 999,
                                                                    background: shiftMarkStyle.background,
                                                                    color: shiftMarkStyle.color,
                                                                    padding: 0,
                                                                    lineHeight: '1.6rem',
                                                                    textAlign: 'center',
                                                                    fontWeight: 600,
                                                                    fontSize: shiftMark ? '0.82rem' : '1rem',
                                                                    WebkitAppearance: 'none',
                                                                    appearance: 'none',
                                                                    display: 'block',
                                                                    margin: '0 auto',
                                                                    position: 'relative',
                                                                    overflow: 'visible',
                                                                    cursor: departmentTimesheetIsEditableMonth && !isPaidDate ? 'pointer' : 'default',
                                                                    opacity: departmentTimesheetIsEditableMonth && !isPaidDate ? 1 : 0.85,
                                                                }}
                                                                aria-label={shiftMark ? `Статус ${shiftMark}. Нажмите для Я/○, удерживайте для выбора` : 'Нажмите для Я, удерживайте для выбора статуса'}
                                                                title={isPaidDate ? `Этот день уже оплачен. ${shiftRateHint}` : (shiftMark ? `Статус: ${shiftMark}. ${shiftRateHint}` : `Нажмите для Я, удерживайте для выбора. ${shiftRateHint}`)}
                                                            >
                                                                {shiftMark || '○'}
                                                                {isPaidDate ? (
                                                                    <span
                                                                        style={{
                                                                            position: 'absolute',
                                                                            left: '50%',
                                                                            bottom: '-0.68rem',
                                                                            transform: 'translateX(-50%)',
                                                                            fontSize: '0.58rem',
                                                                            fontWeight: 700,
                                                                            lineHeight: 1,
                                                                            padding: '0.07rem 0.22rem',
                                                                            borderRadius: 999,
                                                                            border: '1px solid #15803d',
                                                                            color: '#15803d',
                                                                            background: '#dcfce7',
                                                                            whiteSpace: 'nowrap',
                                                                        }}
                                                                    >
                                                                        опл
                                                                    </span>
                                                                ) : null}
                                                            </button>
                                                            {isShift && shiftMark === 'Я' ? (
                                                                <input
                                                                    type="number"
                                                                    min={0}
                                                                    step={1}
                                                                    value={
                                                                        Number.isFinite(departmentTimesheetShiftRateOverrides[key])
                                                                            ? String(departmentTimesheetShiftRateOverrides[key])
                                                                            : ''
                                                                    }
                                                                    placeholder={String(Number(emp.accrualRate || 0))}
                                                                    disabled={!departmentTimesheetIsEditableMonth || isPaidDate}
                                                                    onChange={(e) => {
                                                                        if (isPaidDate || !departmentTimesheetIsEditableMonth) return;
                                                                        const nextRaw = e.target.value;
                                                                        if (nextRaw.trim() === '') {
                                                                            setDepartmentTimesheetShiftRateOverrides((prev) => {
                                                                                const next = { ...prev };
                                                                                delete next[key];
                                                                                return next;
                                                                            });
                                                                            void saveDepartmentTimesheetShiftRate(emp.id, day, '');
                                                                            return;
                                                                        }
                                                                        const parsed = Number(nextRaw);
                                                                        if (!Number.isFinite(parsed) || parsed < 0) return;
                                                                        setDepartmentTimesheetShiftRateOverrides((prev) => ({
                                                                            ...prev,
                                                                            [key]: Number(parsed.toFixed(2)),
                                                                        }));
                                                                        void saveDepartmentTimesheetShiftRate(emp.id, day, String(parsed));
                                                                    }}
                                                                    style={{
                                                                        width: '3.4rem',
                                                                        minWidth: '3.4rem',
                                                                        boxSizing: 'border-box',
                                                                        border: '1px solid var(--color-border)',
                                                                        borderRadius: 6,
                                                                        background: 'var(--color-bg)',
                                                                        padding: '0.08rem 0.2rem',
                                                                        textAlign: 'center',
                                                                        fontSize: '0.68rem',
                                                                        lineHeight: 1.1,
                                                                    }}
                                                                    aria-label="Ручная стоимость смены"
                                                                    title={`Стоимость смены (переопределение). ${shiftRateHint}. Факт: ${effectiveShiftRate.toLocaleString('ru-RU')} ₽`}
                                                                />
                                                            ) : null}
                                                        </div>
                                                    ) : (
                                                        <div style={{ display: 'grid', justifyItems: 'center', rowGap: '0.12rem' }}>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    if (isPaidDate) return;
                                                                    if (!departmentTimesheetIsEditableMonth) return;
                                                                    if (departmentShiftHoldTriggeredRef.current) {
                                                                        departmentShiftHoldTriggeredRef.current = false;
                                                                        return;
                                                                    }
                                                                    const nextMark = hourlyMark === 'Я' ? 'В' : 'Я';
                                                                    const nextValue = nextMark === 'Я' ? (hourInputValue || 'Я') : 'В';
                                                                    setDepartmentTimesheetHours((prev) => ({ ...prev, [key]: nextValue }));
                                                                    void saveDepartmentTimesheetCell(emp.id, day, nextValue);
                                                                }}
                                                                onMouseDown={(e) => {
                                                                    if (isPaidDate) return;
                                                                    if (!departmentTimesheetIsEditableMonth) return;
                                                                    if (departmentShiftHoldTimerRef.current) window.clearTimeout(departmentShiftHoldTimerRef.current);
                                                                    departmentShiftHoldTriggeredRef.current = false;
                                                                    const { clientX, clientY } = e;
                                                                    departmentShiftHoldTimerRef.current = window.setTimeout(() => {
                                                                        departmentShiftHoldTriggeredRef.current = true;
                                                                        setDepartmentShiftPicker({ key, employeeId: emp.id, day, x: clientX, y: clientY, isShift: false });
                                                                    }, 450);
                                                                }}
                                                                onMouseUp={() => {
                                                                    if (departmentShiftHoldTimerRef.current) {
                                                                        window.clearTimeout(departmentShiftHoldTimerRef.current);
                                                                        departmentShiftHoldTimerRef.current = null;
                                                                    }
                                                                }}
                                                                onMouseLeave={() => {
                                                                    if (departmentShiftHoldTimerRef.current) {
                                                                        window.clearTimeout(departmentShiftHoldTimerRef.current);
                                                                        departmentShiftHoldTimerRef.current = null;
                                                                    }
                                                                }}
                                                                onTouchStart={(e) => {
                                                                    if (isPaidDate) return;
                                                                    if (!departmentTimesheetIsEditableMonth) return;
                                                                    if (departmentShiftHoldTimerRef.current) window.clearTimeout(departmentShiftHoldTimerRef.current);
                                                                    departmentShiftHoldTriggeredRef.current = false;
                                                                    const touch = e.touches[0];
                                                                    departmentShiftHoldTimerRef.current = window.setTimeout(() => {
                                                                        departmentShiftHoldTriggeredRef.current = true;
                                                                        setDepartmentShiftPicker({ key, employeeId: emp.id, day, x: touch.clientX, y: touch.clientY, isShift: false });
                                                                    }, 450);
                                                                }}
                                                                onTouchEnd={() => {
                                                                    if (departmentShiftHoldTimerRef.current) {
                                                                        window.clearTimeout(departmentShiftHoldTimerRef.current);
                                                                        departmentShiftHoldTimerRef.current = null;
                                                                    }
                                                                }}
                                                                style={{
                                                                    width: '2.2rem',
                                                                    height: '1.6rem',
                                                                    minWidth: '2.2rem',
                                                                    boxSizing: 'border-box',
                                                                    border: hourlyMarkStyle.border,
                                                                    borderRadius: 999,
                                                                    background: hourlyMarkStyle.background,
                                                                    color: hourlyMarkStyle.color,
                                                                    padding: 0,
                                                                    lineHeight: '1.6rem',
                                                                    textAlign: 'center',
                                                                    fontWeight: 600,
                                                                    fontSize: hourlyMark ? '0.82rem' : '1rem',
                                                                    WebkitAppearance: 'none',
                                                                    appearance: 'none',
                                                                    display: 'block',
                                                                    margin: '0 auto',
                                                                    position: 'relative',
                                                                    overflow: 'visible',
                                                                    cursor: departmentTimesheetIsEditableMonth && !isPaidDate ? 'pointer' : 'default',
                                                                    opacity: departmentTimesheetIsEditableMonth && !isPaidDate ? 1 : 0.85,
                                                                }}
                                                                aria-label={hourlyMark ? `Статус ${hourlyMark}. Нажмите для Я/В, удерживайте для выбора` : 'Нажмите для Я, удерживайте для выбора статуса'}
                                                                title={isPaidDate ? 'Этот день уже оплачен' : (hourlyMark ? `Статус: ${hourlyMark}` : 'Сначала отметьте статус')}
                                                            >
                                                                {hourlyMark || 'В'}
                                                                {isPaidDate ? (
                                                                    <span
                                                                        style={{
                                                                            position: 'absolute',
                                                                            left: '50%',
                                                                            bottom: '-0.68rem',
                                                                            transform: 'translateX(-50%)',
                                                                            fontSize: '0.58rem',
                                                                            fontWeight: 700,
                                                                            lineHeight: 1,
                                                                            padding: '0.07rem 0.22rem',
                                                                            borderRadius: 999,
                                                                            border: '1px solid #15803d',
                                                                            color: '#15803d',
                                                                            background: '#dcfce7',
                                                                            whiteSpace: 'nowrap',
                                                                        }}
                                                                    >
                                                                        опл
                                                                    </span>
                                                                ) : null}
                                                            </button>
                                                            {departmentTimesheetMobilePicker ? (
                                                                <select
                                                                    value={hourPickerValue}
                                                                    disabled={!departmentTimesheetIsEditableMonth || isPaidDate || !hourlyHoursEnabled}
                                                                    onChange={(e) => {
                                                                        if (isPaidDate) return;
                                                                        if (!departmentTimesheetIsEditableMonth) return;
                                                                        if (!hourlyHoursEnabled) return;
                                                                        const nextValue = e.target.value;
                                                                        setDepartmentTimesheetHours((prev) => ({ ...prev, [key]: nextValue }));
                                                                        void saveDepartmentTimesheetCell(emp.id, day, nextValue);
                                                                    }}
                                                                    style={{ width: '4.3rem', minWidth: 36, boxSizing: 'border-box', border: '1px solid var(--color-border)', borderRadius: 6, background: 'var(--color-bg)', padding: '0 0.2rem', textAlign: 'center', display: 'block', margin: '0 auto' }}
                                                                    aria-label="Количество часов за день"
                                                                >
                                                                    {departmentTimesheetHalfHourOptions.map((opt) => (
                                                                        <option key={`${key}-opt-${opt.value}`} value={opt.value}>{opt.label}</option>
                                                                    ))}
                                                                </select>
                                                            ) : (
                                                                <input
                                                                    type="number"
                                                                    min={0}
                                                                    max={24}
                                                                    step={0.5}
                                                                    value={hourInputValue}
                                                                    disabled={!departmentTimesheetIsEditableMonth || isPaidDate || !hourlyHoursEnabled}
                                                                    onChange={(e) => {
                                                                        if (isPaidDate) return;
                                                                        if (!departmentTimesheetIsEditableMonth) return;
                                                                        if (!hourlyHoursEnabled) return;
                                                                        const nextRaw = e.target.value;
                                                                        const next = nextRaw.replace(/[^0-9.,]/g, '').replace(',', '.');
                                                                        const nextValue = next.trim() === '' ? 'Я' : next;
                                                                        setDepartmentTimesheetHours((prev) => ({ ...prev, [key]: nextValue }));
                                                                        void saveDepartmentTimesheetCell(emp.id, day, nextValue);
                                                                    }}
                                                                    placeholder="0"
                                                                    style={{ width: '100%', minWidth: 36, boxSizing: 'border-box', border: '1px solid var(--color-border)', borderRadius: 6, background: 'var(--color-bg)', padding: '0.2rem 0.25rem', textAlign: 'center' }}
                                                                />
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                            );
                                        })}
                                        <td style={{ borderBottom: '1px solid var(--color-border)', padding: '0.35rem 0.4rem', textAlign: 'center' }}>
                                            <Typography.Body style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', lineHeight: 1.2 }}>
                                                {totalPrimaryText}
                                            </Typography.Body>
                                            <Typography.Body style={{ display: 'block', marginTop: '0.15rem', fontSize: '0.76rem', color: 'var(--color-text-secondary)', lineHeight: 1.2 }}>
                                                {Number(totalMoney.toFixed(2))} ₽
                                            </Typography.Body>
                                            <Typography.Body style={{ display: 'block', marginTop: '0.12rem', fontSize: '0.72rem', color: '#065f46', lineHeight: 1.2 }}>
                                                Выплачено: {Number(totalPaid.toFixed(2)).toLocaleString('ru-RU')} ₽
                                            </Typography.Body>
                                            <Typography.Body style={{ display: 'block', marginTop: '0.08rem', fontSize: '0.72rem', color: '#15803d', lineHeight: 1.2 }}>
                                                Остаток: {Number(totalOutstanding.toFixed(2)).toLocaleString('ru-RU')} ₽
                                            </Typography.Body>
                                        </td>
                                        {SHIFT_MARK_CODES.map((code) => (
                                            <td key={`${emp.id}-legend-${code}`} style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'center', padding: '0.35rem 0.2rem' }}>
                                                <Typography.Body style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                                                    {legendCounts[code] || 0}
                                                </Typography.Body>
                                            </td>
                                        ))}
                                    </tr>
                                    {departmentTimesheetExpandedEmployeeId === emp.id ? (
                                        <tr>
                                            <td
                                                colSpan={deptTimesheetColSpan}
                                                style={{
                                                    padding: "0.55rem",
                                                    borderBottom: "1px solid var(--color-border)",
                                                    background: "var(--color-bg-hover)",
                                                }}
                                            >
                                                <Typography.Body style={{ fontSize: "0.82rem", fontWeight: 600, marginBottom: "0.35rem", display: "block" }}>
                                                    Выплаты сотрудника
                                                </Typography.Body>
                                                <Typography.Body style={{ fontSize: "0.74rem", color: "var(--color-text-secondary)", marginBottom: "0.45rem", display: "block" }}>
                                                    Просмотр за {departmentTimesheetMonth}. Создание и правка выплат — в админке.
                                                </Typography.Body>
                                                {employeePayouts.length === 0 ? (
                                                    <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>
                                                        Выплат за этот месяц пока нет.
                                                    </Typography.Body>
                                                ) : (
                                                    <div style={{ overflowX: "auto" }}>
                                                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                                                            <thead>
                                                                <tr>
                                                                    <th style={{ textAlign: "left", padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>Дата выплаты</th>
                                                                    <th style={{ textAlign: "left", padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>За период</th>
                                                                    <th style={{ textAlign: "right", padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>Сумма</th>
                                                                    {showPayoutTaxColumns ? (
                                                                        <th style={{ textAlign: "right", padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>Налог</th>
                                                                    ) : null}
                                                                    {showPayoutTaxColumns ? (
                                                                        <th style={{ textAlign: "right", padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>Сумма с налогом</th>
                                                                    ) : null}
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {employeePayouts.map((payout) => (
                                                                    <tr key={`dept-ts-payout-${emp.id}-${payout.id}`}>
                                                                        <td style={{ padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>{payout.payoutDate}</td>
                                                                        <td style={{ padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)" }}>
                                                                            {payout.periodFrom} — {payout.periodTo}
                                                                        </td>
                                                                        <td style={{ padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)", textAlign: "right", fontWeight: 600 }}>
                                                                            {Number(payout.amount || 0).toLocaleString("ru-RU")} ₽
                                                                        </td>
                                                                        {showPayoutTaxColumns ? (
                                                                            <td style={{ padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)", textAlign: "right", color: "#b45309" }}>
                                                                                {Number(payout.taxAmount || 0).toLocaleString("ru-RU")} ₽
                                                                            </td>
                                                                        ) : null}
                                                                        {showPayoutTaxColumns ? (
                                                                            <td style={{ padding: "0.28rem 0.35rem", borderBottom: "1px solid var(--color-border)", textAlign: "right", fontWeight: 700, color: "#92400e" }}>
                                                                                {Number(Number(payout.amount || 0) + Number(payout.taxAmount || 0)).toLocaleString("ru-RU")} ₽
                                                                            </td>
                                                                        ) : null}
                                                                    </tr>
                                                                ))}
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
                    <Flex align="center" gap="0.5rem" wrap="wrap" style={{ marginTop: '0.65rem' }}>
                        <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>Я - Явка</Typography.Body>
                        <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>ПР - прогул</Typography.Body>
                        <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>Б - Болезнь</Typography.Body>
                        <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>В - Выходной</Typography.Body>
                        <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>ОГ - Отгул</Typography.Body>
                        <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>ОТ - отпуск</Typography.Body>
                        <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>УВ - Уволен</Typography.Body>
                    </Flex>
                    {visibleDepartmentTimesheetSummaries.map((summary, idx) => (
                        <Panel key={`department-summary-${summary.departmentName}`} className="cargo-card" style={{ marginTop: idx === 0 ? '0.7rem' : '0.45rem', padding: '0.7rem' }}>
                            <Typography.Body style={{ fontWeight: 600 }}>
                                Итого по подразделению: {summary.departmentName} · {summary.totalShifts} смен · {summary.totalHours} ч
                            </Typography.Body>
                            <Typography.Body style={{ marginTop: '0.12rem', color: 'var(--color-text-secondary)' }}>
                                {summary.totalMoney.toLocaleString('ru-RU')} ₽
                            </Typography.Body>
                            <Typography.Body style={{ marginTop: '0.08rem', color: '#065f46', fontSize: '0.84rem' }}>
                                Выплачено: {summary.totalPaid.toLocaleString('ru-RU')} ₽
                            </Typography.Body>
                            <Typography.Body style={{ marginTop: '0.08rem', color: '#15803d', fontSize: '0.84rem' }}>
                                Остаток: {summary.totalOutstanding.toLocaleString('ru-RU')} ₽
                            </Typography.Body>
                        </Panel>
                    ))}
                    {activeAccount?.permissions?.analytics === true ? (
                        <Panel className="cargo-card" style={{ marginTop: '0.45rem', padding: '0.7rem' }}>
                            <Typography.Body style={{ fontWeight: 600 }}>
                                {departmentTimesheetAllDepartments && departmentTimesheetDepartmentFilter !== "all"
                                    ? `Итого по выбранному подразделению: ${filteredDepartmentTimesheetSummary.totalShifts} смен · ${filteredDepartmentTimesheetSummary.totalHours} ч`
                                    : `Итого по компании: ${companyTimesheetSummary.totalShifts} смен · ${companyTimesheetSummary.totalHours} ч`}
                            </Typography.Body>
                            <Typography.Body style={{ marginTop: '0.12rem', color: 'var(--color-text-secondary)' }}>
                                {(departmentTimesheetAllDepartments && departmentTimesheetDepartmentFilter !== "all"
                                    ? filteredDepartmentTimesheetSummary.totalMoney
                                    : companyTimesheetSummary.totalMoney
                                ).toLocaleString('ru-RU')} ₽
                            </Typography.Body>
                            <Typography.Body style={{ marginTop: '0.08rem', color: '#065f46', fontSize: '0.84rem' }}>
                                Выплачено: {(departmentTimesheetAllDepartments && departmentTimesheetDepartmentFilter !== "all"
                                    ? filteredDepartmentTimesheetSummary.totalPaid
                                    : companyTimesheetSummary.totalPaid
                                ).toLocaleString('ru-RU')} ₽
                            </Typography.Body>
                            <Typography.Body style={{ marginTop: '0.08rem', color: '#15803d', fontSize: '0.84rem' }}>
                                Остаток: {(departmentTimesheetAllDepartments && departmentTimesheetDepartmentFilter !== "all"
                                    ? filteredDepartmentTimesheetSummary.totalOutstanding
                                    : companyTimesheetSummary.totalOutstanding
                                ).toLocaleString('ru-RU')} ₽
                            </Typography.Body>
                        </Panel>
                    ) : null}
                    </>
                )}
                {departmentShiftPicker ? (
                    <div
                        style={{ position: 'fixed', inset: 0, zIndex: 10000 }}
                        onClick={() => setDepartmentShiftPicker(null)}
                    >
                        <div
                            style={{
                                position: 'fixed',
                                top: typeof window !== 'undefined' ? Math.min(departmentShiftPicker.y + 8, window.innerHeight - 220) : departmentShiftPicker.y + 8,
                                left: typeof window !== 'undefined' ? Math.min(departmentShiftPicker.x - 80, window.innerWidth - 190) : departmentShiftPicker.x - 80,
                                width: 180,
                                background: 'var(--color-bg-card, #fff)',
                                border: '1px solid var(--color-border)',
                                borderRadius: 10,
                                padding: '0.4rem',
                                boxShadow: '0 10px 24px rgba(0,0,0,0.15)',
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {SHIFT_MARK_OPTIONS.map((opt) => (
                                <button
                                    key={`dept-shift-mark-${opt.code}`}
                                    type="button"
                                    onClick={() => {
                                        const currentValue = departmentTimesheetHours[departmentShiftPicker.key] || '';
                                        const currentHours = parseHourValue(currentValue);
                                        const nextValue = opt.code === 'Я' && !departmentShiftPicker.isShift
                                            ? (currentHours > 0 ? String(currentHours) : 'Я')
                                            : opt.code;
                                        setDepartmentTimesheetHours((prev) => ({ ...prev, [departmentShiftPicker.key]: nextValue }));
                                        if (departmentShiftPicker.isShift && nextValue !== 'Я') {
                                            setDepartmentTimesheetShiftRateOverrides((prev) => {
                                                const next = { ...prev };
                                                delete next[departmentShiftPicker.key];
                                                return next;
                                            });
                                            void saveDepartmentTimesheetShiftRate(departmentShiftPicker.employeeId, departmentShiftPicker.day, '');
                                        }
                                        void saveDepartmentTimesheetCell(departmentShiftPicker.employeeId, departmentShiftPicker.day, nextValue);
                                        setDepartmentShiftPicker(null);
                                    }}
                                    style={{
                                        width: '100%',
                                        marginBottom: '0.25rem',
                                        padding: '0.35rem 0.5rem',
                                        borderRadius: 8,
                                        border: `1px solid ${opt.border}`,
                                        background: opt.bg,
                                        color: opt.color,
                                        textAlign: 'left',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                    }}
                                >
                                    {opt.code} - {opt.label}
                                </button>
                            ))}
                            <button
                                type="button"
                                onClick={() => {
                                    setDepartmentTimesheetHours((prev) => ({ ...prev, [departmentShiftPicker.key]: '' }));
                                    if (departmentShiftPicker.isShift) {
                                        setDepartmentTimesheetShiftRateOverrides((prev) => {
                                            const next = { ...prev };
                                            delete next[departmentShiftPicker.key];
                                            return next;
                                        });
                                        void saveDepartmentTimesheetShiftRate(departmentShiftPicker.employeeId, departmentShiftPicker.day, '');
                                    }
                                    void saveDepartmentTimesheetCell(departmentShiftPicker.employeeId, departmentShiftPicker.day, '');
                                    setDepartmentShiftPicker(null);
                                }}
                                style={{
                                    width: '100%',
                                    padding: '0.3rem 0.5rem',
                                    borderRadius: 8,
                                    border: '1px solid var(--color-border)',
                                    background: 'var(--color-bg)',
                                    color: 'var(--color-text-secondary)',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                }}
                            >
                                ○ - очистить
                            </button>
                        </div>
                    </div>
                ) : null}
            </div>
        );
    }

    if (currentView === 'employees') {
        return (
            <div className="w-full">
                <Flex align="center" style={{ marginBottom: '1rem', gap: '0.75rem' }}>
                    <Button className="filter-button" onClick={() => setCurrentView('main')} style={{ padding: '0.5rem' }}>
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <Typography.Headline style={{ fontSize: '1.25rem' }}>Справочник сотрудников</Typography.Headline>
                </Flex>
                <Typography.Body style={{ marginBottom: '1rem', color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                    Регистрируйте сотрудников компании: укажите ФИО и пресет роли. Пароль для входа отправляется на email.
                </Typography.Body>
                {!activeAccount?.isRegisteredUser ? (
                    <Panel className="cargo-card" style={{ padding: '1rem' }}>
                        <Typography.Body style={{ color: 'var(--color-text-secondary)' }}>Доступно только зарегистрированным пользователям (вход по email и паролю).</Typography.Body>
                    </Panel>
                ) : !activeAccount?.login || !activeAccount?.password ? (
                    <Panel className="cargo-card" style={{ padding: '1rem' }}>
                        <Typography.Body style={{ color: 'var(--color-text-secondary)' }}>Нужны логин и пароль текущего аккаунта для управления сотрудниками.</Typography.Body>
                    </Panel>
                ) : activeAccount.permissions?.supervisor !== true ? (
                    <Panel className="cargo-card" style={{ padding: '1rem' }}>
                        <Typography.Body style={{ color: 'var(--color-text-secondary)' }}>Раздел «Сотрудники» доступен только при включённом праве «Руководитель» в админке.</Typography.Body>
                    </Panel>
                ) : activeAccount.inCustomerDirectory === false ? (
                    <>
                        <Panel className="cargo-card" style={{ padding: '1rem', marginBottom: '1rem' }}>
                            <Typography.Body style={{ color: 'var(--color-text-secondary)' }}>Приглашать сотрудников могут только пользователи, чья компания есть в справочнике заказчиков.</Typography.Body>
                        </Panel>
                        <div style={{ marginTop: '1rem' }}>
                            <Typography.Body style={{ fontWeight: 600, marginBottom: '0.5rem', display: 'block' }}>Справочник сотрудников</Typography.Body>
                            {employeesLoading ? (
                                <Flex align="center" gap="0.5rem"><Loader2 className="w-4 h-4 animate-spin" /><Typography.Body>Загрузка...</Typography.Body></Flex>
                            ) : employeesError ? (
                                <Typography.Body style={{ color: 'var(--color-error)' }}>{employeesError}</Typography.Body>
                            ) : employeesList.length === 0 ? (
                                <Typography.Body style={{ color: 'var(--color-text-secondary)' }}>Пока никого не приглашали.</Typography.Body>
                            ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {employeesList.map((emp) => (
                                    <Panel key={emp.id} className="cargo-card" style={{ padding: '0.75rem' }}>
                                        <Flex align="center" justify="space-between" wrap="wrap" gap="0.5rem">
                                            <div>
                                                <Typography.Body style={{ fontWeight: 600 }}>{emp.fullName || emp.login}</Typography.Body>
                                                <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                                                    {emp.department ? `${emp.department} · ` : ''}{emp.presetLabel} · {emp.active ? 'Доступ включён' : 'Отключён'}
                                                </Typography.Body>
                                            </div>
                                            <Flex align="center" gap="0.5rem" wrap="wrap">
                                                <select
                                                    className="admin-form-input invite-role-select"
                                                    value={rolePresets.find((p) => p.label === emp.presetLabel)?.id ?? rolePresets[0]?.id ?? ''}
                                                    disabled={rolePresets.length === 0 || employeePresetLoadingId === emp.id}
                                                    onChange={async (e) => {
                                                        const presetId = e.target.value;
                                                        if (!presetId || !activeAccount?.login || !activeAccount?.password) return;
                                                        setEmployeePresetLoadingId(emp.id);
                                                        setEmployeesError(null);
                                                        try {
                                                            const res = await fetch(`/api/my-employees?id=${emp.id}`, {
                                                                method: 'PATCH',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify({ login: activeAccount.login, password: activeAccount.password, presetId }),
                                                            });
                                                            const data = await res.json().catch(() => ({}));
                                                            if (!res.ok) throw new Error(data.error || 'Ошибка');
                                                            const newLabel = rolePresets.find((p) => p.id === presetId)?.label ?? emp.presetLabel;
                                                            setEmployeesList((prev) => prev.map((e) => e.id === emp.id ? { ...e, presetLabel: newLabel } : e));
                                                        } catch (e) {
                                                            setEmployeesError((e as Error)?.message || 'Не удалось изменить роль');
                                                        } finally {
                                                            setEmployeePresetLoadingId(null);
                                                        }
                                                    }}
                                                    style={{ padding: '0.35rem 0.5rem', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', fontSize: '0.85rem', minWidth: '8rem' }}
                                                    aria-label="Роль (пресет)"
                                                    title="Изменить роль"
                                                >
                                                    {rolePresets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                                                </select>
                                                <Typography.Body style={{ fontSize: '0.85rem' }}>{emp.active ? 'Вкл' : 'Выкл'}</Typography.Body>
                                                <TapSwitch
                                                    checked={emp.active}
                                                    onToggle={async () => {
                                                        setEmployeesError(null);
                                                        try {
                                                            const res = await fetch(`/api/my-employees?id=${emp.id}`, {
                                                                method: 'PATCH',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify({ login: activeAccount.login, password: activeAccount.password, active: !emp.active }),
                                                            });
                                                            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Не удалось изменить доступ');
                                                            setEmployeesList((prev) => prev.map((e) => e.id === emp.id ? { ...e, active: !e.active } : e));
                                                        } catch (e) {
                                                            setEmployeesError((e as Error)?.message || 'Не удалось изменить доступ');
                                                        }
                                                    }}
                                                />
                                                <Button
                                                    type="button"
                                                    className="filter-button"
                                                    style={{ padding: '0.35rem' }}
                                                    aria-label="Удалить сотрудника"
                                                    onClick={() => setEmployeeDeleteId(emp.id)}
                                                >
                                                    <Trash2 className="w-4 h-4" style={{ color: 'var(--color-error)' }} />
                                                </Button>
                                            </Flex>
                                        </Flex>
                                    </Panel>
                                ))}
                                {employeeDeleteId != null && (() => {
                                    const emp = employeesList.find((e) => e.id === employeeDeleteId);
                                    const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
                                    return (
                                        <div className="modal-overlay" style={{ zIndex: 10000 }} role="dialog" aria-modal="true" aria-labelledby="employee-delete-title" onClick={() => !employeeDeleteLoading && setEmployeeDeleteId(null)}>
                                            <div className="modal-content" style={{ maxWidth: '22rem', padding: '1.25rem' }} onClick={(e) => e.stopPropagation()}>
                                                <Typography.Body id="employee-delete-title" style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Удалить сотрудника?</Typography.Body>
                                                <Typography.Body style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
                                                    {(emp?.fullName || emp?.login || '')} будет удалён из списка и не сможет войти в приложение.
                                                </Typography.Body>
                                                <Flex gap="0.5rem" wrap="wrap">
                                                    <Button
                                                        type="button"
                                                        disabled={employeeDeleteLoading}
                                                        style={{ background: 'var(--color-error)', color: '#fff', border: 'none' }}
                                                        onClick={async () => {
                                                            if (!activeAccount?.login || !activeAccount?.password || employeeDeleteLoading) return;
                                                            setEmployeeDeleteLoading(true);
                                                            try {
                                                                const res = await fetch(`${origin}/api/my-employees?id=${encodeURIComponent(employeeDeleteId)}`, {
                                                                    method: 'DELETE',
                                                                    headers: { 'Content-Type': 'application/json' },
                                                                    body: JSON.stringify({ login: activeAccount.login, password: activeAccount.password }),
                                                                });
                                                                if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
                                                                setEmployeesList((prev) => prev.filter((e) => e.id !== employeeDeleteId));
                                                                setEmployeeDeleteId(null);
                                                            } finally {
                                                                setEmployeeDeleteLoading(false);
                                                            }
                                                        }}
                                                    >
                                                        {employeeDeleteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Удалить'}
                                                    </Button>
                                                    <Button type="button" className="filter-button" onClick={() => !employeeDeleteLoading && setEmployeeDeleteId(null)}>Отмена</Button>
                                                </Flex>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                            )}
                        </div>
                    </>
                ) : (
                    <>
                        <Panel className="cargo-card" style={{ padding: '1rem', marginBottom: '1rem' }}>
                            <Typography.Body style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Регистрация сотрудника</Typography.Body>
                            <Flex className="form-row-same-height invite-form-row" gap="0.5rem" wrap="wrap" align="center" style={{ marginBottom: '0.5rem' }}>
                                <input
                                    type="text"
                                    placeholder="Email сотрудника"
                                    value={inviteEmail}
                                    onChange={(e) => { setInviteEmail(e.target.value); setInviteError(null); setInviteSuccess(null); }}
                                    style={{ width: '12rem', minWidth: '10rem', height: '2.5rem', boxSizing: 'border-box' }}
                                    className="admin-form-input"
                                    autoComplete="off"
                                />
                                <Input
                                    type="text"
                                    placeholder="ФИО"
                                    value={inviteFullName}
                                    onChange={(e) => { setInviteFullName(e.target.value); setInviteError(null); setInviteSuccess(null); }}
                                    style={{ width: '14rem', minWidth: '12rem', height: '2.5rem', boxSizing: 'border-box' }}
                                    className="admin-form-input"
                                />
                                <select
                                    className="admin-form-input invite-role-select"
                                    value={invitePresetId}
                                    onChange={(e) => { setInvitePresetId(e.target.value); setInviteError(null); }}
                                    style={{ padding: '0 0.6rem', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', fontSize: '0.9rem', height: '2.5rem', boxSizing: 'border-box', minWidth: '10rem' }}
                                    aria-label="Выберите роль"
                                    title={rolePresets.length === 0 ? 'Роли загружаются или не настроены' : undefined}
                                >
                                    <option value="">{rolePresets.length === 0 ? 'Нет ролей' : 'Выберите роль'}</option>
                                    {rolePresets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                                </select>
                                <Button type="button" className="filter-button" onClick={() => void fetchEmployeesAndPresets()} disabled={employeesLoading} title="Обновить список ролей и сотрудников" style={{ height: '2.5rem', padding: '0 1rem', boxSizing: 'border-box' }}>
                                    Обновить
                                </Button>
                                <Button
                                    type="button"
                                    className="button-primary"
                                    style={{ height: '2.5rem', padding: '0 1rem', boxSizing: 'border-box' }}
                                    disabled={inviteLoading || !inviteEmail.trim() || !inviteFullName.trim() || !invitePresetId}
                                    onClick={async () => {
                                        setInviteError(null); setInviteSuccess(null); setInviteLoading(true);
                                        try {
                                            const res = await fetch('/api/my-employees', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                    login: activeAccount.login,
                                                    password: activeAccount.password,
                                                    email: inviteEmail.trim(),
                                                    fullName: inviteFullName.trim(),
                                                    department: '',
                                                    employeeRole: 'employee',
                                                    presetId: invitePresetId
                                                }),
                                            });
                                            const data = await res.json().catch(() => ({}));
                                            if (!res.ok) throw new Error(data.error || 'Ошибка');
                                            setInviteSuccess(data.message || 'Готово');
                                            setInviteEmail(''); setInviteFullName(''); setInvitePresetId('');
                                            fetchEmployeesAndPresets();
                                        } catch (e) {
                                            setInviteError((e as Error)?.message || 'Ошибка приглашения');
                                        } finally {
                                            setInviteLoading(false);
                                        }
                                    }}
                                >
                                    {inviteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Пригласить'}
                                </Button>
                            </Flex>
                            {rolePresets.length === 0 && (
                                <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem' }}>
                                    Роли не загружены. Создайте пресеты в админ-панели (раздел «Пресеты ролей») или нажмите «Обновить».
                                </Typography.Body>
                            )}
                            {inviteError && <Typography.Body style={{ color: 'var(--color-error)', fontSize: '0.85rem' }}>{inviteError}</Typography.Body>}
                            {inviteSuccess && <Typography.Body style={{ color: 'var(--color-success-status)', fontSize: '0.85rem' }}>{inviteSuccess}</Typography.Body>}
                        </Panel>
                        <div style={{ marginTop: '1rem' }}>
                            <Typography.Body style={{ fontWeight: 600, marginBottom: '0.5rem', display: 'block' }}>Справочник сотрудников</Typography.Body>
                            {employeesLoading ? (
                                <Flex align="center" gap="0.5rem"><Loader2 className="w-4 h-4 animate-spin" /><Typography.Body>Загрузка...</Typography.Body></Flex>
                            ) : employeesError ? (
                                <Typography.Body style={{ color: 'var(--color-error)' }}>{employeesError}</Typography.Body>
                            ) : employeesList.length === 0 ? (
                                <Typography.Body style={{ color: 'var(--color-text-secondary)' }}>Пока никого не приглашали.</Typography.Body>
                            ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {employeesList.map((emp) => (
                                    <Panel key={emp.id} className="cargo-card" style={{ padding: '0.75rem' }}>
                                        <Flex align="center" justify="space-between" wrap="wrap" gap="0.5rem">
                                            <div>
                                                <Typography.Body style={{ fontWeight: 600 }}>{emp.fullName || emp.login}</Typography.Body>
                                                <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                                                    {emp.department ? `${emp.department} · ` : ''}{emp.presetLabel} · {emp.active ? 'Доступ включён' : 'Отключён'}
                                                </Typography.Body>
                                            </div>
                                            <Flex align="center" gap="0.5rem" wrap="wrap">
                                                <select
                                                    className="admin-form-input invite-role-select"
                                                    value={rolePresets.find((p) => p.label === emp.presetLabel)?.id ?? rolePresets[0]?.id ?? ''}
                                                    disabled={rolePresets.length === 0 || employeePresetLoadingId === emp.id}
                                                    onChange={async (e) => {
                                                        const presetId = e.target.value;
                                                        if (!presetId || !activeAccount?.login || !activeAccount?.password) return;
                                                        setEmployeePresetLoadingId(emp.id);
                                                        setEmployeesError(null);
                                                        try {
                                                            const res = await fetch(`/api/my-employees?id=${emp.id}`, {
                                                                method: 'PATCH',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify({ login: activeAccount.login, password: activeAccount.password, presetId }),
                                                            });
                                                            const data = await res.json().catch(() => ({}));
                                                            if (!res.ok) throw new Error(data.error || 'Ошибка');
                                                            const newLabel = rolePresets.find((p) => p.id === presetId)?.label ?? emp.presetLabel;
                                                            setEmployeesList((prev) => prev.map((e) => e.id === emp.id ? { ...e, presetLabel: newLabel } : e));
                                                        } catch (e) {
                                                            setEmployeesError((e as Error)?.message || 'Не удалось изменить роль');
                                                        } finally {
                                                            setEmployeePresetLoadingId(null);
                                                        }
                                                    }}
                                                    style={{ padding: '0.35rem 0.5rem', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', fontSize: '0.85rem', minWidth: '8rem' }}
                                                    aria-label="Роль (пресет)"
                                                    title="Изменить роль"
                                                >
                                                    {rolePresets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                                                </select>
                                                <Typography.Body style={{ fontSize: '0.85rem' }}>{emp.active ? 'Вкл' : 'Выкл'}</Typography.Body>
                                                <TapSwitch
                                                    checked={emp.active}
                                                    onToggle={async () => {
                                                        setEmployeesError(null);
                                                        try {
                                                            const res = await fetch(`/api/my-employees?id=${emp.id}`, {
                                                                method: 'PATCH',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify({ login: activeAccount.login, password: activeAccount.password, active: !emp.active }),
                                                            });
                                                            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Не удалось изменить доступ');
                                                            setEmployeesList((prev) => prev.map((e) => e.id === emp.id ? { ...e, active: !e.active } : e));
                                                        } catch (e) {
                                                            setEmployeesError((e as Error)?.message || 'Не удалось изменить доступ');
                                                        }
                                                    }}
                                                />
                                                <Button
                                                    type="button"
                                                    className="filter-button"
                                                    style={{ padding: '0.35rem' }}
                                                    aria-label="Удалить сотрудника"
                                                    onClick={() => setEmployeeDeleteId(emp.id)}
                                                >
                                                    <Trash2 className="w-4 h-4" style={{ color: 'var(--color-error)' }} />
                                                </Button>
                                            </Flex>
                                        </Flex>
                                    </Panel>
                                    ))}
                                {employeeDeleteId != null && (() => {
                                    const emp = employeesList.find((e) => e.id === employeeDeleteId);
                                    const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
                                    return (
                                        <div className="modal-overlay" style={{ zIndex: 10000 }} role="dialog" aria-modal="true" aria-labelledby="employee-delete-title" onClick={() => !employeeDeleteLoading && setEmployeeDeleteId(null)}>
                                            <div className="modal-content" style={{ maxWidth: '22rem', padding: '1.25rem' }} onClick={(e) => e.stopPropagation()}>
                                                <Typography.Body id="employee-delete-title" style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Удалить сотрудника?</Typography.Body>
                                                <Typography.Body style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
                                                    {(emp?.fullName || emp?.login || '')} будет удалён из списка и не сможет войти в приложение.
                                                </Typography.Body>
                                                <Flex gap="0.5rem" wrap="wrap">
                                                    <Button
                                                        type="button"
                                                        disabled={employeeDeleteLoading}
                                                        style={{ background: 'var(--color-error)', color: '#fff', border: 'none' }}
                                                        onClick={async () => {
                                                            if (!activeAccount?.login || !activeAccount?.password || employeeDeleteLoading) return;
                                                            setEmployeeDeleteLoading(true);
                                                            try {
                                                                const res = await fetch(`${origin}/api/my-employees?id=${encodeURIComponent(employeeDeleteId)}`, {
                                                                    method: 'DELETE',
                                                                    headers: { 'Content-Type': 'application/json' },
                                                                    body: JSON.stringify({ login: activeAccount.login, password: activeAccount.password }),
                                                                });
                                                                const data = await res.json().catch(() => ({}));
                                                                if (!res.ok) throw new Error(data?.error || 'Ошибка удаления');
                                                                setEmployeesList((prev) => prev.filter((e) => e.id !== employeeDeleteId));
                                                                setEmployeeDeleteId(null);
                                                            } catch (e) {
                                                                setEmployeesError((e as Error)?.message ?? 'Ошибка удаления');
                                                            } finally {
                                                                setEmployeeDeleteLoading(false);
                                                            }
                                                        }}
                                                    >
                                                        {employeeDeleteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                                        {employeeDeleteLoading ? ' Удаление…' : 'Удалить'}
                                                    </Button>
                                                    <Button type="button" className="filter-button" disabled={employeeDeleteLoading} onClick={() => setEmployeeDeleteId(null)}>
                                                        Отмена
                                                    </Button>
                                                </Flex>
                                            </div>
                                        </div>
                                    );
                                })()}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        );
    }
    
    if (currentView === 'addCompanyMethod') {
        return <CompaniesPage onBack={() => setCurrentView('companies')} onSelectMethod={(method) => {
            if (method === 'inn') {
                setCurrentView('addCompanyByINN');
            } else {
                setCurrentView('addCompanyByLogin');
            }
        }} />;
    }
    
    if (currentView === 'addCompanyByINN') {
        return <AddCompanyByINNPage 
            activeAccount={activeAccount}
            onBack={() => setCurrentView('addCompanyMethod')} 
            onSuccess={() => setCurrentView('companies')}
        />;
    }
    
    if (currentView === 'addCompanyByLogin') {
        return <AddCompanyByLoginPage 
            onBack={() => setCurrentView('addCompanyMethod')} 
            onAddAccount={onAddAccount}
            onSuccess={() => setCurrentView('companies')}
        />;
    }

    if (currentView === 'tinyurl-test') {
        return <TinyUrlTestPage onBack={() => setCurrentView('main')} />;
    }

    if (currentView === 'about') {
        return <AboutCompanyPage onBack={() => setCurrentView('main')} />;
    }

    if (currentView === 'voiceAssistants') {
        return (
            <ProfileVoiceAssistantsSection activeAccount={activeAccount} onBack={() => setCurrentView('main')} />
        );
    }

    if (currentView === 'notifications') {
        return (
            <NotificationsPage
                activeAccount={activeAccount}
                activeAccountId={activeAccountId}
                onBack={() => setCurrentView('main')}
                onOpenDeveloper={() => {}}
                onOpenTelegramBot={onOpenTelegramBot}
                onOpenMaxBot={undefined}
                onUpdateAccount={onUpdateAccount}
            />
        );
    }

    if (currentView === 'faq') {
        return <ProfileFaqSection onBack={() => setCurrentView('main')} />;
    }

    if (currentView === '2fa' && activeAccountId && activeAccount) {
        return (
            <ProfileTwoFactorSection
                activeAccount={activeAccount}
                activeAccountId={activeAccountId}
                onBack={() => setCurrentView('main')}
                onUpdateAccount={onUpdateAccount}
                onOpenTelegramBot={onOpenTelegramBot}
            />
        );
    }

    return (
        <div className={profileSaasShellActive ? "w-full profile-saas-layout profile-saas-layout--analytics" : "w-full"}>
            <motion.div {...(shellMotion ? cargoSummaryMotion : { initial: false })}>
                <header className={profileSaasShellActive ? "profile-saas-page-header" : "profile-saas-page-header profile-saas-page-header--legacy"}>
                    <div className="profile-saas-page-header-text">
                        <h1 className="profile-saas-h1">Профиль</h1>
                        {!activeAccount ? (
                            <p className="profile-saas-caption">Выберите компанию в шапке</p>
                        ) : null}
                    </div>
                </header>
            </motion.div>

            {/* Настройки */}
            <section className="profile-saas-section" aria-labelledby="profile-settings-heading">
                <motion.h2
                    id="profile-settings-heading"
                    className="profile-saas-h2"
                    {...(shellMotion ? cargoSummaryMotion : { initial: false })}
                >
                    Настройки
                </motion.h2>
                <motion.div
                    className="profile-saas-stack"
                    variants={shellMotion ? cargoListContainerVariants : undefined}
                    initial={shellMotion ? "hidden" : false}
                    animate={shellMotion ? "visible" : undefined}
                >
                    {settingsItems.map((item) => (
                        <motion.div
                            key={item.id}
                            variants={shellMotion ? cargoListItemVariants : undefined}
                            initial={shellMotion ? "hidden" : false}
                            animate={shellMotion ? "visible" : undefined}
                        >
                            <Panel
                                className="cargo-card profile-saas-row-card"
                                onClick={item.onClick}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: '1rem',
                                    cursor: 'pointer'
                                }}
                            >
                                <Flex align="center" style={{ flex: 1, gap: '0.75rem' }}>
                                    <div className="profile-saas-row-icon">{item.icon}</div>
                                    <Typography.Body className="profile-saas-body" style={{ fontSize: '0.9rem' }}>{item.label}</Typography.Body>
                                </Flex>
                            </Panel>
                        </motion.div>
                    ))}
                </motion.div>
            </section>

            {/* Безопасность */}
            <section className="profile-saas-section" aria-labelledby="profile-security-heading">
                <motion.h2
                    id="profile-security-heading"
                    className="profile-saas-h2"
                    {...(shellMotion ? cargoSummaryMotion : { initial: false })}
                >
                    Безопасность
                </motion.h2>
                <motion.div
                    className="profile-saas-stack"
                    variants={shellMotion ? cargoListContainerVariants : undefined}
                    initial={shellMotion ? "hidden" : false}
                    animate={shellMotion ? "visible" : undefined}
                >
                    {/* 2FA — переход на отдельную страницу */}
                    {activeAccountId && activeAccount && (
                        <motion.div
                            variants={shellMotion ? cargoListItemVariants : undefined}
                            initial={shellMotion ? "hidden" : false}
                            animate={shellMotion ? "visible" : undefined}
                        >
                            <Panel
                                className="cargo-card profile-saas-row-card"
                                onClick={() => setCurrentView('2fa')}
                                style={{ display: 'flex', alignItems: 'center', padding: '1rem', cursor: 'pointer' }}
                            >
                                <Flex align="center" style={{ flex: 1, gap: '0.75rem' }}>
                                    <div className="profile-saas-row-icon">
                                        <Shield className="w-5 h-5" />
                                    </div>
                                    <Typography.Body className="profile-saas-body" style={{ fontSize: '0.9rem' }}>Двухфакторная аутентификация (2FA)</Typography.Body>
                                </Flex>
                            </Panel>
                        </motion.div>
                    )}
                    {/* Пароль — смена пароля для входа по email/паролю */}
                    {activeAccountId && activeAccount?.isRegisteredUser && activeAccount && (
                        <motion.div
                            variants={shellMotion ? cargoListItemVariants : undefined}
                            initial={shellMotion ? "hidden" : false}
                            animate={shellMotion ? "visible" : undefined}
                        >
                            <ProfilePasswordSection
                                activeAccount={activeAccount}
                                activeAccountId={activeAccountId}
                                onUpdateAccount={onUpdateAccount}
                            />
                        </motion.div>
                    )}
                </motion.div>
            </section>

            {/* Информация */}
            <section className="profile-saas-section" aria-labelledby="profile-info-heading">
                <motion.h2
                    id="profile-info-heading"
                    className="profile-saas-h2"
                    {...(shellMotion ? cargoSummaryMotion : { initial: false })}
                >
                    Информация
                </motion.h2>
                <motion.div
                    className="profile-saas-stack"
                    variants={shellMotion ? cargoListContainerVariants : undefined}
                    initial={shellMotion ? "hidden" : false}
                    animate={shellMotion ? "visible" : undefined}
                >
                    {infoItems.map((item) => (
                        <motion.div
                            key={item.id}
                            variants={shellMotion ? cargoListItemVariants : undefined}
                            initial={shellMotion ? "hidden" : false}
                            animate={shellMotion ? "visible" : undefined}
                        >
                            <Panel
                                className="cargo-card profile-saas-row-card"
                                onClick={item.onClick}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: '1rem',
                                    cursor: 'pointer'
                                }}
                            >
                                <Flex align="center" style={{ flex: 1, gap: '0.75rem' }}>
                                    <div className="profile-saas-row-icon">{item.icon}</div>
                                    <Typography.Body className="profile-saas-body" style={{ fontSize: '0.9rem' }}>{item.label}</Typography.Body>
                                </Flex>
                            </Panel>
                        </motion.div>
                    ))}
                </motion.div>
            </section>

        </div>
    );
}

import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
    LogOut, Loader2, Check, X, Moon, Sun, Eye, EyeOff, AlertTriangle, User as UserIcon, Users, ChevronDown,
    Building2, Bell, Shield, Settings, Info, ArrowLeft, Plus, Trash2, MessageCircle, FileText, LayoutGrid, Mic, Lock, Receipt,
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
import { ExpenseRequestsPage } from "./ExpenseRequestsPage";
import { AboutCompanyPage } from "./AboutCompanyPage";
import { NotificationsPage } from "./NotificationsPage";
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
    onOpenTelegramBot,
    onOpenMaxBot,
    onUpdateAccount
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
    onOpenTelegramBot?: () => Promise<void>;
    onOpenMaxBot?: () => Promise<void>;
    onUpdateAccount: (accountId: string, patch: Partial<Account>) => void;
}) {
    const [currentView, setCurrentView] = useState<ProfileView>('main');
    const activeAccount = accounts.find(acc => acc.id === activeAccountId) || null;
    const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
    const [twoFactorMethod, setTwoFactorMethod] = useState<"google" | "telegram">("google");
    const [twoFactorTelegramLinked, setTwoFactorTelegramLinked] = useState(false);
    const [tgLinkLoading, setTgLinkLoading] = useState(false);
    const [tgLinkError, setTgLinkError] = useState<string | null>(null);
    const [tgLinkChecking, setTgLinkChecking] = useState(false);
    const [aliceCode, setAliceCode] = useState<string | null>(null);
    const [aliceExpiresAt, setAliceExpiresAt] = useState<number | null>(null);
    const [aliceLoading, setAliceLoading] = useState(false);
    const [aliceError, setAliceError] = useState<string | null>(null);
    const [aliceSuccess, setAliceSuccess] = useState<string | null>(null);
    const [googleSetupData, setGoogleSetupData] = useState<{ otpauthUrl: string; secret: string } | null>(null);
    const [googleSetupStep, setGoogleSetupStep] = useState<'idle' | 'qr' | 'verify'>('idle');
    const [googleSetupLoading, setGoogleSetupLoading] = useState(false);
    const [googleSetupError, setGoogleSetupError] = useState<string | null>(null);
    const [googleVerifyCode, setGoogleVerifyCode] = useState('');
    const [showPasswordForm, setShowPasswordForm] = useState(false);
    const [passwordCurrent, setPasswordCurrent] = useState('');
    const [passwordNew, setPasswordNew] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');
    const [passwordLoading, setPasswordLoading] = useState(false);
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [passwordSuccess, setPasswordSuccess] = useState(false);

    const [employeesList, setEmployeesList] = useState<{ id: number; login: string; active: boolean; createdAt: string; presetLabel: string; fullName?: string; department?: string; employeeRole?: "employee" | "department_head" }[]>([]);
    const [employeesLoading, setEmployeesLoading] = useState(false);
    const [employeesError, setEmployeesError] = useState<string | null>(null);
    const [rolePresets, setRolePresets] = useState<{ id: string; label: string }[]>([]);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteFullName, setInviteFullName] = useState('');
    const [inviteDepartment, setInviteDepartment] = useState('');
    const [inviteEmployeeRole, setInviteEmployeeRole] = useState<'employee' | 'department_head'>('employee');
    const [invitePresetId, setInvitePresetId] = useState('');
    const [inviteLoading, setInviteLoading] = useState(false);
    const [inviteError, setInviteError] = useState<string | null>(null);
    const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
    const [employeeDeleteId, setEmployeeDeleteId] = useState<number | null>(null);
    const [employeeDeleteLoading, setEmployeeDeleteLoading] = useState(false);
    const [employeePresetLoadingId, setEmployeePresetLoadingId] = useState<number | null>(null);
    const [departmentTimesheetDepartment, setDepartmentTimesheetDepartment] = useState("");
    const [departmentTimesheetAllDepartments, setDepartmentTimesheetAllDepartments] = useState(false);
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
    const [departmentTimesheetShiftRateOverrides, setDepartmentTimesheetShiftRateOverrides] = useState<Record<string, number>>({});
    const [departmentTimesheetMobilePicker, setDepartmentTimesheetMobilePicker] = useState(false);
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
    const filteredDepartmentTimesheetEmployees = useMemo(() => {
        const q = departmentTimesheetSearch.trim().toLowerCase();
        if (!q) return sortedDepartmentTimesheetEmployees;
        return sortedDepartmentTimesheetEmployees.filter((emp) => {
            const haystack = [emp.fullName, emp.login, emp.position, emp.department]
                .map((x) => String(x || "").toLowerCase())
                .join(" ");
            return haystack.includes(q);
        });
    }, [departmentTimesheetSearch, sortedDepartmentTimesheetEmployees]);
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

    const DEPARTMENT_OPTIONS = [
        'Склад Москва',
        'Склад Калининград',
        'Отдел продаж',
        'Управляющая компания',
    ] as const;
    const COOPERATION_TYPE_OPTIONS = [
        { value: "self_employed", label: "Самозанятость" },
        { value: "ip", label: "ИП" },
        { value: "staff", label: "Штатный сотрудник" },
    ] as const;
    const employeeRoleLabel = (value?: string) => value === 'department_head' ? 'Руководитель подразделения' : 'Сотрудник';
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
    const departmentTimesheetSummary = useMemo(() => {
        return calculateTimesheetSummary(departmentTimesheetEmployees);
    }, [departmentTimesheetEmployees, departmentTimesheetDays, departmentTimesheetHours, departmentTimesheetPayoutsByEmployee, departmentTimesheetShiftRateOverrides]);
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

    useEffect(() => {
        if (currentView === "accounting" && activeAccount?.permissions?.accounting === true) {
            void fetchAccountingRequests();
        }
    }, [currentView, activeAccount?.permissions?.accounting, fetchAccountingRequests]);

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

    const checkTelegramLinkStatus = useCallback(async () => {
        if (!activeAccount?.login || !activeAccountId) return false;
        try {
            const res = await fetch(`/api/2fa?login=${encodeURIComponent(activeAccount.login)}`);
            if (!res.ok) return false;
            const data = await res.json();
            const linked = !!data?.settings?.telegramLinked;
            setTwoFactorTelegramLinked(linked);
            onUpdateAccount(activeAccountId, { twoFactorTelegramLinked: linked });
            return linked;
        } catch {
            return false;
        }
    }, [activeAccount?.login, activeAccountId, onUpdateAccount]);

    const pollTelegramLink = useCallback(async () => {
        if (tgLinkChecking) return;
        setTgLinkChecking(true);
        try {
            let attempts = 0;
            let linked = false;
            while (attempts < 10 && !linked) {
                linked = await checkTelegramLinkStatus();
                if (linked) break;
                await new Promise((r) => setTimeout(r, 2000));
                attempts += 1;
            }
        } finally {
            setTgLinkChecking(false);
        }
    }, [checkTelegramLinkStatus, tgLinkChecking]);

    useEffect(() => {
        if (!activeAccount) return;
        setTwoFactorEnabled(!!activeAccount.twoFactorEnabled);
        setTwoFactorMethod(activeAccount.twoFactorMethod ?? "google");
        setTwoFactorTelegramLinked(!!activeAccount.twoFactorTelegramLinked);
    }, [activeAccount?.id]);

    useEffect(() => {
        if (!twoFactorEnabled || twoFactorMethod !== "telegram") return;
        if (twoFactorTelegramLinked) return;
        void checkTelegramLinkStatus();
    }, [twoFactorEnabled, twoFactorMethod, twoFactorTelegramLinked, checkTelegramLinkStatus]);

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
        ...((activeAccount?.isSuperAdmin || activeAccount?.permissions?.haulz === true) ? [{
            id: 'haulz',
            label: 'HAULZ',
            icon: <LayoutGrid className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />,
            onClick: () => setCurrentView('haulz')
        }] : []),
        ...(activeAccount?.isRegisteredUser && activeAccount?.inCustomerDirectory === true ? [
        ...(activeAccount?.permissions?.supervisor === true && activeAccount?.permissions?.haulz === true ? [{
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

    const faqItems = [
        // ——— Вход ———
        {
            q: "Как войти в приложение?",
            a: "Есть два способа. 1) Вход по email и паролю: введите логин (ваш email) и пароль от личного кабинета HAULZ. Перед первым входом нужно принять публичную оферту и согласие на обработку персональных данных. 2) Вход по логину и паролю от 1С: на экране входа нажмите «По логину и паролю» и введите учётные данные от системы 1С — после входа будут доступны компании, привязанные к этому логину. Выбор способа зависит от того, как вас зарегистрировали (email в HAULZ или доступ через 1С).",
            img: "/faq-account.svg",
            alt: "Вход в приложение"
        },
        {
            q: "Забыли пароль?",
            a: "На экране входа нажмите ссылку «Забыли пароль?». На вашу почту (email, указанный при регистрации) придёт письмо со ссылкой для восстановления. Перейдите по ссылке, задайте новый пароль на сайте HAULZ. После этого войдите в приложение с новым паролем. Если письмо не пришло — проверьте папку «Спам» или напишите в поддержку.",
            img: "/faq-account.svg",
            alt: "Восстановление пароля"
        },
        // ——— Присоединение компаний ———
        {
            q: "Где управлять списком компаний?",
            a: "Откройте вкладку «Профиль» внизу экрана, затем пункт «Мои компании». Там отображаются все добавленные компании (аккаунты). Чтобы добавить новую — нажмите «Добавить компанию» и выберите способ: по ИНН или по логину и паролю. Из этого же списка можно переключать активную компанию или удалить аккаунт, если он больше не нужен.",
            img: "/faq-account.svg",
            alt: "Мои компании"
        },
        {
            q: "Как добавить компанию по ИНН? (пошагово)",
            a: "Добавление по ИНН доступно только если вы вошли по email и паролю (зарегистрированный пользователь). Шаги: 1) Профиль → Мои компании → Добавить компанию. 2) Выберите «По ИНН». 3) Введите ИНН организации (10 или 12 цифр). 4) Нажмите отправить запрос — мы отправим письмо на контакты этой организации. 5) Ответственный в организации должен подтвердить доступ: в письме будет пин-код из 6 цифр. 6) Введите этот пин-код в приложении в поле «Введите пин-код из письма». 7) После успешной проверки компания появится в «Мои компании». Если организация не ответила или пин-код не пришёл — свяжитесь с ней отдельно или используйте способ «По логину и паролю», если у вас есть доступ в 1С.",
            img: "/faq-account.svg",
            alt: "Добавление по ИНН"
        },
        {
            q: "Как добавить компанию по логину и паролю?",
            a: "Подходит, если у вас есть логин и пароль от системы 1С (или личного кабинета) для нужной организации. Шаги: 1) Профиль → Мои компании → Добавить компанию. 2) Выберите «По логину и паролю». 3) Введите логин и пароль от 1С/ЛК. 4) Нажмите войти. После проверки приложение подтянет список заказчиков (компаний), привязанных к этому логину. Они появятся в «Мои компании», и вы сможете переключаться между ними в шапке экрана. Можно добавить несколько таких аккаунтов, если у вас доступ к разным организациям.",
            img: "/faq-account.svg",
            alt: "Добавление по логину и паролю"
        },
        {
            q: "Сколько компаний можно добавить?",
            a: "Ограничений по количеству компаний в списке нет. Вы можете добавить несколько организаций по ИНН (после подтверждения каждой) и несколько аккаунтов по логину и паролю. В шапке экрана в переключателе компаний выбирается одна или несколько активных — от этого зависят грузы и документы, которые вы видите.",
            img: "/faq-account.svg",
            alt: "Несколько компаний"
        },
        {
            q: "Как сменить активную компанию или выбрать несколько?",
            a: "В верхней части экрана «Грузы» или «Документы» отображается переключатель компаний (название текущей компании или «Выберите компанию»). Нажмите на него — откроется список всех ваших компаний. Выберите одну или отметьте несколько галочками — данные на экране обновятся под выбранный набор. Сотрудники, привязанные к одной компании, переключателя не видят: у них всегда отображается только их компания.",
            img: "/faq-account.svg",
            alt: "Переключение компаний"
        },
        {
            q: "Как удалить компанию из списка?",
            a: "Профиль → Мои компании. В списке найдите нужный аккаунт (компанию) и нажмите кнопку удаления (корзина) или «Удалить аккаунт». После подтверждения компания исчезнет из списка, грузы и документы по ней в приложении больше отображаться не будут. Данные в 1С и у HAULZ при этом не удаляются — при необходимости компанию можно добавить снова.",
            img: "/faq-account.svg",
            alt: "Удаление компании"
        },
        // ——— Сотрудники ———
        {
            q: "Кто может приглашать сотрудников?",
            a: "Приглашать сотрудников могут только пользователи, которые вошли по email и паролю (зарегистрированные в HAULZ). Если вы вошли «по логину и паролю» от 1С без отдельной регистрации email — раздел «Сотрудники» будет недоступен. Зарегистрируйте аккаунт по email в HAULZ (через админку или по приглашению), войдите им — тогда в Профиле появится пункт «Сотрудники» и форма приглашения.",
            img: "/faq-account.svg",
            alt: "Кто может приглашать"
        },
        {
            q: "Как пригласить сотрудника? (пошагово)",
            a: "1) Войдите по email и паролю. 2) Профиль → Сотрудники. 3) В блоке «Пригласить сотрудника» введите email будущего сотрудника (на него придёт пароль). 4) Выберите роль в выпадающем списке (Логист, Менеджер и т.д. — список ролей настраивается в админке). Если ролей нет — нажмите «Обновить» или попросите администратора создать пресеты в разделе «Пресеты ролей». 5) Нажмите «Пригласить». 6) На почту сотрудника отправится письмо с паролем для входа. 7) Сотрудник входит в приложение по этому email и паролю и видит только вашу компанию (без переключателя компаний). При необходимости вы можете отключить доступ переключателем «Вкл/Выкл» или удалить сотрудника из списка.",
            img: "/faq-account.svg",
            alt: "Приглашение сотрудника"
        },
        {
            q: "Что видит приглашённый сотрудник?",
            a: "Приглашённый сотрудник входит по email и паролю из письма. Ему доступна одна компания — та, к которой привязан пригласивший (ваш аккаунт). В шапке экрана отображается название этой компании, переключателя компаний нет. Сотрудник видит грузы и документы только по этой компании, в соответствии с выданной ролью (права на разделы и действия задаются пресетом). Дашборд, счета, УПД, поддержка — по тем же правилам, что и у вас, но в рамках одной организации.",
            img: "/faq-account.svg",
            alt: "Права сотрудника"
        },
        {
            q: "Что такое «роль» при приглашении сотрудника?",
            a: "Роль — это набор прав (пресет): какие разделы доступны (грузы, документы, дашборд, поддержка и т.д.) и есть ли, например, служебный режим или доступ в админку. Список ролей (пресетов) настраивается в админ-панели HAULZ в разделе «Пресеты ролей». При приглашении вы выбираете одну из этих ролей — сотрудник получает соответствующие права. Чтобы изменить права уже приглашённого — это делается в админке (редактирование пользователя) или путём отключения и повторного приглашения с другой ролью, если так предусмотрено у вас.",
            img: "/faq-account.svg",
            alt: "Роли сотрудников"
        },
        {
            q: "Как отключить или снова включить доступ сотрудника?",
            a: "Профиль → Сотрудники. В списке приглашённых найдите нужного человека. Рядом с ним переключатель «Вкл» / «Выкл». При выключении сотрудник не сможет войти в приложение (логин и пароль перестанут действовать). Его запись и привязка к компании сохраняются — вы можете снова включить доступ тем же переключателем, не приглашая заново.",
            img: "/faq-account.svg",
            alt: "Отключение доступа"
        },
        {
            q: "Как удалить сотрудника из списка?",
            a: "Профиль → Сотрудники → найдите сотрудника в списке и нажмите кнопку с иконкой корзины. Подтвердите удаление. Сотрудник будет полностью удалён из системы: он не сможет войти, запись в базе и привязки удалятся. Восстановить такого пользователя можно только новым приглашением.",
            img: "/faq-account.svg",
            alt: "Удаление сотрудника"
        },
        {
            q: "Сотрудник забыл пароль — что делать?",
            a: "Сотрудник может восстановить пароль сам: на экране входа в приложении нажать «Забыли пароль?» и указать свой email (тот, на который пришло приглашение). На почту придёт ссылка для смены пароля. После смены войти с новым паролем. Альтернатива — вы можете отключить его доступ и пригласить заново (ему придёт новый пароль), но тогда старый пароль перестанет действовать.",
            img: "/faq-account.svg",
            alt: "Пароль сотрудника"
        },
        // ——— Грузы ———
        {
            q: "Почему не вижу часть грузов или список пустой?",
            a: "Проверьте по порядку: 1) Выбранная компания в шапке — грузы показываются только по тем компаниям, которые выбраны. 2) Период дат — фильтр «Дата» может ограничивать диапазон; расширьте период или выберите «Все». 3) Остальные фильтры: Статус, Отправитель, Получатель — сбросьте на «Все» при необходимости. 4) Роли (Заказчик / Отправитель / Получатель) в Профиле → Роли — если отключена роль «Заказчик», части грузов может не быть. 5) Убедитесь, что перевозка действительно относится к выбранному заказчику в 1С. Если всё проверено и груза по-прежнему нет — напишите в поддержку с номером груза и периодом.",
            img: "/faq-troubleshoot.svg",
            alt: "Поиск грузов"
        },
        {
            q: "Как найти груз по номеру?",
            a: "На экране «Грузы» вверху есть строка поиска (иконка лупы). Введите номер перевозки полностью или часть номера — список отфильтруется автоматически. Поиск идёт по номерам грузов в выбранном периоде и по выбранным компаниям.",
            img: "/faq-troubleshoot.svg",
            alt: "Поиск по номеру"
        },
        {
            q: "Как настроить фильтры по датам, статусу, отправителю и получателю?",
            a: "На экране «Грузы» над списком расположены кнопки фильтров: Дата, Статус, Отправитель, Получатель и др. Нажмите нужный фильтр — откроется список значений. Выберите период дат, статус (например, «В пути») или конкретного отправителя/получателя. Данные на экране обновятся. Чтобы сбросить: снова откройте фильтр и выберите «Все» или другой период. Выбранные значения обычно отображаются на кнопке (например, «Дата: 09.02 – 15.02»).",
            img: "/faq-troubleshoot.svg",
            alt: "Фильтры грузов"
        },
        {
            q: "Что такое «служебный режим» и когда он доступен?",
            a: "Служебный режим — это возможность запрашивать перевозки без привязки к одной компании (по сути, по всем заказчикам). Он нужен логистам, которые работают с несколькими организациями. Включается переключателем «Служ.» в шапке экрана «Грузы». Доступен только если у вашего аккаунта есть соответствующее право (настраивается в админке в пресете роли). В служебном режиме фильтр по компании не применяется, отображаются перевозки по выбранному периоду и другим фильтрам.",
            img: "/faq-troubleshoot.svg",
            alt: "Служебный режим"
        },
        // ——— Документы ———
        {
            q: "Где взять счёт, УПД, АПП или ЭР по перевозке?",
            a: "Два способа. 1) Карточка груза: откройте нужную перевозку из списка «Грузы», нажмите кнопку «Поделиться» — в меню появятся пункты для скачивания или отправки документов (счёт, УПД и т.д.). 2) Раздел «Документы»: выберите тип документа (Счета, УПД и т.п.), при необходимости отфильтруйте по дате или номеру, найдите перевозку и откройте или скачайте документ. Если нужного документа нет в списке — напишите в поддержку, укажите номер груза и тип документа.",
            img: "/faq-docs.svg",
            alt: "Документы по перевозке"
        },
        {
            q: "Документ по ссылке не открывается",
            a: "Проверьте подключение к интернету и попробуйте открыть ссылку ещё раз. Часть документов открывается в браузере или в Telegram, если вы перешли из мессенджера. Если ссылка не работает — откройте раздел «Поддержка», напишите в чат и укажите номер груза и какой документ нужен (счёт, УПД и т.д.); оператор подскажет или пришлёт документ альтернативным способом.",
            img: "/faq-docs.svg",
            alt: "Открытие документов"
        },
        // ——— Роли и отображение грузов ———
        {
            q: "Как настроить роли «Заказчик», «Отправитель», «Получатель»?",
            a: "В «Профиле» откройте раздел «Роли». Там три переключателя: Заказчик, Отправитель, Получатель. Они определяют, в качестве кого вы хотите видеть перевозки. «Заказчик» — полные данные, включая стоимость и финансовую информацию. «Отправитель» и «Получатель» — перевозки, где вы указаны отправителем или получателем, без финансовых деталей. Включите нужные роли — список грузов обновится. Если какую-то роль отключить, соответствующие перевозки из списка исчезнут.",
            img: "/faq-troubleshoot.svg",
            alt: "Роли заказчик отправитель получатель"
        },
        // ——— Прочее ———
        {
            q: "Ошибка сети, пустой экран или приложение «висит»",
            a: "Проверьте подключение к интернету (Wi‑Fi или мобильная сеть). Закройте приложение полностью и откройте снова. Если ошибка повторяется — откройте раздел «Поддержка» и опишите, что произошло: в какое время, на каком экране (Грузы, Документы, Профиль и т.д.) и какое сообщение об ошибке видели. Это поможет быстрее найти причину.",
            img: "/faq-troubleshoot.svg",
            alt: "Ошибки и сеть"
        },
        {
            q: "Где контакты и информация о HAULZ?",
            a: "В «Профиле» откройте раздел «О компании». Там указаны контакты, адреса и краткая информация о компании HAULZ.",
            img: "/faq-account.svg",
            alt: "Информация о компании"
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
            <div className="w-full">
                <Flex align="center" style={{ marginBottom: '1rem', gap: '0.75rem' }}>
                    <Button className="filter-button" onClick={() => setCurrentView('main')} style={{ padding: '0.5rem' }}>
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <Typography.Headline style={{ fontSize: '1.25rem' }}>Роли</Typography.Headline>
                </Flex>
                <Typography.Body style={{ marginBottom: '1rem', color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                    Включите роли, если хотите видеть перевозки, где вы выступаете в качестве заказчика, отправителя или получателя.
                </Typography.Body>
                {!activeAccountId || !activeAccount ? (
                    <Panel className="cargo-card" style={{ padding: '1rem', textAlign: 'center' }}>
                        <Typography.Body style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Сначала добавьте аккаунт в «Мои компании».</Typography.Body>
                    </Panel>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <Panel className="cargo-card" style={{ padding: '1rem' }} onClick={(e) => e.stopPropagation()}>
                            <Flex align="center" justify="space-between" style={{ marginBottom: '0.25rem' }}>
                                <Typography.Body style={{ fontWeight: 600 }}>Заказчик</Typography.Body>
                                <span className="roles-switch-wrap" onClick={(e) => e.stopPropagation()}>
                                    <TapSwitch
                                        checked={activeAccount.roleCustomer ?? true}
                                        onToggle={() => onUpdateAccount(activeAccountId, { roleCustomer: !(activeAccount.roleCustomer ?? true) })}
                                    />
                                </span>
                            </Flex>
                            <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                Включите, если хотите видеть перевозки, где вы выступаете в качестве заказчика (полные данные, включая стоимость).
                            </Typography.Body>
                        </Panel>
                        <Panel className="cargo-card" style={{ padding: '1rem' }} onClick={(e) => e.stopPropagation()}>
                            <Flex align="center" justify="space-between" style={{ marginBottom: '0.25rem' }}>
                                <Typography.Body style={{ fontWeight: 600 }}>Отправитель</Typography.Body>
                                <span className="roles-switch-wrap" onClick={(e) => e.stopPropagation()}>
                                    <TapSwitch
                                        checked={activeAccount.roleSender ?? true}
                                        onToggle={() => onUpdateAccount(activeAccountId, { roleSender: !(activeAccount.roleSender ?? true) })}
                                    />
                                </span>
                            </Flex>
                            <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                Включите, если хотите видеть перевозки, где вы выступаете в качестве отправителя (без финансовой информации).
                            </Typography.Body>
                        </Panel>
                        <Panel className="cargo-card" style={{ padding: '1rem' }} onClick={(e) => e.stopPropagation()}>
                            <Flex align="center" justify="space-between" style={{ marginBottom: '0.25rem' }}>
                                <Typography.Body style={{ fontWeight: 600 }}>Получатель</Typography.Body>
                                <span className="roles-switch-wrap" onClick={(e) => e.stopPropagation()}>
                                    <TapSwitch
                                        checked={activeAccount.roleReceiver ?? true}
                                        onToggle={() => onUpdateAccount(activeAccountId, { roleReceiver: !(activeAccount.roleReceiver ?? true) })}
                                    />
                                </span>
                            </Flex>
                            <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                Включите, если хотите видеть перевозки, где вы выступаете в качестве получателя (без финансовой информации).
                            </Typography.Body>
                        </Panel>
                    </div>
                )}
            </div>
        );
    }

    if (currentView === 'haulz') {
        return (
            <div className="w-full">
                <Flex align="center" style={{ marginBottom: '1rem', gap: '0.75rem' }}>
                    <Button className="filter-button" onClick={() => setCurrentView('main')} style={{ padding: '0.5rem' }}>
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <Typography.Headline style={{ fontSize: '1.25rem' }}>HAULZ</Typography.Headline>
                </Flex>
                <Flex align="center" gap="0.6rem" wrap="wrap">
                    {activeAccount?.permissions?.supervisor === true && activeAccount?.permissions?.haulz === true ? (
                        <>
                            <Button type="button" className="button-primary" onClick={() => setCurrentView('departmentTimesheet')}>
                                Табель учета рабочего времени
                            </Button>
                            <Button type="button" className="button-primary" onClick={() => setCurrentView('expenseRequests')}>
                                Заявки на расходы
                            </Button>
                            {activeAccount?.permissions?.accounting === true && (
                                <Button type="button" className="button-primary" onClick={() => setCurrentView('accounting')}>
                                    Бухгалтерия
                                </Button>
                            )}
                        </>
                    ) : (
                        <Flex align="center" gap="0.6rem" wrap="wrap">
                            <Typography.Body style={{ color: 'var(--color-text-secondary)' }}>
                                Раздел доступен только руководителю подразделения HAULZ.
                            </Typography.Body>
                            {activeAccount?.permissions?.accounting === true && (
                                <Button type="button" className="button-primary" onClick={() => setCurrentView('accounting')}>
                                    Бухгалтерия
                                </Button>
                            )}
                        </Flex>
                    )}
                </Flex>
            </div>
        );
    }

    if (currentView === 'expenseRequests') {
        return (
            <div className="w-full">
                <Flex align="center" style={{ marginBottom: '1rem', gap: '0.75rem' }}>
                    <Button className="filter-button" onClick={() => setCurrentView('haulz')} style={{ padding: '0.5rem' }}>
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <Typography.Headline style={{ fontSize: '1.25rem' }}>Заявки на расходы</Typography.Headline>
                </Flex>
                <ExpenseRequestsPage
                    auth={activeAccount ? { login: activeAccount.login, password: activeAccount.password, inn: activeAccount.activeCustomerInn ?? undefined, ...(activeAccount.isRegisteredUser ? { isRegisteredUser: true } : {}) } : null}
                    departmentName={activeAccount?.customer ?? "Моё подразделение"}
                />
            </div>
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

        return (
            <div className="w-full">
                <Flex align="center" style={{ marginBottom: '1rem', gap: '0.75rem' }}>
                    <Button className="filter-button" onClick={() => setCurrentView('haulz')} style={{ padding: '0.5rem' }}>
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <Typography.Headline style={{ fontSize: '1.25rem' }}>Бухгалтерия</Typography.Headline>
                </Flex>
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
            <div className="w-full">
                <Flex align="center" style={{ marginBottom: '1rem', gap: '0.75rem' }}>
                    <Button className="filter-button" onClick={() => setCurrentView('haulz')} style={{ padding: '0.5rem' }}>
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <Typography.Headline style={{ fontSize: '1.25rem' }}>Табель учета рабочего времени</Typography.Headline>
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
                            <input
                                type="month"
                                value={departmentTimesheetMonth}
                                onChange={(e) => setDepartmentTimesheetMonth(e.target.value)}
                                style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.4rem 0.6rem', background: 'var(--color-bg)' }}
                            />
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
                    <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '70vh', WebkitOverflowScrolling: 'touch' }}>
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

                                    return (
                                    <tr key={emp.id}>
                                        <td style={{ position: 'sticky', left: 0, zIndex: 30, minWidth: '220px', background: 'var(--color-bg-card, #fff)', borderBottom: '1px solid var(--color-border)', padding: '0.5rem', boxShadow: '2px 0 0 var(--color-border)' }}>
                                            <Flex align="center" justify="space-between" gap="0.35rem" style={{ alignItems: 'flex-start' }}>
                                                <div>
                                                    <Typography.Body style={{ display: 'block', fontWeight: 600 }}>{emp.fullName || emp.login}</Typography.Body>
                                                    <Typography.Body style={{ display: 'block', fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginTop: '0.1rem' }}>
                                                        {cooperationTypeLabel(emp.cooperationType)}
                                                    </Typography.Body>
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
                                                    onClick={() => void removeDepartmentEmployeeFromMonth(emp.id)}
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
                    {(departmentTimesheetAllDepartments
                        ? departmentTimesheetDepartmentSummaries
                        : [{
                            departmentName: departmentTimesheetDepartment || "—",
                            ...departmentTimesheetSummary,
                        }]
                    ).map((summary, idx) => (
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
                                Итого по компании: {companyTimesheetSummary.totalShifts} смен · {companyTimesheetSummary.totalHours} ч
                            </Typography.Body>
                            <Typography.Body style={{ marginTop: '0.12rem', color: 'var(--color-text-secondary)' }}>
                                {companyTimesheetSummary.totalMoney.toLocaleString('ru-RU')} ₽
                            </Typography.Body>
                            <Typography.Body style={{ marginTop: '0.08rem', color: '#065f46', fontSize: '0.84rem' }}>
                                Выплачено: {companyTimesheetSummary.totalPaid.toLocaleString('ru-RU')} ₽
                            </Typography.Body>
                            <Typography.Body style={{ marginTop: '0.08rem', color: '#15803d', fontSize: '0.84rem' }}>
                                Остаток: {companyTimesheetSummary.totalOutstanding.toLocaleString('ru-RU')} ₽
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
                    Регистрируйте сотрудников с указанием ФИО, структурного подразделения и роли. Пароль для входа отправляется на email.
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
                                                    {employeeRoleLabel(emp.employeeRole)} · {emp.department || '—'} · {emp.presetLabel} · {emp.active ? 'Доступ включён' : 'Отключён'}
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
                                    value={inviteDepartment}
                                    onChange={(e) => { setInviteDepartment(e.target.value); setInviteError(null); }}
                                    style={{ padding: '0 0.6rem', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', fontSize: '0.9rem', height: '2.5rem', boxSizing: 'border-box', minWidth: '12rem' }}
                                    aria-label="Структурное подразделение"
                                >
                                    <option value="">Структурное подразделение</option>
                                    {DEPARTMENT_OPTIONS.map((dep) => <option key={dep} value={dep}>{dep}</option>)}
                                </select>
                                <select
                                    className="admin-form-input invite-role-select"
                                    value={inviteEmployeeRole}
                                    onChange={(e) => setInviteEmployeeRole(e.target.value as 'employee' | 'department_head')}
                                    style={{ padding: '0 0.6rem', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', fontSize: '0.9rem', height: '2.5rem', boxSizing: 'border-box', minWidth: '12rem' }}
                                    aria-label="Роль сотрудника"
                                >
                                    <option value="employee">Сотрудник</option>
                                    <option value="department_head">Руководитель подразделения</option>
                                </select>
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
                                    disabled={inviteLoading || !inviteEmail.trim() || !inviteFullName.trim() || !inviteDepartment || !invitePresetId}
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
                                                    department: inviteDepartment,
                                                    employeeRole: inviteEmployeeRole,
                                                    presetId: invitePresetId
                                                }),
                                            });
                                            const data = await res.json().catch(() => ({}));
                                            if (!res.ok) throw new Error(data.error || 'Ошибка');
                                            setInviteSuccess(data.message || 'Готово');
                                            setInviteEmail(''); setInviteFullName(''); setInviteDepartment(''); setInviteEmployeeRole('employee'); setInvitePresetId('');
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
                                                    {employeeRoleLabel(emp.employeeRole)} · {emp.department || '—'} · {emp.presetLabel} · {emp.active ? 'Доступ включён' : 'Отключён'}
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
        const serviceModeAllowed = !!activeAccount?.isRegisteredUser && activeAccount?.permissions?.service_mode === true;
        if (!serviceModeAllowed) {
            return (
                <div className="w-full">
                    <Flex align="center" style={{ marginBottom: '1rem', gap: '0.75rem' }}>
                        <Button className="filter-button" onClick={() => setCurrentView('main')} style={{ padding: '0.5rem' }}>
                            <ArrowLeft className="w-4 h-4" />
                        </Button>
                        <Typography.Headline style={{ fontSize: '1.25rem' }}>Голосовые помощники</Typography.Headline>
                    </Flex>
                    <Panel className="cargo-card" style={{ padding: '1rem' }}>
                        <Typography.Body style={{ color: 'var(--color-text-secondary)' }}>Доступно только при включённом служебном режиме.</Typography.Body>
                    </Panel>
                </div>
            );
        }
        return (
            <div className="w-full">
                <Flex align="center" style={{ marginBottom: '1rem', gap: '0.75rem' }}>
                    <Button className="filter-button" onClick={() => setCurrentView('main')} style={{ padding: '0.5rem' }}>
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <Typography.Headline style={{ fontSize: '1.25rem' }}>Голосовые помощники</Typography.Headline>
                </Flex>
                <Typography.Body style={{ marginBottom: '0.75rem', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Алиса</Typography.Body>
                <Panel
                    className="cargo-card"
                    style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
                >
                    <Typography.Body style={{ fontSize: '0.9rem' }}>
                        Скажите Алисе: «Запусти навык Холз» и назовите код ниже. После привязки Алиса подтвердит компанию. Голосом можно узнавать перевозки в пути, счета на оплату, краткий статус «что в работе», сводку за день или за период, статус по номеру перевозки; при ответе «подробнее» Алиса скажет «Написал в чат» и отправит таблицу в чат мини‑приложения (номер / дата / кол-во / плат вес / сумма). Номера перевозок произносятся по три цифры (135200 — «сто тридцать пять двести»). Если привязано несколько компаний — можно переключиться голосом или отвязать навык фразой «Отвяжи компанию».
                    </Typography.Body>
                    <Button
                        className="button-primary"
                        type="button"
                        disabled={!activeAccount?.login || !activeAccount?.password || aliceLoading}
                        onClick={async () => {
                            if (!activeAccount?.login || !activeAccount?.password) return;
                            try {
                                setAliceError(null);
                                setAliceSuccess(null);
                                setAliceLoading(true);
                                const res = await fetch("/api/alice-link", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                        login: activeAccount.login,
                                        password: activeAccount.password,
                                        customer: activeAccount.customer || null,
                                        inn: activeAccount.activeCustomerInn ?? undefined,
                                    }),
                                });
                                if (!res.ok) {
                                    const err = await res.json().catch(() => ({}));
                                    throw new Error(err?.error || "Не удалось получить код");
                                }
                                const data = await res.json();
                                setAliceCode(String(data?.code || ""));
                                setAliceExpiresAt(Date.now() + (Number(data?.ttl || 0) * 1000));
                            } catch (e: any) {
                                setAliceError(e?.message || "Не удалось получить код");
                            } finally {
                                setAliceLoading(false);
                            }
                        }}
                    >
                        {aliceLoading ? <Loader2 className="animate-spin w-4 h-4" /> : "Получить код для Алисы"}
                    </Button>
                    {aliceCode && (
                        <Typography.Body style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                            Код: {aliceCode}
                        </Typography.Body>
                    )}
                    {aliceExpiresAt && (
                        <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                            Код действует до {new Date(aliceExpiresAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                        </Typography.Body>
                    )}
                    {aliceError && (
                        <Flex align="center" className="login-error">
                            <AlertTriangle className="w-4 h-4 mr-2" />
                            <Typography.Body style={{ fontSize: '0.85rem' }}>{aliceError}</Typography.Body>
                        </Flex>
                    )}
                    {aliceSuccess && (
                        <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-success, #22c55e)' }}>
                            {aliceSuccess}
                        </Typography.Body>
                    )}
                    <Typography.Body style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                        Чтобы отключить навык от аккаунта, нажмите кнопку ниже.
                    </Typography.Body>
                    <Button
                        className="filter-button"
                        type="button"
                        disabled={!activeAccount?.login}
                        onClick={async () => {
                            if (!activeAccount?.login) return;
                            try {
                                setAliceError(null);
                                setAliceSuccess(null);
                                const res = await fetch("/api/alice-unlink", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ login: activeAccount.login.trim().toLowerCase() }),
                                });
                                const data = await res.json().catch(() => ({}));
                                if (res.ok && data?.ok) {
                                    setAliceCode(null);
                                    setAliceExpiresAt(null);
                                    setAliceSuccess(data?.message || "Алиса отвязана от аккаунта.");
                                } else {
                                    setAliceError(data?.error || "Не удалось отвязать.");
                                }
                            } catch (e: any) {
                                setAliceError(e?.message || "Ошибка сети.");
                            }
                        }}
                        style={{ marginTop: '0.25rem' }}
                    >
                        Отвязать от Алисы
                    </Button>
                </Panel>

                <Typography.Body style={{ marginTop: '1.25rem', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Описание навыков</Typography.Body>
                <Panel className="cargo-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                        «Запусти навык Холз» → назовите код из приложения → Алиса подтвердит компанию. Ниже — фразы и сценарии.
                    </Typography.Body>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <Typography.Body style={{ fontSize: '0.8rem', fontWeight: 600 }}>Перевозки и оплаты</Typography.Body>
                        <Typography.Body style={{ fontSize: '0.8rem' }}>• «Какие перевозки в пути?» — кратко номера (по три цифры). «Подробнее» — Алиса скажет «Написал в чат» и отправит таблицу в чат (номер / дата / кол-во / плат вес / сумма).</Typography.Body>
                        <Typography.Body style={{ fontSize: '0.8rem' }}>• «Какие счета на оплату?» — то же: кратко, по «подробнее» — таблица в чат.</Typography.Body>
                        <Typography.Body style={{ fontSize: '0.8rem' }}>• «Что в работе?» / «Что у меня в работе?» — одна фраза: в пути N перевозок, к оплате M.</Typography.Body>
                        <Typography.Body style={{ fontSize: '0.8rem' }}>• «Сводка за день» / «Сводка за сегодня» / «Сводка на сегодня» — ответ принято, в пути, на доставке, доставлено, счета на оплату (кол-во и сумма).</Typography.Body>
                        <Typography.Body style={{ fontSize: '0.8rem' }}>• «Сколько перевозок за сегодня?» / «на этой неделе?» / «за неделю?» — число перевозок за период.</Typography.Body>
                        <Typography.Body style={{ fontSize: '0.8rem' }}>• «Статус перевозки 135702» / «Консолидация 135702» / «Груз 135702» — детали по одной перевозке.</Typography.Body>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <Typography.Body style={{ fontSize: '0.8rem', fontWeight: 600 }}>Управление</Typography.Body>
                        <Typography.Body style={{ fontSize: '0.8rem' }}>• «Работай от имени компании [название]» / «Переключись на компанию [название]» — переключить компанию (если привязано несколько).</Typography.Body>
                        <Typography.Body style={{ fontSize: '0.8rem' }}>• «Отвяжи компанию» / «Отвяжи заказчика» / «Отвяжи» — отвязать навык; новый код — в приложении.</Typography.Body>
                    </div>
                    <Typography.Body style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                        Другие вопросы (контакты, груз по номеру) Алиса передаёт в чат поддержки с контекстом вашей компании.
                    </Typography.Body>
                </Panel>
            </div>
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
        return (
            <div className="w-full">
                <Flex align="center" style={{ marginBottom: '0.5rem', gap: '0.75rem' }}>
                    <Button className="filter-button" onClick={() => setCurrentView('main')} style={{ padding: '0.5rem' }}>
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <Typography.Headline style={{ fontSize: '1.25rem' }}>FAQ</Typography.Headline>
                </Flex>
                <Typography.Body style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
                    Подробные ответы: вход и пароль, присоединение компаний (по ИНН и по логину/паролю), приглашение и управление сотрудниками, грузы, фильтры, документы и поддержка.
                </Typography.Body>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {faqItems.map((item, idx) => (
                        <Panel
                            key={`${item.q}-${idx}`}
                            className="cargo-card"
                            style={{
                                padding: '1rem',
                                display: 'flex',
                                gap: '0.75rem',
                                alignItems: 'flex-start'
                            }}
                        >
                            <img
                                src={item.img}
                                alt={item.alt}
                                style={{ width: '44px', height: '44px', borderRadius: '10px', objectFit: 'cover', flexShrink: 0 }}
                                loading="lazy"
                            />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                <Typography.Body style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                                    {item.q}
                                </Typography.Body>
                                <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                    {item.a}
                                </Typography.Body>
                            </div>
                        </Panel>
                    ))}
                </div>
            </div>
        );
    }

    if (currentView === '2fa' && activeAccountId && activeAccount) {
        const googleSecretSet = !!activeAccount.twoFactorGoogleSecretSet;
        const showGoogleSetup = twoFactorEnabled && twoFactorMethod === 'google' && !googleSecretSet;
        return (
            <div className="w-full">
                <Flex align="center" style={{ marginBottom: '1rem', gap: '0.75rem' }}>
                    <Button className="filter-button" onClick={() => setCurrentView('main')} style={{ padding: '0.5rem' }}>
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <Typography.Headline style={{ fontSize: '1.25rem' }}>Двухфакторная аутентификация (2FA)</Typography.Headline>
                </Flex>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <Panel className="cargo-card" style={{ padding: '1rem' }}>
                        <Flex align="center" justify="space-between">
                            <Typography.Body style={{ fontSize: '0.9rem' }}>Google Authenticator</Typography.Body>
                            <TapSwitch
                                checked={twoFactorEnabled && twoFactorMethod === 'google'}
                                onToggle={() => {
                                    if (twoFactorEnabled && twoFactorMethod === 'google') {
                                        setTwoFactorEnabled(false);
                                        setTwoFactorMethod('telegram');
                                        setGoogleSetupData(null);
                                        setGoogleSetupStep('idle');
                                        onUpdateAccount(activeAccountId, { twoFactorMethod: 'telegram', twoFactorEnabled: false });
                                    } else {
                                        setTwoFactorMethod('google');
                                        setTwoFactorEnabled(true);
                                        onUpdateAccount(activeAccountId, { twoFactorMethod: 'google', twoFactorEnabled: true });
                                    }
                                }}
                            />
                        </Flex>
                        {showGoogleSetup && (
                            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {googleSetupStep === 'idle' && !googleSetupData && (
                                    <>
                                        <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                            Отсканируйте QR-код в приложении Google Authenticator или введите ключ вручную.
                                        </Typography.Body>
                                        <Button
                                            className="filter-button"
                                            size="small"
                                            disabled={googleSetupLoading}
                                            onClick={async () => {
                                                if (!activeAccount?.login) return;
                                                setGoogleSetupError(null);
                                                setGoogleSetupLoading(true);
                                                try {
                                                    const res = await fetch('/api/2fa-google', {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        body: JSON.stringify({ login: activeAccount.login, action: 'setup' }),
                                                    });
                                                    const data = await res.json();
                                                    if (!res.ok) throw new Error(data?.error || 'Ошибка настройки');
                                                    setGoogleSetupData({ otpauthUrl: data.otpauthUrl, secret: data.secret });
                                                    setGoogleSetupStep('qr');
                                                } catch (e: any) {
                                                    setGoogleSetupError(e?.message || 'Не удалось начать настройку');
                                                } finally {
                                                    setGoogleSetupLoading(false);
                                                }
                                            }}
                                            style={{ fontSize: '0.85rem', alignSelf: 'flex-start' }}
                                        >
                                            {googleSetupLoading ? 'Загрузка…' : 'Настроить Google Authenticator'}
                                        </Button>
                                    </>
                                )}
                                {(googleSetupStep === 'qr' || googleSetupData) && googleSetupData && googleSetupStep !== 'verify' && (
                                    <>
                                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                                            <img
                                                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(googleSetupData.otpauthUrl)}`}
                                                alt="QR для Google Authenticator"
                                                style={{ width: 200, height: 200 }}
                                            />
                                        </div>
                                        <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                            Ключ для ручного ввода: <code style={{ wordBreak: 'break-all', fontSize: '0.8rem' }}>{googleSetupData.secret}</code>
                                        </Typography.Body>
                                        <Button
                                            className="filter-button"
                                            size="small"
                                            onClick={() => { setGoogleSetupStep('verify'); setGoogleVerifyCode(''); setGoogleSetupError(null); }}
                                            style={{ fontSize: '0.85rem', alignSelf: 'flex-start' }}
                                        >
                                            Добавил в приложение
                                        </Button>
                                    </>
                                )}
                                {googleSetupStep === 'verify' && googleSetupData && (
                                    <form
                                        onSubmit={async (e) => {
                                            e.preventDefault();
                                            if (!activeAccount?.login || !googleVerifyCode.trim()) return;
                                            setGoogleSetupError(null);
                                            setGoogleSetupLoading(true);
                                            try {
                                                const res = await fetch('/api/2fa-google', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ login: activeAccount.login, action: 'verify', code: googleVerifyCode.trim() }),
                                                });
                                                const data = await res.json();
                                                if (!res.ok) throw new Error(data?.error || 'Неверный код');
                                                await fetch('/api/2fa', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ login: activeAccount.login, enabled: true, method: 'google', telegramLinked: false }),
                                                });
                                                onUpdateAccount(activeAccountId, { twoFactorEnabled: true, twoFactorMethod: 'google', twoFactorGoogleSecretSet: true });
                                                setGoogleSetupData(null);
                                                setGoogleSetupStep('idle');
                                                setGoogleVerifyCode('');
                                            } catch (err: any) {
                                                setGoogleSetupError(err?.message || 'Неверный код');
                                            } finally {
                                                setGoogleSetupLoading(false);
                                            }
                                        }}
                                        style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
                                    >
                                        <Typography.Body style={{ fontSize: '0.85rem' }}>Введите 6-значный код из приложения</Typography.Body>
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            autoComplete="one-time-code"
                                            maxLength={6}
                                            placeholder="000000"
                                            value={googleVerifyCode}
                                            onChange={(e) => setGoogleVerifyCode(e.target.value.replace(/\D/g, ''))}
                                            style={{ padding: '0.5rem', fontSize: '1rem', textAlign: 'center', letterSpacing: '0.25em' }}
                                        />
                                        <Button type="submit" className="button-primary" disabled={googleVerifyCode.length !== 6 || googleSetupLoading} style={{ alignSelf: 'flex-start' }}>
                                            {googleSetupLoading ? 'Проверка…' : 'Подтвердить'}
                                        </Button>
                                        {googleSetupError && (
                                            <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-error-status)' }}>{googleSetupError}</Typography.Body>
                                        )}
                                    </form>
                                )}
                            </div>
                        )}
                        {twoFactorEnabled && twoFactorMethod === 'google' && googleSecretSet && (
                            <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-success-status)', marginTop: '0.5rem' }}>
                                Google Authenticator настроен
                            </Typography.Body>
                        )}
                    </Panel>
                    <Panel className="cargo-card" style={{ padding: '1rem' }}>
                        <Flex align="center" justify="space-between" style={{ marginBottom: twoFactorMethod === 'telegram' && !twoFactorTelegramLinked && onOpenTelegramBot ? '0.5rem' : 0 }}>
                            <Typography.Body style={{ fontSize: '0.9rem' }}>Telegram</Typography.Body>
                            <TapSwitch
                                checked={twoFactorEnabled && twoFactorMethod === 'telegram'}
                                onToggle={() => {
                                    if (twoFactorEnabled && twoFactorMethod === 'telegram') {
                                        setTwoFactorEnabled(false);
                                        setTwoFactorMethod('google');
                                        onUpdateAccount(activeAccountId, { twoFactorMethod: 'google', twoFactorEnabled: false });
                                    } else {
                                        setTwoFactorMethod('telegram');
                                        setTwoFactorEnabled(true);
                                        onUpdateAccount(activeAccountId, { twoFactorMethod: 'telegram', twoFactorEnabled: true });
                                    }
                                }}
                            />
                        </Flex>
                        {twoFactorEnabled && twoFactorMethod === 'telegram' && (
                            <>
                                {twoFactorTelegramLinked ? (
                                    <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-success-status)' }}>
                                        Telegram привязан
                                    </Typography.Body>
                                ) : onOpenTelegramBot ? (
                                    <Button
                                        className="filter-button"
                                        size="small"
                                        disabled={tgLinkChecking}
                                        onClick={async () => {
                                            setTgLinkError(null);
                                            try {
                                                await onOpenTelegramBot();
                                                void pollTelegramLink();
                                            } catch (e: any) {
                                                setTgLinkError(e?.message || 'Не удалось открыть бота.');
                                            }
                                        }}
                                        style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}
                                    >
                                        {tgLinkChecking ? 'Проверка…' : 'Привязать Telegram'}
                                    </Button>
                                ) : (
                                    <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                        Откройте бота для привязки
                                    </Typography.Body>
                                )}
                            </>
                        )}
                    </Panel>
                </div>
            </div>
        );
    }
    
    return (
        <div className="w-full">
            {/* Настройки */}
            <div style={{ marginBottom: '1.5rem' }}>
                <Typography.Body style={{ marginBottom: '1.25rem', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Настройки</Typography.Body>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {settingsItems
                        .map((item) => (
                        <Panel
                            key={item.id}
                            className="cargo-card"
                            onClick={item.onClick}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                padding: '1rem',
                                cursor: 'pointer'
                            }}
                        >
                            <Flex align="center" style={{ flex: 1, gap: '0.75rem' }}>
                                <div style={{ color: 'var(--color-primary)' }}>{item.icon}</div>
                                <Typography.Body style={{ fontSize: '0.9rem' }}>{item.label}</Typography.Body>
                            </Flex>
                        </Panel>
                    ))}
                </div>
            </div>

            {/* Безопасность */}
            <div style={{ marginBottom: '1.5rem' }}>
                <Typography.Body style={{ marginBottom: '0.75rem', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Безопасность</Typography.Body>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {/* 2FA — переход на отдельную страницу */}
                    {activeAccountId && activeAccount && (
                        <Panel
                            className="cargo-card"
                            onClick={() => setCurrentView('2fa')}
                            style={{ display: 'flex', alignItems: 'center', padding: '1rem', cursor: 'pointer' }}
                        >
                            <Flex align="center" style={{ flex: 1, gap: '0.75rem' }}>
                                <div style={{ color: 'var(--color-primary)' }}>
                                    <Shield className="w-5 h-5" />
                                </div>
                                <Typography.Body style={{ fontSize: '0.9rem' }}>Двухфакторная аутентификация (2FA)</Typography.Body>
                            </Flex>
                        </Panel>
                    )}
                    {/* Пароль — смена пароля для входа по email/паролю */}
                    {activeAccountId && activeAccount?.isRegisteredUser && (
                        <>
                            <Panel
                                className="cargo-card"
                                onClick={() => setShowPasswordForm((v) => !v)}
                                style={{ display: 'flex', alignItems: 'center', padding: '1rem', cursor: 'pointer' }}
                            >
                                <Flex align="center" style={{ flex: 1, gap: '0.75rem' }}>
                                    <div style={{ color: 'var(--color-primary)' }}>
                                        <Lock className="w-5 h-5" />
                                    </div>
                                    <Typography.Body style={{ fontSize: '0.9rem' }}>Пароль</Typography.Body>
                                </Flex>
                            </Panel>
                            {showPasswordForm && (
                                <Panel className="cargo-card" style={{ padding: '1rem' }} onClick={(e) => e.stopPropagation()}>
                                    <Typography.Body style={{ marginBottom: '0.75rem', fontSize: '0.9rem', fontWeight: 600 }}>Смена пароля</Typography.Body>
                                    <form
                                        onSubmit={async (e) => {
                                            e.preventDefault();
                                            if (!activeAccount?.login || !passwordNew || passwordNew !== passwordConfirm) {
                                                setPasswordError(passwordNew !== passwordConfirm ? 'Пароли не совпадают' : 'Заполните все поля');
                                                return;
                                            }
                                            if (passwordNew.length < 8) {
                                                setPasswordError('Новый пароль не менее 8 символов');
                                                return;
                                            }
                                            setPasswordError(null);
                                            setPasswordLoading(true);
                                            try {
                                                const res = await fetch('/api/change-password', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({
                                                        login: activeAccount.login,
                                                        currentPassword: passwordCurrent,
                                                        newPassword: passwordNew,
                                                    }),
                                                });
                                                const data = await res.json().catch(() => ({}));
                                                if (!res.ok) throw new Error((data?.error as string) || 'Ошибка смены пароля');
                                                setPasswordSuccess(true);
                                                onUpdateAccount(activeAccountId, { password: passwordNew });
                                                setPasswordCurrent('');
                                                setPasswordNew('');
                                                setPasswordConfirm('');
                                                setTimeout(() => { setShowPasswordForm(false); setPasswordSuccess(false); }, 1500);
                                            } catch (err: unknown) {
                                                setPasswordError((err as Error)?.message || 'Ошибка смены пароля');
                                            } finally {
                                                setPasswordLoading(false);
                                            }
                                        }}
                                        style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
                                    >
                                        <div>
                                            <Typography.Body style={{ marginBottom: '0.25rem', fontSize: '0.85rem' }}>Текущий пароль</Typography.Body>
                                            <Input
                                                type="password"
                                                className="login-input"
                                                placeholder="Текущий пароль"
                                                value={passwordCurrent}
                                                onChange={(e) => setPasswordCurrent(e.target.value)}
                                                autoComplete="current-password"
                                                style={{ width: '100%' }}
                                            />
                                        </div>
                                        <div>
                                            <Typography.Body style={{ marginBottom: '0.25rem', fontSize: '0.85rem' }}>Новый пароль</Typography.Body>
                                            <Input
                                                type="password"
                                                className="login-input"
                                                placeholder="Не менее 8 символов"
                                                value={passwordNew}
                                                onChange={(e) => setPasswordNew(e.target.value)}
                                                autoComplete="new-password"
                                                style={{ width: '100%' }}
                                            />
                                        </div>
                                        <div>
                                            <Typography.Body style={{ marginBottom: '0.25rem', fontSize: '0.85rem' }}>Подтвердите новый пароль</Typography.Body>
                                            <Input
                                                type="password"
                                                className="login-input"
                                                placeholder="Повторите новый пароль"
                                                value={passwordConfirm}
                                                onChange={(e) => setPasswordConfirm(e.target.value)}
                                                autoComplete="new-password"
                                                style={{ width: '100%' }}
                                            />
                                        </div>
                                        {passwordError && (
                                            <Typography.Body style={{ color: 'var(--color-error)', fontSize: '0.85rem' }}>{passwordError}</Typography.Body>
                                        )}
                                        {passwordSuccess && (
                                            <Typography.Body style={{ color: 'var(--color-success-status, #22c55e)', fontSize: '0.85rem' }}>Пароль успешно изменён.</Typography.Body>
                                        )}
                                        <Flex gap="0.5rem">
                                            <Button type="submit" className="button-primary" disabled={passwordLoading}>
                                                {passwordLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Сохранить'}
                                            </Button>
                                            <Button
                                                type="button"
                                                className="filter-button"
                                                onClick={() => { setShowPasswordForm(false); setPasswordError(null); setPasswordCurrent(''); setPasswordNew(''); setPasswordConfirm(''); }}
                                            >
                                                Отмена
                                            </Button>
                                        </Flex>
                                    </form>
                                </Panel>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Информация */}
            <div>
                <Typography.Body style={{ marginBottom: '0.75rem', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Информация</Typography.Body>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {infoItems.map((item) => (
                        <Panel
                            key={item.id}
                            className="cargo-card"
                            onClick={item.onClick}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                padding: '1rem',
                                cursor: 'pointer'
                            }}
                        >
                            <Flex align="center" style={{ flex: 1, gap: '0.75rem' }}>
                                <div style={{ color: 'var(--color-primary)' }}>{item.icon}</div>
                                <Typography.Body style={{ fontSize: '0.9rem' }}>{item.label}</Typography.Body>
                            </Flex>
                        </Panel>
                    ))}
                </div>
            </div>
        </div>
    );
}

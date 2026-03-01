/**
 * HAULZ — Заявки на расходы.
 * Руководитель подразделения формирует заявки только по своему подразделению.
 * Подразделение определяется из справочника сотрудников (API /api/my-department-timesheet).
 * Транспорт — выпадающее меню с поиском из данных перевозок (/api/perevozki).
 * COGS/OPEX/CAPEX не указываются (задаются в справочнике категорий).
 */
import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Loader2, Paperclip, Send, Car, ChevronDown, Search, X, SendHorizonal, User, Pencil, Trash2 } from "lucide-react";
import { Button, Flex, Input, Panel, Typography } from "@maxhub/max-ui";
import { EXPENSE_REQUESTS_WEBHOOK_URL, PROXY_API_BASE_URL } from "../constants/config";
import type { AuthData } from "../types";

const STORAGE_KEY_PREFIX = "haulz.expense_requests";

const VAT_RATES = [
    { value: "", label: "Без НДС" },
    { value: "0", label: "0%" },
    { value: "5", label: "5%" },
    { value: "7", label: "7%" },
    { value: "10", label: "10%" },
    { value: "20", label: "20%" },
    { value: "22", label: "22%" },
] as const;

export type ExpenseRequestItem = {
    id: string;
    createdAt: string;
    department: string;
    docNumber: string;
    docDate: string;
    period: string;
    categoryId: string;
    categoryName: string;
    amount: number;
    vatRate: string;
    comment: string;
    vehicleOrEmployee: string;
    employeeName: string;
    attachmentNames: string[];
    attachments?: { name: string; dataUrl: string }[];
    status: "draft" | "pending_approval" | "approved" | "rejected" | "sent" | "paid";
    rejectionReason?: string;
    webhookSentAt?: string;
};

/** Статьи расходов по умолчанию (если API недоступен) — совпадают с expense_categories. */
const FALLBACK_CATEGORIES = [
    { id: "fuel", name: "Топливо", costType: "COGS" as const },
    { id: "repair", name: "Ремонт и обслуживание", costType: "COGS" as const },
    { id: "spare_parts", name: "Запасные части", costType: "COGS" as const },
    { id: "salary", name: "Зарплата", costType: "OPEX" as const },
    { id: "office", name: "Офис", costType: "OPEX" as const },
    { id: "rent", name: "Аренда", costType: "OPEX" as const },
    { id: "insurance", name: "Страхование", costType: "OPEX" as const },
    { id: "mainline", name: "Магистраль", costType: "COGS" as const },
    { id: "pickup_logistics", name: "Заборная логистика", costType: "COGS" as const },
    { id: "other", name: "Прочее", costType: "OPEX" as const },
];

/** Нормализация отображения ТС (контейнер / гос. номер / прочее). Повторяет логику DocumentsPage. */
function normalizeTransportDisplay(value: unknown): string {
    const s = String(value ?? "").toUpperCase().trim();
    if (!s) return "";
    const ns = s.replace(/\s+/g, " ");
    const container = ns.match(/([A-ZА-Я]{4})[\s\-]*([0-9]{7})$/u);
    if (container) return `${container[1]} ${container[2]}`;
    const vehicle = ns.match(/([A-ZА-Я][0-9]{3}[A-ZА-Я]{2})(\s*\/?\s*([0-9]{2,3}))?$/u);
    if (vehicle) {
        const base = vehicle[1];
        const region = vehicle[3] ?? "";
        if (!region) return base;
        return (vehicle[2] ?? "").includes("/") ? `${base}/${region}` : `${base}${region}`;
    }
    const loose = ns.match(/([A-ZА-Я])[\s\-]*([0-9]{3})[\s\-]*([A-ZА-Я]{2})(?:[\s\-]*\/?[\s\-]*([0-9]{2,3}))?$/u);
    if (loose) {
        const base = `${loose[1]}${loose[2]}${loose[3]}`;
        const region = loose[4] ?? "";
        if (!region) return base;
        return ns.includes("/") ? `${base}/${region}` : `${base}${region}`;
    }
    return ns
        .replace(/\bнаименование\s*тс\b[:\-]?\s*/giu, "")
        .replace(/\bконтейнер\b[:\-]?\s*/giu, "")
        .replace(/\s{2,}/g, " ")
        .trim();
}

function storageKey(login: string) {
    return `${STORAGE_KEY_PREFIX}.${login || "anon"}`;
}

function loadStoredRequests(login: string): ExpenseRequestItem[] {
    try {
        const raw = localStorage.getItem(storageKey(login));
        if (!raw) return [];
        const all = JSON.parse(raw) as ExpenseRequestItem[];
        return Array.isArray(all) ? all.filter((r) => r && r.createdAt) : [];
    } catch {
        return [];
    }
}

function saveStoredRequests(login: string, items: ExpenseRequestItem[]) {
    try {
        localStorage.setItem(storageKey(login), JSON.stringify(items));
    } catch { /* ignore */ }
}

type Props = {
    auth: AuthData | null;
    /** Fallback-название подразделения (используется если API не вернул). */
    departmentName?: string;
};

export function ExpenseRequestsPage({ auth, departmentName: fallbackDepartment = "Моё подразделение" }: Props) {
    const [docNumber, setDocNumber] = useState("");
    const [docDate, setDocDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [period, setPeriod] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    });
    const [categoryId, setCategoryId] = useState("");
    const [amount, setAmount] = useState("");
    const [vatRate, setVatRate] = useState("");
    const [comment, setComment] = useState("");
    const [selectedVehicle, setSelectedVehicle] = useState("");
    const [duplicateWarning, setDuplicateWarning] = useState("");
    const [vehicleSearch, setVehicleSearch] = useState("");
    const [vehicleDropdownOpen, setVehicleDropdownOpen] = useState(false);
    const [files, setFiles] = useState<{ name: string; dataUrl: string }[]>([]);
    const [sending, setSending] = useState(false);
    const [list, setList] = useState<ExpenseRequestItem[]>(() => loadStoredRequests(auth?.login ?? ""));
    const [editingId, setEditingId] = useState<string | null>(null);

    const [department, setDepartment] = useState(fallbackDepartment);
    const [departmentLoading, setDepartmentLoading] = useState(false);
    const [vehicles, setVehicles] = useState<string[]>([]);
    const [vehiclesLoading, setVehiclesLoading] = useState(false);
    const [categories, setCategories] = useState<{ id: string; name: string }[]>(FALLBACK_CATEGORIES);
    const [employees, setEmployees] = useState<{ id: number; fullName: string; login: string; position?: string }[]>([]);
    const [selectedEmployee, setSelectedEmployee] = useState("");
    const [employeeSearch, setEmployeeSearch] = useState("");
    const [employeeDropdownOpen, setEmployeeDropdownOpen] = useState(false);

    const vehicleDropdownRef = useRef<HTMLDivElement>(null);
    const employeeDropdownRef = useRef<HTMLDivElement>(null);
    const formPanelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setList(loadStoredRequests(auth?.login ?? ""));
    }, [auth?.login]);

    // --- Fetch department from employee directory ---
    useEffect(() => {
        if (!auth?.login || !auth?.password) return;
        setDepartmentLoading(true);
        const origin = typeof window !== "undefined" && window.location?.origin ? window.location.origin : "";
        const now = new Date();
        const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        fetch(`${origin}/api/my-department-timesheet`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ login: auth.login, password: auth.password, month }),
        })
            .then((r) => (r.ok ? r.json() : Promise.reject()))
            .then((data: any) => {
                if (typeof data?.department === "string" && data.department) setDepartment(data.department);
                if (Array.isArray(data?.employees)) {
                    setEmployees(data.employees.map((e: any) => ({
                        id: e.id,
                        fullName: e.fullName || e.full_name || e.login || "",
                        login: e.login || "",
                        position: e.position || "",
                    })).filter((e: any) => e.fullName || e.login));
                }
            })
            .catch(() => { /* keep fallback */ })
            .finally(() => setDepartmentLoading(false));
    }, [auth?.login, auth?.password]);

    // --- Справочник статей расходов (единый с PNL) ---
    useEffect(() => {
        const origin = typeof window !== "undefined" && window.location?.origin ? window.location.origin : "";
        fetch(`${origin}/api/expense-request-categories`)
            .then((r) => (r.ok ? r.json() : Promise.reject()))
            .then((data: any[]) => {
                if (Array.isArray(data) && data.length > 0) {
                    setCategories(data.map((c: any) => ({ id: c.id ?? "", name: c.name ?? "" })).filter((c) => c.id && c.name));
                }
            })
            .catch(() => { /* keep FALLBACK_CATEGORIES */ });
    }, []);

    // --- Fetch vehicles from perevozki API (same source as Cargo page) ---
    useEffect(() => {
        if (!auth?.login || !auth?.password) return;
        setVehiclesLoading(true);
        const now = new Date();
        const dateTo = now.toISOString().slice(0, 10);
        const dateFrom = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().slice(0, 10);
        fetch(PROXY_API_BASE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                login: auth.login,
                password: auth.password,
                dateFrom,
                dateTo,
                ...(auth.inn ? { inn: auth.inn } : {}),
                ...(auth.isRegisteredUser ? { isRegisteredUser: true } : {}),
            }),
        })
            .then((r) => (r.ok ? r.json() : Promise.reject()))
            .then((data: any) => {
                const list = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
                const set = new Set<string>();
                list.forEach((item: any) => {
                    const raw = item?.АвтомобильCMRНаименование ?? item?.AutoReg ?? item?.autoReg ?? item?.AutoType ?? "";
                    const normalized = normalizeTransportDisplay(raw);
                    if (normalized) set.add(normalized);
                });
                setVehicles([...set].sort((a, b) => a.localeCompare(b, "ru")));
            })
            .catch(() => { /* ignore */ })
            .finally(() => setVehiclesLoading(false));
    }, [auth?.login, auth?.password, auth?.inn, auth?.isRegisteredUser]);

    // Close dropdowns on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (vehicleDropdownRef.current && !vehicleDropdownRef.current.contains(e.target as Node)) {
                setVehicleDropdownOpen(false);
            }
            if (employeeDropdownRef.current && !employeeDropdownRef.current.contains(e.target as Node)) {
                setEmployeeDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    // --- Duplicate detection by document number ---
    useEffect(() => {
        const num = docNumber.trim();
        if (!num) { setDuplicateWarning(""); return; }
        const dup = list.find((r) => r.docNumber && r.docNumber.trim().toLowerCase() === num.toLowerCase());
        if (dup) {
            const date = new Date(dup.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
            setDuplicateWarning(`Документ №${num} уже заведён ${date} (${dup.categoryName}, ${dup.amount.toLocaleString("ru-RU")} ₽)`);
        } else {
            setDuplicateWarning("");
        }
    }, [docNumber, list]);

    const filteredVehicles = useMemo(() => {
        const q = vehicleSearch.trim().toLowerCase();
        if (!q) return vehicles;
        return vehicles.filter((v) => v.toLowerCase().includes(q));
    }, [vehicles, vehicleSearch]);

    const filteredEmployees = useMemo(() => {
        const q = employeeSearch.trim().toLowerCase();
        if (!q) return employees;
        return employees.filter((e) => `${e.fullName} ${e.login} ${e.position ?? ""}`.toLowerCase().includes(q));
    }, [employees, employeeSearch]);

    const addFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const chosen = e.target.files;
        if (!chosen?.length) return;
        const next: { name: string; dataUrl: string }[] = [];
        const add = (i: number) => {
            if (i >= chosen.length) {
                setFiles((prev) => [...prev, ...next]);
                return;
            }
            const f = chosen[i];
            const r = new FileReader();
            r.onload = () => {
                next.push({ name: f.name, dataUrl: r.result as string });
                add(i + 1);
            };
            r.readAsDataURL(f);
        };
        add(0);
    }, []);

    const removeFile = useCallback((index: number) => {
        setFiles((prev) => prev.filter((_, i) => i !== index));
    }, []);

    const submit = useCallback(async () => {
        const cat = categories.find((c) => c.id === categoryId);
        if (!cat || !amount.trim() || !docNumber.trim()) return;
        const num = parseFloat(amount.replace(",", "."));
        if (!Number.isFinite(num) || num <= 0) return;

        const item: ExpenseRequestItem = {
            id: `er-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            createdAt: new Date().toISOString(),
            department,
            docNumber: docNumber.trim(),
            docDate: docDate || new Date().toISOString().slice(0, 10),
            period: period || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`,
            categoryId: cat.id,
            categoryName: cat.name,
            amount: num,
            vatRate,
            comment: comment.trim(),
            vehicleOrEmployee: selectedVehicle.trim(),
            employeeName: selectedEmployee,
            attachmentNames: files.map((f) => f.name),
            attachments: files.map((f) => ({ name: f.name, dataUrl: f.dataUrl })),
            status: "draft",
        };

        setList((prev) => {
            const next = [item, ...prev];
            saveStoredRequests(auth?.login ?? "", next);
            return next;
        });

        setDocNumber("");
        setDocDate(new Date().toISOString().slice(0, 10));
        setPeriod(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`);
        setCategoryId("");
        setAmount("");
        setVatRate("");
        setComment("");
        setSelectedVehicle("");
        setVehicleSearch("");
        setSelectedEmployee("");
        setEmployeeSearch("");
        setDuplicateWarning("");
        setFiles([]);

        if (EXPENSE_REQUESTS_WEBHOOK_URL) {
            setSending(true);
            try {
                const payload = {
                    ...item,
                    status: "sent",
                    login: auth?.login ?? undefined,
                    attachmentCount: files.length,
                    attachments: files.map((f) => ({ name: f.name, dataUrl: f.dataUrl })),
                };
                const res = await fetch(EXPENSE_REQUESTS_WEBHOOK_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                if (res.ok) {
                    const sentAt = new Date().toISOString();
                    setList((prev) => {
                        const next = prev.map((r) =>
                            r.id === item.id ? { ...r, status: "sent" as const, webhookSentAt: sentAt } : r
                        );
                        saveStoredRequests(auth?.login ?? "", next);
                        return next;
                    });
                }
            } catch { /* leave as draft */ } finally {
                setSending(false);
            }
        }
    }, [categoryId, amount, vatRate, comment, selectedVehicle, selectedEmployee, files, auth?.login, department, docNumber, docDate, period, categories]);

    const sendForApproval = useCallback(async (itemId: string) => {
        setSending(true);
        try {
            const item = list.find((r) => r.id === itemId);
            if (!item) return;
            if (EXPENSE_REQUESTS_WEBHOOK_URL) {
                const payload = {
                    ...item,
                    status: "pending_approval",
                    login: auth?.login ?? undefined,
                    attachmentCount: item.attachmentNames.length,
                    attachments: item.attachments ?? [],
                };
                const res = await fetch(EXPENSE_REQUESTS_WEBHOOK_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                if (res.ok) {
                    setList((prev) => {
                        const next = prev.map((r) =>
                            r.id === itemId ? { ...r, status: "pending_approval" as const, webhookSentAt: new Date().toISOString() } : r
                        );
                        saveStoredRequests(auth?.login ?? "", next);
                        return next;
                    });
                    return;
                }
            }
            setList((prev) => {
                const next = prev.map((r) =>
                    r.id === itemId ? { ...r, status: "pending_approval" as const } : r
                );
                saveStoredRequests(auth?.login ?? "", next);
                return next;
            });
        } catch { /* ignore */ } finally {
            setSending(false);
        }
    }, [list, auth?.login]);

    const deleteRequest = useCallback((itemId: string) => {
        if (!window.confirm("Удалить заявку? Действие нельзя отменить.")) return;
        setList((prev) => {
            const next = prev.filter((r) => r.id !== itemId);
            saveStoredRequests(auth?.login ?? "", next);
            return next;
        });
    }, [auth?.login]);

    const recallRequest = useCallback((itemId: string) => {
        setList((prev) => {
            const next = prev.map((r) => r.id === itemId ? { ...r, status: "draft" as const } : r);
            saveStoredRequests(auth?.login ?? "", next);
            return next;
        });
    }, [auth?.login]);

    const startEdit = useCallback((item: ExpenseRequestItem) => {
        setEditingId(item.id);
        setDocNumber(item.docNumber ?? "");
        setDocDate(item.docDate ?? "");
        setPeriod(item.period ?? "");
        setCategoryId(item.categoryId);
        setAmount(String(item.amount));
        setVatRate((item as any).vatRate ?? "");
        setComment(item.comment);
        setSelectedVehicle(item.vehicleOrEmployee ?? "");
        setSelectedEmployee((item as any).employeeName ?? "");
        setTimeout(() => formPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }, []);

    const saveEdit = useCallback(() => {
        if (!editingId) return;
        const cat = categories.find((c) => c.id === categoryId);
        if (!cat || !amount.trim() || !docNumber.trim()) return;
        const num = parseFloat(amount.replace(",", "."));
        if (!Number.isFinite(num) || num <= 0) return;
        setList((prev) => {
            const next = prev.map((r) => r.id === editingId ? {
                ...r,
                docNumber: docNumber.trim(),
                docDate: docDate || r.docDate,
                period: period || r.period,
                categoryId: cat.id,
                categoryName: cat.name,
                amount: num,
                vatRate,
                comment: comment.trim(),
                vehicleOrEmployee: selectedVehicle.trim(),
                employeeName: selectedEmployee,
                status: "draft" as const,
            } : r);
            saveStoredRequests(auth?.login ?? "", next);
            return next;
        });
        setEditingId(null);
        setDocNumber("");
        setDocDate(new Date().toISOString().slice(0, 10));
        setPeriod(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`);
        setCategoryId("");
        setAmount("");
        setVatRate("");
        setComment("");
        setSelectedVehicle("");
        setSelectedEmployee("");
    }, [editingId, docNumber, docDate, period, categoryId, amount, vatRate, comment, selectedVehicle, selectedEmployee, auth?.login, categories]);

    const cancelEdit = useCallback(() => {
        setEditingId(null);
        setDocNumber("");
        setDocDate(new Date().toISOString().slice(0, 10));
        setPeriod(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`);
        setCategoryId("");
        setAmount("");
        setVatRate("");
        setComment("");
        setSelectedVehicle("");
        setSelectedEmployee("");
    }, []);

    const canSubmit = categoryId && amount.trim() && parseFloat(amount.replace(",", ".")) > 0 && docNumber.trim();

    return (
        <div className="w-full" style={{ padding: "1rem", paddingBottom: "5rem" }}>
            <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
                Подразделение: {departmentLoading ? "загрузка…" : department}.{" "}
                Укажите статью расхода, сумму, комментарий и при необходимости приложите счёт или выберите транспорт.
            </Typography.Body>

            <Panel ref={formPanelRef} className="cargo-card" style={{ marginBottom: "1rem", background: "var(--color-bg-card)", borderRadius: "12px", padding: "1rem 1.25rem" }}>
                <Flex justify="space-between" align="center" style={{ marginBottom: "0.75rem" }}>
                    <Typography.Body style={{ fontSize: "0.9rem", fontWeight: 600 }}>{editingId ? "Редактирование заявки" : "Новая заявка"}</Typography.Body>
                    {editingId && (
                        <button type="button" onClick={cancelEdit} style={{ fontSize: "0.72rem", padding: "0.25rem 0.5rem", borderRadius: 6, border: "1px solid var(--color-border)", background: "transparent", cursor: "pointer" }}>Отмена</button>
                    )}
                </Flex>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {/* Doc number + date + period */}
                    <Flex gap="0.75rem" style={{ flexWrap: "wrap", alignItems: "flex-start" }}>
                        <div style={{ flex: "1 1 40%", minWidth: 140 }}>
                            <label style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", display: "block", marginBottom: "0.25rem" }}>Номер документа *</label>
                            <input
                                type="text"
                                placeholder="№ счёта / накладной"
                                value={docNumber}
                                onChange={(e) => setDocNumber(e.target.value)}
                                className="admin-form-input"
                                style={{ width: "100%", padding: "0.5rem", height: 38, boxSizing: "border-box", ...(duplicateWarning ? { borderColor: "#f59e0b" } : {}) }}
                            />
                            {duplicateWarning && (
                                <Typography.Body style={{ fontSize: "0.72rem", color: "#f59e0b", marginTop: "0.2rem" }}>
                                    ⚠ {duplicateWarning}
                                </Typography.Body>
                            )}
                        </div>
                        <div style={{ flex: "1 1 28%", minWidth: 120 }}>
                            <label style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", display: "block", marginBottom: "0.25rem" }}>Дата документа</label>
                            <input
                                type="date"
                                value={docDate}
                                onChange={(e) => setDocDate(e.target.value)}
                                className="admin-form-input"
                                style={{ width: "100%", padding: "0.5rem", height: 38, boxSizing: "border-box" }}
                            />
                        </div>
                        <div style={{ flex: "1 1 28%", minWidth: 120 }}>
                            <label style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", display: "block", marginBottom: "0.25rem" }}>Период (месяц/год)</label>
                            <input
                                type="month"
                                value={period}
                                onChange={(e) => setPeriod(e.target.value)}
                                className="admin-form-input"
                                style={{ width: "100%", padding: "0.5rem", height: 38, boxSizing: "border-box" }}
                            />
                        </div>
                    </Flex>

                    {/* Category */}
                    <div>
                        <label style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", display: "block", marginBottom: "0.25rem" }}>Статья расхода</label>
                        <select
                            className="admin-form-input"
                            value={categoryId}
                            onChange={(e) => setCategoryId(e.target.value)}
                            style={{ width: "100%", padding: "0.5rem" }}
                        >
                            <option value="">Выберите</option>
                            {categories.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Amount + VAT */}
                    <Flex gap="0.75rem" style={{ flexWrap: "wrap" }}>
                        <div style={{ flex: "1 1 55%", minWidth: 140 }}>
                            <label style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", display: "block", marginBottom: "0.25rem" }}>Сумма (₽)</label>
                            <input
                                type="text"
                                inputMode="decimal"
                                placeholder="0"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="admin-form-input"
                                style={{ width: "100%", padding: "0.5rem", height: 38, boxSizing: "border-box" }}
                            />
                        </div>
                        <div style={{ flex: "1 1 40%", minWidth: 120 }}>
                            <label style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", display: "block", marginBottom: "0.25rem" }}>НДС</label>
                            <select
                                value={vatRate}
                                onChange={(e) => setVatRate(e.target.value)}
                                className="admin-form-input"
                                style={{ width: "100%", padding: "0.5rem", height: 38, boxSizing: "border-box" }}
                            >
                                {VAT_RATES.map((v) => (
                                    <option key={v.value} value={v.value}>{v.label}</option>
                                ))}
                            </select>
                        </div>
                    </Flex>

                    {/* Comment */}
                    <div>
                        <label style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", display: "block", marginBottom: "0.25rem" }}>Комментарий (основание)</label>
                        <textarea
                            placeholder="Назначение расхода, обоснование"
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            className="admin-form-input"
                            style={{ width: "100%", minHeight: 72, resize: "vertical" }}
                            rows={3}
                        />
                    </div>

                    {/* Vehicle — searchable dropdown */}
                    <div ref={vehicleDropdownRef} style={{ position: "relative" }}>
                        <label style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", display: "block", marginBottom: "0.25rem" }}>
                            <Car className="w-3.5 h-3.5 inline-block mr-1" /> Транспортное средство (необязательно)
                        </label>
                        <div
                            className="admin-form-input"
                            onClick={() => setVehicleDropdownOpen((p) => !p)}
                            style={{
                                width: "100%",
                                padding: "0.5rem",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                cursor: "pointer",
                                minHeight: 38,
                            }}
                        >
                            <span style={{ fontSize: "0.85rem", color: selectedVehicle ? "inherit" : "var(--color-text-secondary)" }}>
                                {selectedVehicle || "Выберите ТС"}
                            </span>
                            <Flex align="center" gap="0.35rem">
                                {selectedVehicle && (
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setSelectedVehicle(""); setVehicleSearch(""); }}
                                        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}
                                        aria-label="Очистить"
                                    >
                                        <X className="w-3.5 h-3.5" style={{ color: "var(--color-text-secondary)" }} />
                                    </button>
                                )}
                                <ChevronDown className="w-3.5 h-3.5" style={{ color: "var(--color-text-secondary)", transform: vehicleDropdownOpen ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }} />
                            </Flex>
                        </div>
                        {vehicleDropdownOpen && (
                            <div style={{
                                position: "absolute",
                                top: "100%",
                                left: 0,
                                right: 0,
                                zIndex: 50,
                                background: "var(--color-bg-card, #fff)",
                                border: "1px solid var(--color-border)",
                                borderRadius: 8,
                                boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
                                maxHeight: 260,
                                display: "flex",
                                flexDirection: "column",
                            }}>
                                <div style={{ padding: "0.4rem 0.5rem", borderBottom: "1px solid var(--color-border)" }}>
                                    <Flex align="center" gap="0.35rem">
                                        <Search className="w-3.5 h-3.5" style={{ color: "var(--color-text-secondary)", flexShrink: 0 }} />
                                        <input
                                            type="text"
                                            placeholder="Поиск по номеру или модели…"
                                            value={vehicleSearch}
                                            onChange={(e) => setVehicleSearch(e.target.value)}
                                            autoFocus
                                            style={{
                                                border: "none",
                                                outline: "none",
                                                width: "100%",
                                                fontSize: "0.82rem",
                                                background: "transparent",
                                                color: "inherit",
                                            }}
                                        />
                                    </Flex>
                                </div>
                                <div style={{ overflowY: "auto", flex: 1 }}>
                                    {vehiclesLoading ? (
                                        <div style={{ padding: "0.75rem", textAlign: "center" }}><Loader2 className="w-4 h-4 animate-spin" style={{ margin: "0 auto" }} /></div>
                                    ) : filteredVehicles.length === 0 ? (
                                        <div style={{ padding: "0.75rem", textAlign: "center", fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                                            {vehicles.length === 0 ? "Справочник ТС пуст или не подключён" : "Не найдено"}
                                        </div>
                                    ) : (
                                        filteredVehicles.map((v) => (
                                            <div
                                                key={v}
                                                onClick={() => {
                                                    setSelectedVehicle(v);
                                                    setVehicleSearch("");
                                                    setVehicleDropdownOpen(false);
                                                }}
                                                style={{
                                                    padding: "0.45rem 0.65rem",
                                                    cursor: "pointer",
                                                    fontSize: "0.83rem",
                                                    borderBottom: "1px solid var(--color-border)",
                                                    background: selectedVehicle === v ? "var(--color-bg-hover)" : undefined,
                                                }}
                                            >
                                                {v}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Employee */}
                    <div ref={employeeDropdownRef} style={{ position: "relative" }}>
                        <label style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", display: "block", marginBottom: "0.25rem" }}>
                            <User className="w-3.5 h-3.5 inline-block mr-1" /> Сотрудник (необязательно)
                        </label>
                        <div
                            onClick={() => setEmployeeDropdownOpen((v) => !v)}
                            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.5rem", border: "1px solid var(--color-border)", borderRadius: 8, cursor: "pointer", minHeight: 38, boxSizing: "border-box", background: "var(--color-bg-card, #fff)" }}
                        >
                            <span style={{ fontSize: "0.85rem", color: selectedEmployee ? "inherit" : "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                                {selectedEmployee || "Выберите сотрудника"}
                            </span>
                            <Flex align="center" gap="0.25rem">
                                {selectedEmployee && (
                                    <button type="button"
                                        onClick={(e) => { e.stopPropagation(); setSelectedEmployee(""); setEmployeeSearch(""); }}
                                        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}
                                        aria-label="Очистить"
                                    >
                                        <X className="w-3.5 h-3.5" style={{ color: "var(--color-text-secondary)" }} />
                                    </button>
                                )}
                                <ChevronDown className="w-4 h-4" style={{ color: "var(--color-text-secondary)", transform: employeeDropdownOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
                            </Flex>
                        </div>
                        {employeeDropdownOpen && (
                            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50, marginTop: 4, background: "var(--color-bg-card, #fff)", border: "1px solid var(--color-border)", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.1)", maxHeight: 240, display: "flex", flexDirection: "column" }}>
                                <div style={{ padding: "0.4rem", borderBottom: "1px solid var(--color-border)", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                                    <Search className="w-3.5 h-3.5" style={{ color: "var(--color-text-secondary)" }} />
                                    <input
                                        type="text"
                                        placeholder="Поиск по ФИО…"
                                        value={employeeSearch}
                                        onChange={(e) => setEmployeeSearch(e.target.value)}
                                        autoFocus
                                        style={{ border: "none", outline: "none", flex: 1, fontSize: "0.82rem", background: "transparent" }}
                                    />
                                </div>
                                <div style={{ overflowY: "auto", flex: 1 }}>
                                    {employees.length === 0 ? (
                                        <div style={{ padding: "0.75rem", textAlign: "center", fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                                            {departmentLoading ? "Загрузка…" : "Нет сотрудников"}
                                        </div>
                                    ) : filteredEmployees.length === 0 ? (
                                        <div style={{ padding: "0.75rem", textAlign: "center", fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>Не найдено</div>
                                    ) : (
                                        filteredEmployees.map((emp) => (
                                            <div
                                                key={emp.id}
                                                onClick={() => { setSelectedEmployee(emp.fullName || emp.login); setEmployeeDropdownOpen(false); setEmployeeSearch(""); }}
                                                style={{ padding: "0.45rem 0.6rem", cursor: "pointer", fontSize: "0.82rem", borderBottom: "1px solid var(--color-border)", background: selectedEmployee === (emp.fullName || emp.login) ? "var(--color-bg-hover)" : "transparent" }}
                                            >
                                                <div style={{ fontWeight: 500 }}>{emp.fullName || emp.login}</div>
                                                {emp.position && <div style={{ fontSize: "0.72rem", color: "var(--color-text-secondary)" }}>{emp.position}</div>}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Attachments */}
                    <div>
                        <label style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", display: "block", marginBottom: "0.25rem" }}>
                            <Paperclip className="w-3.5 h-3.5 inline-block mr-1" /> Счета, документы
                        </label>
                        <input type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" multiple onChange={addFile} style={{ fontSize: "0.8rem" }} />
                        {files.length > 0 && (
                            <div style={{ marginTop: "0.35rem", display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                                {files.map((f, i) => (
                                    <span key={i} style={{ fontSize: "0.7rem", padding: "0.2rem 0.4rem", background: "var(--color-bg-hover)", borderRadius: 6, display: "flex", alignItems: "center", gap: "0.25rem" }}>
                                        {f.name}
                                        <button type="button" onClick={() => removeFile(i)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }} aria-label="Удалить">×</button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    <Button
                        type="button"
                        className="button-primary"
                        onClick={editingId ? saveEdit : submit}
                        disabled={!canSubmit || sending}
                        style={{ alignSelf: "flex-start" }}
                    >
                        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : editingId ? <Pencil className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                        <span style={{ marginLeft: "0.35rem" }}>{editingId ? "Сохранить изменения" : "Отправить заявку"}</span>
                    </Button>
                </div>
            </Panel>

            <Typography.Body style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.5rem" }}>Мои заявки</Typography.Body>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {list.length === 0 ? (
                    <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>Пока нет заявок</Typography.Body>
                ) : (
                    list.map((r) => (
                        <Panel key={r.id} className="cargo-card" style={{ background: "var(--color-bg-card)", borderRadius: "10px", padding: "0.75rem 1rem" }}>
                            <Flex justify="space-between" align="flex-start" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
                                <div>
                                    <Typography.Body style={{ fontWeight: 600, fontSize: "0.9rem" }}>
                                        {r.docNumber ? `№${r.docNumber} · ` : ""}{r.categoryName} — {r.amount.toLocaleString("ru-RU")} ₽{(r as any).vatRate ? ` (НДС ${(r as any).vatRate}%)` : ""}
                                    </Typography.Body>
                                    <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>
                                        {r.docDate ? new Date(r.docDate + "T00:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" }) + " · " : ""}
                                        {r.period ? `период ${r.period} · ` : ""}
                                        {new Date(r.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })}
                                        {r.comment ? ` · ${r.comment}` : ""}
                                    </Typography.Body>
                                    {r.vehicleOrEmployee && (
                                        <Typography.Body style={{ fontSize: "0.72rem", color: "var(--color-text-secondary)" }}>
                                            ТС: {r.vehicleOrEmployee}
                                        </Typography.Body>
                                    )}
                                    {(r as any).employeeName && (
                                        <Typography.Body style={{ fontSize: "0.72rem", color: "var(--color-text-secondary)" }}>
                                            Сотрудник: {(r as any).employeeName}
                                        </Typography.Body>
                                    )}
                                    {r.attachmentNames.length > 0 && (
                                        <Typography.Body style={{ fontSize: "0.7rem", color: "var(--color-text-secondary)" }}>
                                            Вложения:{" "}
                                            {(r as any).attachments?.length
                                                ? (r as any).attachments.map((att: { name: string; dataUrl: string }, i: number) => (
                                                    <React.Fragment key={att.name}>
                                                        {i > 0 && ", "}
                                                        <button
                                                            type="button"
                                                            onClick={(e) => { e.stopPropagation(); const a = document.createElement("a"); a.href = att.dataUrl; a.download = att.name; a.click(); }}
                                                            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--color-primary-blue, #2563eb)", textDecoration: "underline" }}
                                                        >
                                                            {att.name}
                                                        </button>
                                                    </React.Fragment>
                                                ))
                                                : r.attachmentNames.join(", ")}
                                        </Typography.Body>
                                    )}
                                </div>
                                <Flex direction="column" align="flex-end" gap="0.35rem">
                                    <span
                                        style={{
                                            fontSize: "0.7rem",
                                            padding: "0.2rem 0.5rem",
                                            borderRadius: 999,
                                            fontWeight: 600,
                                            whiteSpace: "nowrap",
                                            background: r.status === "approved" ? "rgba(16,185,129,0.15)"
                                                : r.status === "rejected" ? "rgba(239,68,68,0.15)"
                                                : r.status === "paid" ? "rgba(139,92,246,0.15)"
                                                : r.status === "pending_approval" ? "rgba(59,130,246,0.15)"
                                                : r.status === "sent" ? "rgba(16,185,129,0.15)"
                                                : "rgba(245,158,11,0.15)",
                                            color: r.status === "approved" ? "#10b981"
                                                : r.status === "rejected" ? "#ef4444"
                                                : r.status === "paid" ? "#8b5cf6"
                                                : r.status === "pending_approval" ? "#3b82f6"
                                                : r.status === "sent" ? "#10b981"
                                                : "#f59e0b",
                                        }}
                                    >
                                        {r.status === "approved" ? "Согласовано"
                                            : r.status === "rejected" ? "Отклонено"
                                            : r.status === "paid" ? "Оплачено"
                                            : r.status === "pending_approval" ? "На согласовании"
                                            : r.status === "sent" ? "Отправлено"
                                            : "Черновик"}
                                    </span>
                                    {(r as any).rejectionReason && (
                                        <span style={{ fontSize: "0.65rem", color: "#ef4444", maxWidth: 180, textAlign: "right" }}>
                                            Причина: {(r as any).rejectionReason}
                                        </span>
                                    )}
                                    {r.status === "pending_approval" && (
                                        <button type="button" onClick={() => recallRequest(r.id)}
                                            style={{ display: "flex", alignItems: "center", gap: "0.2rem", fontSize: "0.7rem", padding: "0.25rem 0.5rem", borderRadius: 7, border: "1px solid #f59e0b", background: "transparent", color: "#f59e0b", cursor: "pointer", whiteSpace: "nowrap" }}>
                                            <X className="w-3 h-3" /> Отозвать
                                        </button>
                                    )}
                                    {(r.status === "draft" || r.status === "rejected") && (
                                        <Flex gap="0.3rem" wrap="wrap" justify="flex-end">
                                            <button type="button" onClick={() => sendForApproval(r.id)} disabled={sending}
                                                style={{ display: "flex", alignItems: "center", gap: "0.2rem", fontSize: "0.7rem", padding: "0.25rem 0.5rem", borderRadius: 7, border: "1px solid var(--color-primary-blue, #3b82f6)", background: "transparent", color: "var(--color-primary-blue, #3b82f6)", cursor: "pointer", whiteSpace: "nowrap" }}>
                                                <SendHorizonal className="w-3 h-3" /> На согласование
                                            </button>
                                            <button type="button" onClick={() => startEdit(r)}
                                                style={{ display: "flex", alignItems: "center", gap: "0.2rem", fontSize: "0.7rem", padding: "0.25rem 0.5rem", borderRadius: 7, border: "1px solid var(--color-border)", background: "transparent", color: "inherit", cursor: "pointer", whiteSpace: "nowrap" }}>
                                                <Pencil className="w-3 h-3" /> Изменить
                                            </button>
                                            <button type="button" onClick={() => deleteRequest(r.id)}
                                                style={{ display: "flex", alignItems: "center", gap: "0.2rem", fontSize: "0.7rem", padding: "0.25rem 0.5rem", borderRadius: 7, border: "1px solid #ef4444", background: "transparent", color: "#ef4444", cursor: "pointer", whiteSpace: "nowrap" }}>
                                                <Trash2 className="w-3 h-3" /> Удалить
                                            </button>
                                        </Flex>
                                    )}
                                </Flex>
                            </Flex>
                        </Panel>
                    ))
                )}
            </div>
        </div>
    );
}

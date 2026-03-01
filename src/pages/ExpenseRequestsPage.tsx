/**
 * HAULZ — Заявки на расходы.
 * Руководитель подразделения формирует заявки только по своему подразделению.
 * Подразделение определяется из справочника сотрудников (API /api/my-department-timesheet).
 * Транспорт — выпадающее меню с поиском из справочника ТС (API /api/expense-vehicles).
 * COGS/OPEX/CAPEX не указываются (задаются в справочнике категорий).
 */
import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Loader2, Paperclip, Send, Car, ChevronDown, Search, X } from "lucide-react";
import { Button, Flex, Input, Panel, Typography } from "@maxhub/max-ui";
import { EXPENSE_REQUESTS_WEBHOOK_URL } from "../constants/config";
import type { AuthData } from "../types";

const STORAGE_KEY_PREFIX = "haulz.expense_requests";

export type ExpenseRequestItem = {
    id: string;
    createdAt: string;
    department: string;
    categoryId: string;
    categoryName: string;
    amount: number;
    comment: string;
    vehicleOrEmployee: string;
    attachmentNames: string[];
    attachments?: { name: string; dataUrl: string }[];
    status: "draft" | "sent";
    webhookSentAt?: string;
};

const MOCK_CATEGORIES = [
    { id: "fuel", name: "Топливо" },
    { id: "repair", name: "Ремонт и обслуживание" },
    { id: "spare_parts", name: "Запасные части" },
    { id: "salary", name: "Зарплата" },
    { id: "office", name: "Офис" },
    { id: "rent", name: "Аренда" },
    { id: "insurance", name: "Страхование" },
    { id: "other", name: "Прочее" },
];

type VehicleOption = { id: number | string; plate: string; model?: string };

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
    const [categoryId, setCategoryId] = useState("");
    const [amount, setAmount] = useState("");
    const [comment, setComment] = useState("");
    const [selectedVehicle, setSelectedVehicle] = useState("");
    const [vehicleSearch, setVehicleSearch] = useState("");
    const [vehicleDropdownOpen, setVehicleDropdownOpen] = useState(false);
    const [files, setFiles] = useState<{ name: string; dataUrl: string }[]>([]);
    const [sending, setSending] = useState(false);
    const [list, setList] = useState<ExpenseRequestItem[]>(() => loadStoredRequests(auth?.login ?? ""));

    const [department, setDepartment] = useState(fallbackDepartment);
    const [departmentLoading, setDepartmentLoading] = useState(false);
    const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
    const [vehiclesLoading, setVehiclesLoading] = useState(false);

    const vehicleDropdownRef = useRef<HTMLDivElement>(null);

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
            })
            .catch(() => { /* keep fallback */ })
            .finally(() => setDepartmentLoading(false));
    }, [auth?.login, auth?.password]);

    // --- Fetch vehicles from directory ---
    useEffect(() => {
        if (!auth?.login || !auth?.password) return;
        setVehiclesLoading(true);
        const origin = typeof window !== "undefined" && window.location?.origin ? window.location.origin : "";
        fetch(`${origin}/api/expense-vehicles`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ login: auth.login, password: auth.password }),
        })
            .then((r) => (r.ok ? r.json() : Promise.reject()))
            .then((data: any) => {
                if (Array.isArray(data?.vehicles)) {
                    setVehicles(data.vehicles.map((v: any) => ({
                        id: v.id ?? v.plate ?? "",
                        plate: String(v.plate ?? v.regNumber ?? v.number ?? "").trim(),
                        model: v.model ?? v.brand ?? undefined,
                    })).filter((v: VehicleOption) => v.plate));
                }
            })
            .catch(() => { /* endpoint may not exist yet */ })
            .finally(() => setVehiclesLoading(false));
    }, [auth?.login, auth?.password]);

    // Close vehicle dropdown on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (vehicleDropdownRef.current && !vehicleDropdownRef.current.contains(e.target as Node)) {
                setVehicleDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const filteredVehicles = useMemo(() => {
        const q = vehicleSearch.trim().toLowerCase();
        if (!q) return vehicles;
        return vehicles.filter((v) => {
            const hay = `${v.plate} ${v.model ?? ""}`.toLowerCase();
            return hay.includes(q);
        });
    }, [vehicles, vehicleSearch]);

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
        const cat = MOCK_CATEGORIES.find((c) => c.id === categoryId);
        if (!cat || !amount.trim()) return;
        const num = parseFloat(amount.replace(",", "."));
        if (!Number.isFinite(num) || num <= 0) return;

        const item: ExpenseRequestItem = {
            id: `er-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            createdAt: new Date().toISOString(),
            department,
            categoryId: cat.id,
            categoryName: cat.name,
            amount: num,
            comment: comment.trim(),
            vehicleOrEmployee: selectedVehicle.trim(),
            attachmentNames: files.map((f) => f.name),
            attachments: files.map((f) => ({ name: f.name, dataUrl: f.dataUrl })),
            status: "draft",
        };

        setList((prev) => {
            const next = [item, ...prev];
            saveStoredRequests(auth?.login ?? "", next);
            return next;
        });

        setCategoryId("");
        setAmount("");
        setComment("");
        setSelectedVehicle("");
        setVehicleSearch("");
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
    }, [categoryId, amount, comment, selectedVehicle, files, auth?.login, department]);

    const canSubmit = categoryId && amount.trim() && parseFloat(amount.replace(",", ".")) > 0;

    return (
        <div className="w-full" style={{ padding: "1rem", paddingBottom: "5rem" }}>
            <Typography.Headline style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                Заявки на расходы
            </Typography.Headline>
            <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
                Подразделение: {departmentLoading ? "загрузка…" : department}.{" "}
                Укажите статью расхода, сумму, комментарий и при необходимости приложите счёт или выберите транспорт.
            </Typography.Body>

            <Panel className="cargo-card" style={{ marginBottom: "1rem", background: "var(--color-bg-card)", borderRadius: "12px", padding: "1rem 1.25rem" }}>
                <Typography.Body style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.75rem" }}>Новая заявка</Typography.Body>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
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
                            {MOCK_CATEGORIES.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Amount */}
                    <div>
                        <label style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", display: "block", marginBottom: "0.25rem" }}>Сумма (₽)</label>
                        <Input
                            type="text"
                            inputMode="decimal"
                            placeholder="0"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="admin-form-input"
                            style={{ width: "100%" }}
                        />
                    </div>

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
                                                key={v.id}
                                                onClick={() => {
                                                    const display = v.model ? `${v.plate} — ${v.model}` : v.plate;
                                                    setSelectedVehicle(display);
                                                    setVehicleSearch("");
                                                    setVehicleDropdownOpen(false);
                                                }}
                                                style={{
                                                    padding: "0.45rem 0.65rem",
                                                    cursor: "pointer",
                                                    fontSize: "0.83rem",
                                                    borderBottom: "1px solid var(--color-border)",
                                                    background: selectedVehicle.startsWith(v.plate) ? "var(--color-bg-hover)" : undefined,
                                                }}
                                            >
                                                <span style={{ fontWeight: 600 }}>{v.plate}</span>
                                                {v.model && <span style={{ marginLeft: "0.5rem", color: "var(--color-text-secondary)", fontSize: "0.78rem" }}>{v.model}</span>}
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
                        onClick={submit}
                        disabled={!canSubmit || sending}
                        style={{ alignSelf: "flex-start" }}
                    >
                        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        <span style={{ marginLeft: "0.35rem" }}>Отправить заявку</span>
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
                                    <Typography.Body style={{ fontWeight: 600, fontSize: "0.9rem" }}>{r.categoryName} — {r.amount.toLocaleString("ru-RU")} ₽</Typography.Body>
                                    <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>
                                        {new Date(r.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })}
                                        {r.comment ? ` · ${r.comment}` : ""}
                                    </Typography.Body>
                                    {r.vehicleOrEmployee && (
                                        <Typography.Body style={{ fontSize: "0.72rem", color: "var(--color-text-secondary)" }}>
                                            ТС: {r.vehicleOrEmployee}
                                        </Typography.Body>
                                    )}
                                    {r.attachmentNames.length > 0 && (
                                        <Typography.Body style={{ fontSize: "0.7rem", color: "var(--color-text-secondary)" }}>
                                            Вложения: {r.attachmentNames.join(", ")}
                                        </Typography.Body>
                                    )}
                                </div>
                                <span
                                    style={{
                                        fontSize: "0.7rem",
                                        padding: "0.2rem 0.5rem",
                                        borderRadius: 999,
                                        background: r.status === "sent" ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)",
                                        color: r.status === "sent" ? "#10b981" : "#f59e0b",
                                        fontWeight: 600,
                                    }}
                                >
                                    {r.status === "sent" ? "Отправлено" : "Черновик"}
                                </span>
                            </Flex>
                        </Panel>
                    ))
                )}
            </div>
        </div>
    );
}

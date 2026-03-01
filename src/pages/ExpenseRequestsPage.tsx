/**
 * HAULZ — Заявки на расходы.
 * Руководитель подразделения формирует заявки только по своему подразделению.
 * COGS/OPEX/CAPEX не указываются (задаются в справочнике категорий).
 */
import React, { useState, useCallback, useEffect } from "react";
import { Loader2, Plus, Paperclip, Send, Receipt, Car, User } from "lucide-react";
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
    status: "draft" | "sent";
    webhookSentAt?: string;
};

const MOCK_CATEGORIES = [
    { id: "fuel", name: "Топливо" },
    { id: "office", name: "Офис" },
    { id: "salary", name: "Зарплата" },
    { id: "other", name: "Прочее" },
];

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
    } catch {
        // ignore
    }
}

type Props = {
    auth: AuthData | null;
    /** Название подразделения руководителя (если есть в аккаунте). */
    departmentName?: string;
};

export function ExpenseRequestsPage({ auth, departmentName = "Моё подразделение" }: Props) {
    const [categoryId, setCategoryId] = useState("");
    const [amount, setAmount] = useState("");
    const [comment, setComment] = useState("");
    const [vehicleOrEmployee, setVehicleOrEmployee] = useState("");
    const [files, setFiles] = useState<{ name: string; dataUrl: string }[]>([]);
    const [sending, setSending] = useState(false);
    const [list, setList] = useState<ExpenseRequestItem[]>(() => loadStoredRequests(auth?.login ?? ""));

    useEffect(() => {
        setList(loadStoredRequests(auth?.login ?? ""));
    }, [auth?.login]);

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
            department: departmentName,
            categoryId: cat.id,
            categoryName: cat.name,
            amount: num,
            comment: comment.trim(),
            vehicleOrEmployee: vehicleOrEmployee.trim(),
            attachmentNames: files.map((f) => f.name),
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
        setVehicleOrEmployee("");
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
            } catch {
                // leave as draft
            } finally {
                setSending(false);
            }
        }
    }, [categoryId, amount, comment, vehicleOrEmployee, files, auth?.login, departmentName, list]);

    const canSubmit = categoryId && amount.trim() && parseFloat(amount.replace(",", ".")) > 0;

    return (
        <div className="w-full" style={{ padding: "1rem", paddingBottom: "5rem" }}>
            <Typography.Headline style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                Заявки на расходы
            </Typography.Headline>
            <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
                Подразделение: {departmentName}. Укажите статью расхода, сумму, комментарий и при необходимости приложите счёт или выберите транспорт/сотрудника.
            </Typography.Body>

            <Panel className="cargo-card" style={{ marginBottom: "1rem", background: "var(--color-bg-card)", borderRadius: "12px", padding: "1rem 1.25rem" }}>
                <Typography.Body style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.75rem" }}>Новая заявка</Typography.Body>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
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
                    <div>
                        <label style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", display: "block", marginBottom: "0.25rem" }}>
                            <Car className="w-3.5 h-3.5 inline-block mr-1" /> Транспорт / сотрудник (необязательно)
                        </label>
                        <Input
                            type="text"
                            placeholder="№ авто, ФИО сотрудника"
                            value={vehicleOrEmployee}
                            onChange={(e) => setVehicleOrEmployee(e.target.value)}
                            className="admin-form-input"
                            style={{ width: "100%" }}
                        />
                    </div>
                    <div>
                        <label style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", display: "block", marginBottom: "0.25rem" }}>
                            <Paperclip className="w-3.5 h-3.5 inline-block mr-1" /> Счета, документы
                        </label>
                        <input type="file" accept="image/*,.pdf" multiple onChange={addFile} style={{ fontSize: "0.8rem" }} />
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
                                            Транспорт/сотрудник: {r.vehicleOrEmployee}
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

import React from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button, Flex, Input, Panel, Typography } from "@maxhub/max-ui";
import type { Account } from "../../../types";
import { formatDisplayDate } from "../../../lib/dateUtils";
import { fetchAccountingExpenseAttachmentBlob } from "../../../api/client/profile/accounting";
import type { ProfileAccountingState } from "../hooks/useProfileAccounting";
import { CLAIM_STATUS_BADGE, CLAIM_STATUS_LABELS } from "../profileAccountingHelpers";

type Props = {
    activeAccount: Account | null;
    onBack: () => void;
    accounting: ProfileAccountingState;
};

export function ProfileAccountingSection({ activeAccount, onBack, accounting }: Props) {
    const {
        accountingRequestsItems,
        selectedAccountingRequest,
        setSelectedAccountingRequest,
        accountingRequestsLoading,
        accountingRequestsError,
        accountingSubsection,
        setAccountingSubsection,
        accountingClaimsItems,
        accountingClaimsLoading,
        accountingClaimsError,
        accountingClaimsView,
        setAccountingClaimsView,
        accountingClaimsSearch,
        setAccountingClaimsSearch,
        accountingClaimsStatusFilter,
        setAccountingClaimsStatusFilter,
        sverkiRequests,
        sverkiRequestsLoading,
        sverkiRequestsUpdatingId,
        fetchAccountingRequests,
        fetchSverkiRequests,
        markSverkiRequestAsSent,
        deleteSverkiRequest,
        reloadAccountingClaims,
        patchExpenseRequestStatus,
    } = accounting;

    const markAwaitingPayment = (itemId: string) => { void patchExpenseRequestStatus(itemId, "sent"); };
    const markPaid = (itemId: string) => { void patchExpenseRequestStatus(itemId, "paid"); };

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
                <Button className="filter-button" onClick={onBack} style={{ padding: '0.5rem' }}>
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <Typography.Headline className="text-page-title">Бухгалтерия</Typography.Headline>
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
                                        <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{r.createdAt ? formatDisplayDate(r.createdAt) : "—"}</td>
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
                                            <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{c?.createdAt ? formatDisplayDate(c.createdAt) : "—"}</td>
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
                                            <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{formatDisplayDate(r.createdAt)}</td>
                                            <td style={{ padding: "6px 8px" }}>{r.login || "—"}</td>
                                            <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{r.customerInn || "—"}</td>
                                            <td style={{ padding: "6px 8px" }}>{r.contract || "—"}</td>
                                            <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                                                {formatDisplayDate(r.periodFrom)} - {formatDisplayDate(r.periodTo)}
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
                            <div><span style={{ color: "var(--color-text-secondary)" }}>Создано:</span> {selectedAccountingRequest.createdAt ? formatDisplayDate(selectedAccountingRequest.createdAt) : "—"}</div>
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
                                                    const auth = { login: activeAccount.login, password: activeAccount.password };
                                                    try {
                                                        const blob = await fetchAccountingExpenseAttachmentBlob(auth, selectedAccountingRequest.id, att.id);
                                                        if (!blob) return;
                                                        const url = URL.createObjectURL(blob);
                                                        window.open(url, "_blank", "noopener");
                                                        setTimeout(() => URL.revokeObjectURL(url), 60000);
                                                    } catch { /* ignore */ }
                                                }}>Открыть</Button>
                                                <Button type="button" className="filter-button" style={{ fontSize: "0.72rem", padding: "0.2rem 0.5rem" }} onClick={async () => {
                                                    if (!activeAccount?.login || !activeAccount?.password) return;
                                                    const auth = { login: activeAccount.login, password: activeAccount.password };
                                                    try {
                                                        const blob = await fetchAccountingExpenseAttachmentBlob(auth, selectedAccountingRequest.id, att.id);
                                                        if (!blob) return;
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

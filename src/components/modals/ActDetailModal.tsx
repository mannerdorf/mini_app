import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { X, Download, Loader2 } from "lucide-react";
import { formatCurrency, formatInvoiceNumber, stripOoo, parseCargoNumbersFromText, transliterateFilename } from "../../lib/formatUtils";
import { DateText } from "../ui/DateText";
import { PROXY_API_DOWNLOAD_URL } from "../../constants/config";
import { DOCUMENT_METHODS } from "../../documentMethods";
import type { AuthData } from "../../types";

const DOC_BUTTONS = ["ЭР", "АПП", "СЧЕТ", "УПД"] as const;

type ActDetailModalProps = {
    item: any;
    isOpen: boolean;
    onClose: () => void;
    /** При клике по номеру счёта — открыть счёт (передать найденный объект счёта из списка) */
    onOpenInvoice?: (invoiceItem: any) => void;
    /** Список счетов для поиска по номеру (чтобы открыть счёт по клику) */
    invoices?: any[];
    /** При клике по номеру перевозки — открыть карточку перевозки */
    onOpenCargo?: (cargoNumber: string) => void;
    auth?: AuthData | null;
};

/** Нормализация номера для сравнения (0000-003544, 000279, 279 → 279) */
function normNum(s: string | undefined | null): string {
    const v = String(s ?? "").trim().replace(/^0000-/, "").replace(/^0+/, "") || "0";
    return v;
}

/** Проверка совпадения номеров счёта с учётом ведущих нулей и префикса 0000- */
function invoiceNumbersMatch(a: string | undefined | null, b: string | undefined | null): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    const na = normNum(a);
    const nb = normNum(b);
    if (na === nb) return true;
    // Дополнительно: сравнение как чисел (279 === 000279)
    const numA = parseInt(na, 10);
    const numB = parseInt(nb, 10);
    return !isNaN(numA) && !isNaN(numB) && numA === numB;
}

/** Первый номер перевозки из списка номенклатуры УПД */
function getFirstCargoNumberFromAct(item: any): string | null {
    const list: Array<{ Name?: string; Operation?: string }> = Array.isArray(item?.List) ? item.List : [];
    for (let i = 0; i < list.length; i++) {
        const text = String(list[i]?.Operation ?? list[i]?.Name ?? "").trim();
        if (!text) continue;
        const parts = parseCargoNumbersFromText(text);
        const cargo = parts.find((p) => p.type === "cargo");
        if (cargo?.value) return cargo.value;
    }
    return null;
}

export function ActDetailModal({ item, isOpen, onClose, onOpenInvoice, invoices = [], onOpenCargo, auth }: ActDetailModalProps) {
    const [downloading, setDownloading] = useState<string | null>(null);
    const [downloadError, setDownloadError] = useState<string | null>(null);

    if (!isOpen) return null;

    const num = item?.Number ?? item?.number ?? "—";
    const dateDoc = item?.DateDoc ?? item?.Date ?? item?.date ?? "";
    const sumDoc = item?.SumDoc ?? item?.Sum ?? item?.sum ?? 0;
    const invoiceNum = item?.Invoice ?? item?.invoice ?? item?.Счёт ?? "";
    const list: Array<{ Name?: string; Operation?: string; Quantity?: string | number; Price?: string | number; Sum?: string | number }> =
        Array.isArray(item?.List) ? item.List : [];
    const cargoNumber = getFirstCargoNumberFromAct(item);

    const getInvNum = (inv: any) => inv?.Number ?? inv?.number ?? inv?.Номер ?? inv?.N ?? "";
    const invoiceItem = invoiceNum && invoices.length > 0
        ? invoices.find((inv) => invoiceNumbersMatch(getInvNum(inv), invoiceNum))
        : null;

    const handleDownload = async (label: string) => {
        if (!cargoNumber || !auth?.login || !auth?.password) {
            setDownloadError(cargoNumber ? "Требуется авторизация" : "Номер перевозки не найден в УПД");
            return;
        }
        const metod = DOCUMENT_METHODS[label] ?? label;
        setDownloading(label);
        setDownloadError(null);
        try {
            const res = await fetch(PROXY_API_DOWNLOAD_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    login: auth.login,
                    password: auth.password,
                    metod,
                    number: cargoNumber,
                }),
            });
            if (!res.ok) {
                const msg = res.status === 404 ? "Документ не найден" : res.status >= 500 ? "Ошибка сервера" : "Не удалось получить документ";
                throw new Error(msg);
            }
            const data = await res.json();
            if (!data?.data || !data.name) throw new Error("Документ не найден");
            const byteCharacters = atob(data.data);
            const byteArray = new Uint8Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) byteArray[i] = byteCharacters.charCodeAt(i);
            const blob = new Blob([byteArray], { type: "application/pdf" });
            const fileName = transliterateFilename(data.name || `${label}_${cargoNumber}.pdf`);
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = fileName;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e: any) {
            setDownloadError(e?.message ?? "Ошибка загрузки");
        } finally {
            setDownloading(null);
        }
    };

    const renderServiceCell = (raw: string) => {
        const s = stripOoo(raw || "—");
        const parts = parseCargoNumbersFromText(s);
        return (
            <>
                {parts.map((p, k) =>
                    p.type === "cargo" ? (
                        <span
                            key={k}
                            role="button"
                            tabIndex={0}
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpenCargo?.(p.value); }}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenCargo?.(p.value); } }}
                            style={{ color: "var(--color-primary)", textDecoration: "underline", cursor: "pointer", fontWeight: 600 }}
                            title="Открыть карточку перевозки"
                        >{p.value}</span>
                    ) : (
                        <span key={k}>{p.value}</span>
                    )
                )}
            </>
        );
    };

    return createPortal(
        <div
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 9998,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(0,0,0,0.4)",
            }}
            onClick={onClose}
        >
            <Panel
                className="cargo-card"
                style={{
                    minWidth: "min(95vw, 900px)",
                    maxWidth: "95vw",
                    maxHeight: "90vh",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                    padding: "1rem",
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <Flex justify="space-between" align="center" style={{ marginBottom: "0.75rem", flexShrink: 0 }}>
                    <Typography.Headline style={{ fontSize: "1.1rem" }}>УПД {formatInvoiceNumber(String(num))}</Typography.Headline>
                    <Button className="filter-button" onClick={onClose} style={{ padding: "0.35rem" }}>
                        <X className="w-5 h-5" />
                    </Button>
                </Flex>

                <Flex wrap="wrap" gap="1rem" style={{ marginBottom: "1rem", flexShrink: 0 }}>
                    <Flex direction="column" gap="0.25rem">
                        <Typography.Label style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>Дата УПД</Typography.Label>
                        <DateText value={typeof dateDoc === "string" ? dateDoc : dateDoc ? String(dateDoc) : undefined} />
                    </Flex>
                    <Flex direction="column" gap="0.25rem">
                        <Typography.Label style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>Сумма</Typography.Label>
                        <Typography.Body style={{ fontWeight: 600 }}>{sumDoc != null ? formatCurrency(sumDoc) : "—"}</Typography.Body>
                    </Flex>
                    {invoiceNum && (
                        <Flex direction="column" gap="0.25rem">
                            <Typography.Label style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>Счёт</Typography.Label>
                            {invoiceItem != null && onOpenInvoice ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        onOpenInvoice(invoiceItem);
                                        onClose();
                                    }}
                                    style={{
                                        background: "none",
                                        border: "none",
                                        padding: 0,
                                        cursor: "pointer",
                                        color: "var(--color-primary-blue)",
                                        textDecoration: "underline",
                                        fontWeight: 600,
                                        fontSize: "inherit",
                                    }}
                                >
                                    {formatInvoiceNumber(String(invoiceNum))}
                                </button>
                            ) : (
                                <Typography.Body>{formatInvoiceNumber(String(invoiceNum))}</Typography.Body>
                            )}
                        </Flex>
                    )}
                </Flex>

                {auth && (
                    <Flex gap="0.5rem" wrap="wrap" style={{ marginBottom: "1rem", flexShrink: 0 }}>
                        {DOC_BUTTONS.map((label) => (
                            <Button
                                key={label}
                                className="filter-button"
                                size="small"
                                disabled={!cargoNumber || downloading !== null}
                                onClick={() => handleDownload(label)}
                                style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
                            >
                                {downloading === label ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                {label}
                            </Button>
                        ))}
                    </Flex>
                )}
                {downloadError && (
                    <Typography.Body style={{ color: "var(--color-error)", fontSize: "0.85rem", marginBottom: "0.5rem", flexShrink: 0 }}>{downloadError}</Typography.Body>
                )}

                {list.length > 0 ? (
                    <div
                        style={{
                            flex: 1,
                            minHeight: 0,
                            overflow: "auto",
                            border: "1px solid var(--color-border)",
                            borderRadius: "8px",
                        }}
                    >
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                            <thead>
                                <tr style={{ background: "var(--color-bg-hover)" }}>
                                    <th style={{ padding: "0.5rem 0.4rem", textAlign: "left", fontWeight: 600 }}>Услуга</th>
                                    <th style={{ padding: "0.5rem 0.4rem", textAlign: "right", fontWeight: 600 }}>Кол-во</th>
                                    <th style={{ padding: "0.5rem 0.4rem", textAlign: "right", fontWeight: 600 }}>Цена</th>
                                    <th style={{ padding: "0.5rem 0.4rem", textAlign: "right", fontWeight: 600 }}>Сумма</th>
                                </tr>
                            </thead>
                            <tbody>
                                {list.map((row, i) => (
                                    <tr key={i} style={{ borderBottom: "1px solid var(--color-border)" }}>
                                        <td style={{ padding: "0.5rem 0.4rem", maxWidth: 320 }} title={stripOoo(String(row.Operation ?? row.Name ?? ""))}>
                                            {renderServiceCell(String(row.Operation ?? row.Name ?? "—"))}
                                        </td>
                                        <td style={{ padding: "0.5rem 0.4rem", textAlign: "right" }}>{row.Quantity ?? "—"}</td>
                                        <td style={{ padding: "0.5rem 0.4rem", textAlign: "right" }}>{row.Price != null ? formatCurrency(row.Price) : "—"}</td>
                                        <td style={{ padding: "0.5rem 0.4rem", textAlign: "right" }}>{row.Sum != null ? formatCurrency(row.Sum) : "—"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Нет табличной части</Typography.Body>
                )}
            </Panel>
        </div>,
        document.body
    );
}

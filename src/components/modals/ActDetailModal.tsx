import React from "react";
import { createPortal } from "react-dom";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { X } from "lucide-react";
import { formatCurrency, formatInvoiceNumber, stripOoo } from "../../lib/formatUtils";
import { DateText } from "../ui/DateText";

type ActDetailModalProps = {
    item: any;
    isOpen: boolean;
    onClose: () => void;
    /** При клике по номеру счёта — открыть счёт (передать найденный объект счёта из списка) */
    onOpenInvoice?: (invoiceItem: any) => void;
    /** Список счетов для поиска по номеру (чтобы открыть счёт по клику) */
    invoices?: any[];
};

/** Нормализация номера для сравнения (0000-003544 и 3544) */
function normNum(s: string | undefined | null): string {
    const v = String(s ?? "").trim().replace(/^0000-/, "").replace(/^0+/, "") || "0";
    return v;
}

export function ActDetailModal({ item, isOpen, onClose, onOpenInvoice, invoices = [] }: ActDetailModalProps) {
    if (!isOpen) return null;

    const num = item?.Number ?? item?.number ?? "—";
    const dateDoc = item?.DateDoc ?? item?.Date ?? item?.date ?? "";
    const sumDoc = item?.SumDoc ?? item?.Sum ?? item?.sum ?? 0;
    const invoiceNum = item?.Invoice ?? item?.invoice ?? item?.Счёт ?? "";
    const list: Array<{ Name?: string; Operation?: string; Quantity?: string | number; Price?: string | number; Sum?: string | number }> =
        Array.isArray(item?.List) ? item.List : [];

    const invoiceItem = invoiceNum && invoices.length > 0
        ? invoices.find((inv) => normNum(inv.Number ?? inv.number ?? inv.Номер) === normNum(invoiceNum))
        : null;

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
                                            {stripOoo(String(row.Operation ?? row.Name ?? "—"))}
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

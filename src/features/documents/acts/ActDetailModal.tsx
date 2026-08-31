import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Flex, Typography } from "@maxhub/max-ui";
import { Download, Loader2 } from "lucide-react";
import { EntityDetailModalHeader } from "../../../components/modals/EntityDetailModalHeader";
import { formatCurrency, formatInvoiceNumber, stripOoo, parseCargoNumbersFromText, transliterateFilename } from "../../../lib/formatUtils";
import { DateText } from "../../../components/ui/DateText";
import { StatusBadge } from "../../../components/shared/StatusBadges";
import { RouteBadge } from "../../../components/shared/CargoTableDisplay";
import { PROXY_API_DOWNLOAD_URL } from "../../../constants/config";
import { getFirstCargoNumberFromInvoice, getCargoNumberFromInvoiceRow } from "../lib/documentsPipeline";
import { formatPerevozkaNumberForApi } from "../../../lib/perevozkaNumber";
import { getInvoiceEdoInfoByDocLabel } from "../../../lib/edoStatus";
import { EdoDocMiniBadge } from "../../../components/shared/EdoDocMiniBadge";
import { decodeBase64Payload } from "../../../utils";
import { buildDownloadRequestBody } from "../../../lib/downloadRequestBody";
import { saveBlobFile } from "../../../lib/saveBlobFile";
import type { AuthData } from "../../../types";

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
    cargoStateByNumber?: Map<string, string>;
    cargoRouteByNumber?: Map<string, string>;
    perevozkiLoading?: boolean;
};

/** Числовая часть номера без префикса и ведущих нулей (0000-000113, 000113, 113 → 113) */
function normNum(s: string | undefined | null): string {
    const v = String(s ?? "").trim().replace(/^0000-/, "").replace(/^0+/, "") || "0";
    return v;
}

/** Канонический формат номера счёта по маске 0000-XXXXXX (113 → 0000-000113) */
function toCanonicalInvoiceNum(s: string | undefined | null): string {
    const n = normNum(s);
    return "0000-" + n.padStart(6, "0");
}

/** Проверка совпадения номеров счёта: маска 0000-000113, учитываем все форматы */
function invoiceNumbersMatch(a: string | undefined | null, b: string | undefined | null): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    const sa = String(a).trim();
    const sb = String(b).trim();
    if (sa === sb) return true;
    if (normNum(sa) === normNum(sb)) return true;
    if (toCanonicalInvoiceNum(sa) === toCanonicalInvoiceNum(sb)) return true;
    const numA = parseInt(normNum(sa), 10);
    const numB = parseInt(normNum(sb), 10);
    return !isNaN(numA) && !isNaN(numB) && numA === numB;
}

function lookupNorm<T>(map: Map<string, T> | undefined, key: string): T | undefined {
    if (!map || !key) return undefined;
    const norm = (s: string) => String(s).replace(/^0+/, "") || s;
    return map.get(key) ?? map.get(norm(key));
}

export function ActDetailModal({
    item,
    isOpen,
    onClose,
    onOpenInvoice,
    invoices = [],
    onOpenCargo,
    auth,
    cargoStateByNumber,
    cargoRouteByNumber,
    perevozkiLoading,
}: ActDetailModalProps) {
    const [downloading, setDownloading] = useState<string | null>(null);
    const [downloadError, setDownloadError] = useState<string | null>(null);

    if (!isOpen) return null;

    const num = item?.Number ?? item?.number ?? "—";
    const dateDoc = item?.DateDoc ?? item?.Date ?? item?.date ?? "";
    const sumDoc = item?.SumDoc ?? item?.Sum ?? item?.sum ?? 0;
    const invoiceNum = item?.Invoice ?? item?.invoice ?? item?.Счёт ?? item?.Счет ?? item?.invoiceNumber ?? "";
    const list: Array<{ Name?: string; Operation?: string; Quantity?: string | number; Price?: string | number; Sum?: string | number }> =
        Array.isArray(item?.List) ? item.List : [];
    const cargoNumber = getFirstCargoNumberFromInvoice(item);

    const getInvNum = (inv: any) => String(inv?.Number ?? inv?.number ?? inv?.Номер ?? inv?.N ?? inv?.numberDoc ?? "").trim();
    const invoiceItem = invoiceNum && invoices.length > 0
        ? invoices.find((inv) => invoiceNumbersMatch(getInvNum(inv), invoiceNum))
        : null;

    /** ЭДО по кнопкам документов: из связанного счёта, иначе с УПД */
    const edoSource = invoiceItem ?? item;

    const handleDownload = async (label: string) => {
        if (!auth?.login || !auth?.password) {
            setDownloadError("Требуется авторизация");
            return;
        }
        if (!cargoNumber) {
            setDownloadError("Номер перевозки не найден в УПД");
            return;
        }
        const metod = DOCUMENT_METHODS[label] ?? label;
        const isInvoiceDoc = label === "СЧЕТ";
        setDownloading(label);
        setDownloadError(null);
        try {
            const res = await fetch(PROXY_API_DOWNLOAD_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(
                    buildDownloadRequestBody(auth, {
                        metod,
                        number: isInvoiceDoc ? cargoNumber : formatPerevozkaNumberForApi(cargoNumber),
                    }),
                ),
            });
            if (!res.ok) {
                let msg =
                    res.status === 404
                        ? "Документ не найден"
                        : res.status >= 500
                            ? "Ошибка сервера"
                            : "Не удалось получить документ";
                try {
                    const errData = await res.json();
                    if (errData?.message && res.status !== 404 && res.status < 500) {
                        msg = String(errData.message);
                    } else if (errData?.error && res.status !== 404 && res.status < 500) {
                        msg = String(errData.error);
                    }
                } catch {
                    /* ignore */
                }
                throw new Error(msg);
            }
            const data = await res.json();
            if (!data?.data || !data.name) throw new Error("Документ не найден");
            const byteArray = decodeBase64Payload(data.data);
            const blob = new Blob([byteArray], { type: "application/pdf" });
            const fileName = transliterateFilename(data.name || `${label}_${cargoNumber}.pdf`);
            await saveBlobFile(blob, fileName);
        } catch (e: any) {
            setDownloadError(e?.message ?? "Ошибка загрузки");
        } finally {
            setDownloading(null);
        }
    };

    const handleShare = () => {
        const lines = [
            `УПД: ${formatInvoiceNumber(String(num))}`,
            dateDoc && `Дата: ${typeof dateDoc === "string" ? dateDoc : String(dateDoc)}`,
            sumDoc != null && `Сумма: ${formatCurrency(sumDoc)}`,
            invoiceNum && `Счёт: ${formatInvoiceNumber(String(invoiceNum))}`,
        ].filter(Boolean);
        const text = lines.join("\n");
        if (typeof navigator !== "undefined" && (navigator as Navigator & { share?: (d: ShareData) => Promise<void> }).share) {
            void (navigator as Navigator & { share: (d: ShareData) => Promise<void> })
                .share({ title: `УПД ${formatInvoiceNumber(String(num))}`, text })
                .catch(() => {});
        } else {
            try {
                void navigator.clipboard?.writeText(text);
            } catch {
                /* ignore */
            }
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
        <div className="modal-overlay entity-detail-modal-overlay" onClick={onClose}>
            <div className="modal-content modal-content--entity-detail" onClick={(e) => e.stopPropagation()}>
                <EntityDetailModalHeader badge="Заказчик" onClose={onClose} onShare={handleShare} />

                <Typography.Headline className="entity-detail-modal-title">
                    УПД {formatInvoiceNumber(String(num))}
                </Typography.Headline>

                <Flex wrap="wrap" gap="1rem" className="entity-detail-modal-meta" style={{ marginBottom: "1rem" }}>
                    <Flex direction="column" gap="0.25rem">
                        <Typography.Label style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>Дата УПД</Typography.Label>
                        <DateText value={typeof dateDoc === "string" ? dateDoc : dateDoc ? String(dateDoc) : undefined} />
                    </Flex>
                    <Flex direction="column" gap="0.25rem">
                        <Typography.Label style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>Сумма</Typography.Label>
                        <Typography.Body style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>
                            {sumDoc != null ? formatCurrency(sumDoc) : "—"}
                        </Typography.Body>
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
                                <Typography.Body style={{ color: "var(--color-text-primary)" }}>
                                    {formatInvoiceNumber(String(invoiceNum))}
                                </Typography.Body>
                            )}
                        </Flex>
                    )}
                </Flex>

                {auth && (
                    <div className="document-buttons">
                        {DOC_BUTTONS.map((label) => {
                            const edo = getInvoiceEdoInfoByDocLabel(edoSource, label);
                            return (
                                <button
                                    key={label}
                                    type="button"
                                    className="filter-button edo-doc-download-btn doc-button"
                                    disabled={!cargoNumber || downloading !== null}
                                    onClick={() => void handleDownload(label)}
                                >
                                    {downloading === label ? (
                                        <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                                    ) : (
                                        <Download className="w-4 h-4" aria-hidden />
                                    )}
                                    {label}
                                    <EdoDocMiniBadge info={edo} />
                                </button>
                            );
                        })}
                    </div>
                )}
                {downloadError && (
                    <Typography.Body style={{ color: "var(--color-error)", fontSize: "0.85rem", marginBottom: "0.5rem" }}>
                        {downloadError}
                    </Typography.Body>
                )}

                {list.length > 0 ? (
                    <div className="entity-detail-modal-table-wrap">
                        <table className="invoice-detail-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem", color: "var(--color-text-primary)" }}>
                            <thead>
                                <tr style={{ background: "var(--color-bg-hover)" }}>
                                    <th style={{ padding: "0.5rem 0.4rem", textAlign: "left", fontWeight: 600, color: "var(--color-text-primary)" }}>Услуга</th>
                                    <th style={{ padding: "0.5rem 0.4rem", textAlign: "left", fontWeight: 600, color: "var(--color-text-primary)" }}>Статус перевозки</th>
                                    <th className="invoice-detail-table-route" style={{ padding: "0.5rem 0.4rem", textAlign: "left", fontWeight: 600, color: "var(--color-text-primary)" }}>Маршрут</th>
                                    <th style={{ padding: "0.5rem 0.4rem", textAlign: "right", fontWeight: 600, color: "var(--color-text-primary)" }}>Кол-во</th>
                                    <th style={{ padding: "0.5rem 0.4rem", textAlign: "right", fontWeight: 600, color: "var(--color-text-primary)" }}>Цена</th>
                                    <th style={{ padding: "0.5rem 0.4rem", textAlign: "right", fontWeight: 600, color: "var(--color-text-primary)" }}>Сумма</th>
                                </tr>
                            </thead>
                            <tbody>
                                {list.map((row, i) => {
                                    const cargoNum = getCargoNumberFromInvoiceRow(row);
                                    const deliveryState = cargoNum ? lookupNorm(cargoStateByNumber, cargoNum) : undefined;
                                    const route = cargoNum ? lookupNorm(cargoRouteByNumber, cargoNum) : undefined;
                                    return (
                                    <tr key={i} style={{ borderBottom: "1px solid var(--color-border)" }}>
                                        <td style={{ padding: "0.5rem 0.4rem", maxWidth: 220, color: "var(--color-text-primary)" }} title={stripOoo(String(row.Operation ?? row.Name ?? ""))}>
                                            {renderServiceCell(String(row.Operation ?? row.Name ?? "—"))}
                                        </td>
                                        <td style={{ padding: "0.5rem 0.4rem", color: "var(--color-text-primary)" }}>
                                            {perevozkiLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--color-text-secondary)" }} /> : <StatusBadge status={deliveryState} />}
                                        </td>
                                        <td className="invoice-detail-table-route" style={{ padding: "0.5rem 0.4rem", color: "var(--color-text-primary)" }}>
                                            {perevozkiLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--color-text-secondary)" }} /> : <RouteBadge route={route} />}
                                        </td>
                                        <td style={{ padding: "0.5rem 0.4rem", textAlign: "right", color: "var(--color-text-primary)" }}>{row.Quantity ?? "—"}</td>
                                        <td style={{ padding: "0.5rem 0.4rem", textAlign: "right", color: "var(--color-text-primary)" }}>{row.Price != null ? formatCurrency(row.Price) : "—"}</td>
                                        <td style={{ padding: "0.5rem 0.4rem", textAlign: "right", color: "var(--color-text-primary)" }}>{row.Sum != null ? formatCurrency(row.Sum) : "—"}</td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Нет табличной части</Typography.Body>
                )}
            </div>
        </div>,
        document.body,
    );
}

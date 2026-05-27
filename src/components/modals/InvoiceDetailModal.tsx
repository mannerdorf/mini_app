import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Flex, Typography } from "@maxhub/max-ui";
import { Download, Loader2 } from "lucide-react";
import { stripOoo, parseCargoNumbersFromText, formatInvoiceNumber, formatCurrency, transliterateFilename, normalizeInvoiceStatus } from "../../lib/formatUtils";
import { getPayTillDate, getPayTillDateColor } from "../../lib/dateUtils";
import { DateText } from "../ui/DateText";
import { StatusBadge } from "../shared/StatusBadges";
import { RouteBadge } from "../shared/CargoTableDisplay";
import { invoiceDocSum } from "../../../lib/invoiceAmounts.js";
import { PROXY_API_DOWNLOAD_URL } from "../../constants/config";
import { DOCUMENT_METHODS } from "../../documentMethods";
import { getInvoiceEdoInfoByDocLabel } from "../../lib/edoStatus";
import { EdoDocMiniBadge } from "../shared/EdoDocMiniBadge";
import { InvoicePaymentQrBlock } from "../invoices/InvoicePaymentQrBlock";
import { EntityDetailModalHeader } from "./EntityDetailModalHeader";
import type { AuthData } from "../../types";

const DOC_BUTTONS = ["ЭР", "АПП", "СЧЕТ", "УПД", "Реестр"] as const;

type InvoiceDetailModalProps = {
    item: any;
    isOpen: boolean;
    onClose: () => void;
    onOpenCargo?: (cargoNumber: string) => void;
    auth?: AuthData | null;
    cargoStateByNumber?: Map<string, string>;
    cargoRouteByNumber?: Map<string, string>;
    cargoSumPaidByNumber?: Map<string, number>;
    perevozkiLoading?: boolean;
    isFavorite?: boolean;
    onToggleFavorite?: () => void;
};

function getFirstCargoNumberFromInvoice(item: any): string | null {
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

function getCargoNumberFromRow(row: { Operation?: string; Name?: string }): string | null {
    const text = String(row?.Operation ?? row?.Name ?? "").trim();
    if (!text) return null;
    const parts = parseCargoNumbersFromText(text);
    const cargo = parts.find((p) => p.type === "cargo");
    return cargo?.value ?? null;
}

function lookupNorm<T>(map: Map<string, T> | undefined, key: string): T | undefined {
    if (!map || !key) return undefined;
    const norm = (s: string) => String(s).replace(/^0+/, "") || s;
    return map.get(key) ?? map.get(norm(key));
}

export function InvoiceDetailModal({
    item,
    isOpen,
    onClose,
    onOpenCargo,
    auth,
    cargoStateByNumber,
    cargoRouteByNumber,
    cargoSumPaidByNumber,
    perevozkiLoading,
    isFavorite,
    onToggleFavorite,
}: InvoiceDetailModalProps) {
    const [downloading, setDownloading] = useState<string | null>(null);
    const [downloadError, setDownloadError] = useState<string | null>(null);

    if (!isOpen) return null;
    const list: Array<{ Name?: string; Operation?: string; Quantity?: string | number; Price?: string | number; Sum?: string | number }> = Array.isArray(item?.List) ? item.List : [];
    const num = item?.Number ?? item?.number ?? "—";
    const dateDoc = item?.DateDoc ?? item?.Date ?? item?.date ?? item?.Дата ?? "";
    const payTill = getPayTillDate(typeof dateDoc === "string" ? dateDoc : dateDoc ? String(dateDoc) : undefined);
    const invoiceStatus = normalizeInvoiceStatus(item?.Status ?? item?.State ?? item?.state ?? item?.Статус ?? "");
    const isPaid = invoiceStatus === "Оплачен";
    const cargoNumber = getFirstCargoNumberFromInvoice(item);
    const invoiceNumber = (item?.Number ?? item?.number ?? "").toString().trim() || null;
    const cust = item?.Customer ?? item?.customer ?? item?.Контрагент ?? item?.Contractor ?? item?.Organization ?? "";
    const sum = invoiceDocSum(item ?? {});

    const formatDateDocForApi = (raw: unknown): string | null => {
        const s = String(raw ?? "").trim();
        if (!s) return null;
        const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T12:00:00`;
        const ruMatch = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
        if (ruMatch) return `${ruMatch[3]}-${ruMatch[2]}-${ruMatch[1]}T12:00:00`;
        const parsed = new Date(s);
        if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 19);
        return null;
    };

    const handleShare = () => {
        const lines = [
            `Счёт: ${formatInvoiceNumber(num)}`,
            cust && `Заказчик: ${stripOoo(String(cust))}`,
            sum != null && `Сумма: ${formatCurrency(sum)}`,
            dateDoc && `Дата: ${typeof dateDoc === "string" ? dateDoc : String(dateDoc)}`,
            payTill && `Оплата до: ${payTill}`,
        ].filter(Boolean);
        const text = lines.join("\n");
        if (typeof navigator !== "undefined" && (navigator as Navigator & { share?: (d: ShareData) => Promise<void> }).share) {
            void (navigator as Navigator & { share: (d: ShareData) => Promise<void> })
                .share({ title: `Счёт ${formatInvoiceNumber(num)}`, text })
                .catch(() => {});
        } else {
            try {
                void navigator.clipboard?.writeText(text);
            } catch {
                /* ignore */
            }
        }
    };

    const handleDownload = async (label: string) => {
        if (!auth?.login || !auth?.password) {
            setDownloadError("Требуется авторизация");
            return;
        }
        const metod = DOCUMENT_METHODS[label] ?? label;
        const isInvoiceDoc = label === "СЧЕТ";
        const isReestr = label === "Реестр";
        const numberToUse = isReestr
            ? invoiceNumber
            : cargoNumber ?? (isInvoiceDoc && invoiceNumber ? invoiceNumber : null);
        if (!numberToUse) {
            setDownloadError(
                isReestr
                    ? "Номер счёта не найден"
                    : "Номер перевозки не найден в счёте" + (isInvoiceDoc && invoiceNumber ? ". Для СЧЕТ можно использовать номер счёта." : ""),
            );
            return;
        }
        if (isReestr) {
            const dateDocFormatted = formatDateDocForApi(dateDoc);
            if (!dateDocFormatted) {
                setDownloadError("Дата счёта не найдена");
                return;
            }
        }
        setDownloading(label);
        setDownloadError(null);
        try {
            const body: Record<string, unknown> = {
                login: auth.login,
                password: auth.password,
                metod,
                number: numberToUse,
                ...(auth.isRegisteredUser ? { isRegisteredUser: true } : {}),
            };
            if (isReestr) {
                body.dateDoc = formatDateDocForApi(dateDoc);
            }
            const res = await fetch(PROXY_API_DOWNLOAD_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
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
            const byteCharacters = atob(data.data);
            const byteArray = new Uint8Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) byteArray[i] = byteCharacters.charCodeAt(i);
            const blob = new Blob([byteArray], { type: "application/pdf" });
            const fileName = transliterateFilename(data.name || `${label}_${numberToUse}.pdf`);
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
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
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onOpenCargo?.(p.value);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    onOpenCargo?.(p.value);
                                }
                            }}
                            style={{
                                color: "var(--color-primary)",
                                textDecoration: "underline",
                                cursor: "pointer",
                                fontWeight: 600,
                            }}
                            title="Открыть карточку перевозки"
                        >
                            {p.value}
                        </span>
                    ) : (
                        <span key={k}>{p.value}</span>
                    ),
                )}
            </>
        );
    };

    return createPortal(
        <div className="modal-overlay entity-detail-modal-overlay" onClick={onClose}>
            <div className="modal-content modal-content--entity-detail" onClick={(e) => e.stopPropagation()}>
                <EntityDetailModalHeader
                    badge="Заказчик"
                    onClose={onClose}
                    onShare={handleShare}
                    isFavorite={isFavorite}
                    onToggleFavorite={onToggleFavorite}
                />

                <Typography.Headline className="entity-detail-modal-title">
                    Счёт {formatInvoiceNumber(num)}
                </Typography.Headline>

                {payTill && (
                    <Flex
                        align="center"
                        gap="0.35rem"
                        className="entity-detail-modal-pay-till"
                        style={{ color: getPayTillDateColor(payTill, isPaid) ?? "var(--color-text-secondary)" }}
                    >
                        <Typography.Label>Оплата до:</Typography.Label>
                        <DateText value={payTill} />
                    </Flex>
                )}

                {auth && (
                    <div className="document-buttons">
                        {DOC_BUTTONS.map((label) => {
                            const isReestr = label === "Реестр";
                            const canDownload = isReestr
                                ? !!(invoiceNumber && formatDateDocForApi(dateDoc))
                                : !!cargoNumber;
                            const edo = getInvoiceEdoInfoByDocLabel(item, label);
                            return (
                                <button
                                    key={label}
                                    type="button"
                                    className="filter-button edo-doc-download-btn doc-button"
                                    disabled={!canDownload || downloading !== null}
                                    onClick={() => void handleDownload(label)}
                                >
                                    {downloading === label ? (
                                        <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                                    ) : (
                                        <Download className="w-4 h-4" aria-hidden />
                                    )}
                                    {label}
                                    {!isReestr && <EdoDocMiniBadge info={edo} />}
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
                {auth && !isPaid && (
                    <InvoicePaymentQrBlock invoice={item} auth={auth} cargoSumPaidByNumber={cargoSumPaidByNumber} />
                )}
                {list.length > 0 ? (
                    <div className="entity-detail-modal-table-wrap">
                        <table className="invoice-detail-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                            <thead>
                                <tr style={{ background: "var(--color-bg-hover)" }}>
                                    <th style={{ padding: "0.5rem 0.4rem", textAlign: "left", fontWeight: 600 }}>Услуга</th>
                                    <th style={{ padding: "0.5rem 0.4rem", textAlign: "left", fontWeight: 600 }}>Статус перевозки</th>
                                    <th className="invoice-detail-table-route" style={{ padding: "0.5rem 0.4rem", textAlign: "left", fontWeight: 600 }}>
                                        Маршрут
                                    </th>
                                    <th style={{ padding: "0.5rem 0.4rem", textAlign: "right", fontWeight: 600 }}>Кол-во</th>
                                    <th style={{ padding: "0.5rem 0.4rem", textAlign: "right", fontWeight: 600 }}>Цена</th>
                                    <th style={{ padding: "0.5rem 0.4rem", textAlign: "right", fontWeight: 600 }}>Сумма</th>
                                </tr>
                            </thead>
                            <tbody>
                                {list.map((row, i) => {
                                    const cargoNum = getCargoNumberFromRow(row);
                                    const deliveryState = cargoNum ? lookupNorm(cargoStateByNumber, cargoNum) : undefined;
                                    const route = cargoNum ? lookupNorm(cargoRouteByNumber, cargoNum) : undefined;
                                    return (
                                        <tr key={i} style={{ borderBottom: "1px solid var(--color-border)" }}>
                                            <td style={{ padding: "0.5rem 0.4rem", maxWidth: 220 }} title={stripOoo(String(row.Operation ?? row.Name ?? ""))}>
                                                {renderServiceCell(String(row.Operation ?? row.Name ?? "—"))}
                                            </td>
                                            <td style={{ padding: "0.5rem 0.4rem" }}>
                                                {perevozkiLoading ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--color-text-secondary)" }} />
                                                ) : (
                                                    <StatusBadge status={deliveryState} />
                                                )}
                                            </td>
                                            <td className="invoice-detail-table-route" style={{ padding: "0.5rem 0.4rem" }}>
                                                {perevozkiLoading ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--color-text-secondary)" }} />
                                                ) : (
                                                    <RouteBadge route={route} />
                                                )}
                                            </td>
                                            <td style={{ padding: "0.5rem 0.4rem", textAlign: "right" }}>{row.Quantity ?? "—"}</td>
                                            <td style={{ padding: "0.5rem 0.4rem", textAlign: "right" }}>
                                                {row.Price != null ? formatCurrency(row.Price) : "—"}
                                            </td>
                                            <td style={{ padding: "0.5rem 0.4rem", textAlign: "right" }}>
                                                {row.Sum != null ? formatCurrency(row.Sum) : "—"}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Нет номенклатуры</Typography.Body>
                )}
            </div>
        </div>,
        document.body,
    );
}

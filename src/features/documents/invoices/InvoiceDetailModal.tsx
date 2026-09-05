import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Flex, Typography } from "@maxhub/max-ui";
import { Download, Loader2 } from "lucide-react";
import { stripOoo, parseCargoNumbersFromText, formatInvoiceNumber, formatCurrency, normalizeInvoiceStatus } from "../../../lib/formatUtils";
import { getPayTillDate, getPayTillDateColor } from "../../../lib/dateUtils";
import { DateText } from "../../../components/ui/DateText";
import { DocumentDetailLineCards } from "../components/DocumentDetailLineCards";
import { invoiceDocSum } from "../../../../lib/invoiceAmounts.js";
import { DOCUMENT_METHODS } from "../../../documentMethods";
import { getFirstCargoNumberFromInvoice } from "../lib/documentsPipeline";
import { formatPerevozkaNumberForApi } from "../../../lib/perevozkaNumber";
import { getInvoiceEdoInfoByDocLabel } from "../../../lib/edoStatus";
import { EdoDocMiniBadge } from "../../../components/shared/EdoDocMiniBadge";
import { InvoicePaymentQrBlock } from "./InvoicePaymentQrBlock";
import { EntityDetailModalHeader } from "../../../components/modals/EntityDetailModalHeader";
import { downloadDocumentDirect, formatDateDocForDownloadApi } from "../../../lib/downloadDocumentDirect";
import type { AuthData } from "../../../types";

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
        const dateDocFormatted = isReestr ? formatDateDocForDownloadApi(dateDoc) : null;
        if (isReestr && !dateDocFormatted) {
            setDownloadError("Дата счёта не найдена");
            return;
        }
        setDownloading(label);
        setDownloadError(null);
        try {
            const apiNumber = isReestr
                ? String(numberToUse).trim()
                : isInvoiceDoc && !cargoNumber && invoiceNumber
                  ? String(invoiceNumber).trim()
                  : formatPerevozkaNumberForApi(numberToUse);
            await downloadDocumentDirect(auth, {
                metod,
                number: apiNumber,
                ...(dateDocFormatted ? { dateDoc: dateDocFormatted } : {}),
            });
        } catch (e: unknown) {
            setDownloadError((e as Error)?.message ?? "Ошибка загрузки");
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
                            const isInvoiceDoc = label === "СЧЕТ";
                            const canDownload = isReestr
                                ? !!(invoiceNumber && formatDateDocForDownloadApi(dateDoc))
                                : isInvoiceDoc
                                  ? !!(cargoNumber || invoiceNumber)
                                  : !!cargoNumber;
                            const edo = getInvoiceEdoInfoByDocLabel(item, label);
                            return (
                                <button
                                    key={label}
                                    type="button"
                                    className="filter-button edo-doc-download-btn doc-button"
                                    disabled={!canDownload || downloading !== null}
                                    onClick={() => void handleDownload(label)}
                                    title="Скачать"
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
                    <DocumentDetailLineCards
                        rows={list}
                        perevozkiLoading={perevozkiLoading}
                        cargoStateByNumber={cargoStateByNumber}
                        cargoRouteByNumber={cargoRouteByNumber}
                        renderServiceCell={renderServiceCell}
                    />
                ) : (
                    <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Нет номенклатуры</Typography.Body>
                )}
            </div>
        </div>,
        document.body,
    );
}

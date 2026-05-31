import React, { useState, useEffect } from "react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import { Loader2, X, Truck, Ship, Heart, Share2, Layers, Scale, Weight, List, Download, Info, ClipboardList } from "lucide-react";
import { fetchPerevozkaDetails } from "../../lib/perevozkaDetails";
import { ShipmentStatusPanel } from "../ShipmentStatusScreen";
import { getWebApp, isMaxWebApp } from "../../webApp";
import { DOCUMENT_METHODS } from "../../documentMethods";
import { PROXY_API_DOWNLOAD_URL } from "../../constants/config";
import { PLANNED_TERMINAL_ARRIVAL_LABEL } from "../../constants/plannedArrivalLabels";
import { formatCurrency, stripOoo, cityToCode, transliterateFilename, formatInvoiceNumber } from "../../lib/formatUtils";
import { formatPerevozkaNumberForApi } from "../../lib/perevozkaNumber";
import { normalizeStatus, getFilterKeyByStatus, getSumColorByPaymentStatus } from "../../lib/statusUtils";
import { formatDate } from "../../lib/dateUtils";
import { getPlanDays, getCargoDisplayRoleLabel, getCargoRoleSet, cargoLastMileIsSelfPickup } from "../../lib/cargoUtils";
import { CargoPickupLogisticsBadge } from "../shared/CargoTableDisplay";
import { ClickableActNumber, ClickableInvoiceNumber } from "../ui/EntityLinks";
import { DetailItem } from "../ui/DetailItem";
import { DateText } from "../ui/DateText";
import { StatusBillBadge } from "../shared/StatusBadges";
import type { AuthData, CargoItem, PerevozkaTimelineStep } from "../../types";

export type CargoDetailsModalProps = {
    item: CargoItem;
    isOpen: boolean;
    onClose: () => void;
    auth: AuthData;
    onOpenChat: (cargoNumber?: string) => void | Promise<void>;
    onCreateClaim?: (cargoNumber: string) => void;
    isFavorite: (cargoNumber: string | undefined) => boolean;
    onToggleFavorite: (cargoNumber: string | undefined) => void;
    showSums?: boolean;
    useServiceRequest?: boolean;
    onOpenInvoice?: (invoice: Record<string, unknown>) => void;
    onOpenAct?: (act: Record<string, unknown>) => void;
};

export function CargoDetailsModal({
    item,
    isOpen,
    onClose,
    auth,
    onOpenChat,
    onCreateClaim,
    isFavorite,
    onToggleFavorite,
    showSums = true,
    useServiceRequest = false,
    onOpenInvoice,
    onOpenAct,
}: CargoDetailsModalProps) {
    const [downloading, setDownloading] = useState<string | null>(null);
    const [downloadError, setDownloadError] = useState<string | null>(null);
    const [pdfViewer, setPdfViewer] = useState<{ url: string; name: string; docType: string; blob?: Blob; downloadFileName?: string } | null>(null);
    const [perevozkaTimeline, setPerevozkaTimeline] = useState<PerevozkaTimelineStep[] | null>(null);
    const [perevozkaNomenclature, setPerevozkaNomenclature] = useState<Record<string, unknown>[]>([]);
    const [perevozkaMeta, setPerevozkaMeta] = useState<{ autoReg: string; autoType: string; driver: string }>({ autoReg: '', autoType: '', driver: '' });
    const [nomenclatureOpen, setNomenclatureOpen] = useState(false);
    const [perevozkaLoading, setPerevozkaLoading] = useState(false);
    const [perevozkaError, setPerevozkaError] = useState<string | null>(null);
    const [perevozkaFetched, setPerevozkaFetched] = useState(false);

    useEffect(() => {
        if (!isOpen || !item?.Number || !auth?.login || !auth?.password) {
            setPerevozkaTimeline(null);
            setPerevozkaNomenclature([]);
            setPerevozkaMeta({ autoReg: '', autoType: '', driver: '' });
            setPerevozkaError(null);
            setPerevozkaLoading(false);
            setPerevozkaFetched(false);
            return;
        }
        let cancelled = false;
        setPerevozkaLoading(true);
        setPerevozkaError(null);
        setPerevozkaFetched(false);
        fetchPerevozkaDetails(auth, item.Number, item)
            .then(({ steps, nomenclature, meta }) => {
                if (!cancelled) {
                    setPerevozkaTimeline(steps);
                    setPerevozkaNomenclature(nomenclature || []);
                    setPerevozkaMeta(meta || { autoReg: '', autoType: '', driver: '' });
                }
            })
            .catch((e: any) => {
                if (!cancelled) setPerevozkaError(e?.message || 'Не удалось загрузить статусы');
            })
            .finally(() => {
                if (!cancelled) {
                    setPerevozkaLoading(false);
                    setPerevozkaFetched(true);
                }
            });
        return () => { cancelled = true; };
    }, [isOpen, item?.Number, auth?.login, auth?.password]);

    useEffect(() => {
        if (isOpen) setNomenclatureOpen(false);
    }, [isOpen, item?.Number]);

    useEffect(() => {
        if (!isOpen && pdfViewer) {
            URL.revokeObjectURL(pdfViewer.url);
            setPdfViewer(null);
        }
    }, [isOpen, pdfViewer]);

    useEffect(() => {
        if (isOpen) {
            const webApp = getWebApp();
            if (webApp && typeof webApp.expand === "function" && isMaxWebApp()) {
                webApp.expand();
            }
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const renderValue = (val: any, unit = '') => {
        if (val === undefined || val === null || (typeof val === 'string' && val.trim() === "")) return '-';
        if (typeof val === 'object' && val !== null && !React.isValidElement(val)) {
            try {
                if (Object.keys(val).length === 0) return '-';
                return <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '0.75rem', margin: 0 }}>{JSON.stringify(val, null, 2)}</pre>;
            } catch (e) {
                return String(val);
            }
        }
        const num = typeof val === 'string' ? parseFloat(val) : val;
        if (typeof num === 'number' && !isNaN(num)) {
            if (unit.toLowerCase() === 'кг' || unit.toLowerCase() === 'м³') {
                return `${num.toFixed(2)}${unit ? ' ' + unit : ''}`;
            }
        }
        return `${val}${unit ? ' ' + unit : ''}`;
    };

    const fromCity = cityToCode(item.CitySender) || '—';
    const toCity = cityToCode(item.CityReceiver) || '—';
    const receivedAtSender = perevozkaTimeline?.find(s => s.label === `Получена в ${fromCity}`);
    const deliveredStep = perevozkaTimeline?.find(s => s.label === 'Доставлена');
    const slaPlanEndMs = receivedAtSender?.date
        ? new Date(receivedAtSender.date).getTime() + getPlanDays(item) * 24 * 60 * 60 * 1000
        : null;
    const isTimelineStepOutOfSla = (stepDate?: string) => {
        if (!slaPlanEndMs || !stepDate) return false;
        const stepMs = new Date(stepDate).getTime();
        if (!Number.isFinite(stepMs)) return false;
        return stepMs > slaPlanEndMs;
    };
    const slaFromTimeline = (receivedAtSender?.date && deliveredStep?.date)
        ? (() => {
            const startMs = new Date(receivedAtSender.date).getTime();
            const endMs = new Date(deliveredStep.date).getTime();
            const actualDays = Math.round((endMs - startMs) / (24 * 60 * 60 * 1000));
            const planDays = getPlanDays(item);
            return { planDays, actualDays, onTime: actualDays <= planDays, delayDays: Math.max(0, actualDays - planDays) };
        })()
        : null;
    const normalizePlannedDeliveryDate = (value: unknown): string | undefined => {
        const raw = String(value ?? '').trim();
        if (!raw) return undefined;
        // Some backends return sentinel dates for "not set".
        if (/^0?1[./-]0?1[./-](1900|1901|0001)$/.test(raw)) return undefined;
        const parsed = new Date(raw);
        if (Number.isFinite(parsed.getTime()) && parsed.getFullYear() <= 1901) return undefined;
        return raw;
    };
    const plannedDeliveryDate = normalizePlannedDeliveryDate((item as any).DateArrival);

    const downloadFile = (blob: Blob, fileName: string) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleDownload = async (docType: string) => {
        if (!item.Number) return alert("Нет номера перевозки");
        const metod = DOCUMENT_METHODS[docType] ?? docType;
        setDownloading(docType);
        setDownloadError(null);
        try {
            const res = await fetch(PROXY_API_DOWNLOAD_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    login: auth.login,
                    password: auth.password,
                    metod,
                    number: formatPerevozkaNumberForApi(item.Number),
                    ...(auth.isRegisteredUser ? { isRegisteredUser: true } : {}),
                }),
            });
            if (!res.ok) {
                let message =
                    res.status === 404
                        ? "Документ не обнаружен"
                        : res.status >= 500
                            ? "Ошибка сервера. Попробуйте позже"
                            : "Не удалось получить документ";
                try {
                    const errData = await res.json();
                    if (errData?.message && res.status !== 404 && res.status < 500) {
                        message = String(errData.message);
                    }
                } catch {
                    // ignore
                }
                throw new Error(message);
            }
            const data = await res.json();
            if (!data?.data || !data.name) {
                throw new Error("Документ не обнаружен");
            }
            const byteCharacters = atob(data.data);
            const byteNumbers = new Array(byteCharacters.length).fill(0).map((_, i) => byteCharacters.charCodeAt(i));
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: "application/pdf" });
            const fileName = data.name || `${docType}_${item.Number}.pdf`;
            const fileNameTranslit = transliterateFilename(fileName);
            const url = URL.createObjectURL(blob);
            setPdfViewer({
                url,
                name: fileNameTranslit,
                docType,
                blob,
                downloadFileName: fileNameTranslit,
            });
            setTimeout(() => {
                downloadFile(blob, fileNameTranslit);
            }, 350);
        } catch (e: any) {
            setDownloadError(e.message);
        } finally {
            setDownloading(null);
        }
    };

    const EXCLUDED_KEYS = ['Number', 'DatePrih', 'DateVr', 'State', 'Mest', 'PW', 'W', 'Value', 'Sum', 'Sum_paid', 'SumPaid', 'sum_paid', 'sumPaid', 'StateBill', 'Sender', 'Customer', 'Receiver', 'AK', 'DateDoc', 'OG', 'TypeOfTranzit', 'TypeOfTransit', 'INN', 'Inn', 'inn', 'SenderINN', 'ReceiverINN', 'PZV_Sender', 'PZV_Receiver', 'PZV_Sender_Id', 'PZV_Receiver_Id', '_role', '_roles', 'Driver', 'DriverTel', 'AutoType', 'AutoReg', 'DateArrival', 'Order', 'LMAutoReg', 'LMAutoType', 'LMDriver', 'LMDriverTel', 'CitySender', 'CityReceiver', 'UPD', 'upd', 'BillNum', 'Bill_Number', 'billnum', 'bill_number', 'Success', 'success', 'Statuses', 'statuses', 'error', 'request_id'];
    const parseAmount = (val: unknown): number => {
        if (val === undefined || val === null || (typeof val === 'string' && val.trim() === '')) return 0;
        const num = typeof val === 'string' ? parseFloat(val.replace(',', '.')) : Number(val);
        return Number.isFinite(num) ? num : 0;
    };
    const cargoSum = parseAmount(item.Sum);
    const cargoSumPaid = parseAmount((item as any).Sum_paid ?? (item as any).SumPaid ?? (item as any).sum_paid ?? (item as any).sumPaid);
    const cargoBalance = cargoSum - cargoSumPaid;
    const isCustomerRole = getCargoRoleSet(item).has("Customer");
    const roleLabel = getCargoDisplayRoleLabel(item);
    const selfPickup = cargoLastMileIsSelfPickup(item);
    const FIELD_LABELS: Record<string, string> = {
        CitySender: 'Место отправления',
        CityReceiver: 'Место получения',
        Order: 'Номер заявки заказчика',
        UPD: 'УПД',
        BillNum: 'Счет',
        Bill_Number: 'Счет',
    };
    const plateWithoutRegion = (raw: string) => {
        const s = raw.trim();
        if (!s) return '';
        const slash = s.indexOf('/');
        return slash >= 0 ? s.slice(0, slash).trim() : s;
    };
    const lastMile = {
        autoReg: plateWithoutRegion(String((item as any).LMAutoReg ?? '')),
        autoType: String((item as any).LMAutoType ?? '').trim(),
        driver: String((item as any).LMDriver ?? '').trim(),
        driverTel: String((item as any).LMDriverTel ?? (item as any).DriverTel ?? '').trim(),
    };
    const hasLastMileBlock = Boolean(lastMile.autoReg || lastMile.autoType || lastMile.driver || lastMile.driverTel);

    let updRaw: string | null = null;
    let billRaw: string | null = null;
    for (const [key, val] of Object.entries(item)) {
        if (val === undefined || val === null || (typeof val === "string" && val.trim() === "")) continue;
        const lk = key.toLowerCase();
        if (lk === "upd" && !updRaw) updRaw = String(val).trim();
        if ((lk === "billnum" || lk === "bill_number") && !billRaw) billRaw = String(val).trim();
    }
    const billDisplay = billRaw ? formatInvoiceNumber(billRaw) : null;
    const updDisplay = updRaw ? formatInvoiceNumber(updRaw) : null;
    const cargoNumberDisplay = item.Number ? formatInvoiceNumber(String(item.Number)) : null;
    const citySenderDisplay = cityToCode(item.CitySender) || null;
    const cityReceiverDisplay = cityToCode(item.CityReceiver) || null;
    const customerDisplay =
        stripOoo(
            String(
                item.Customer ??
                    (item as any).customer ??
                    (item as any).Заказчик ??
                    (item as any).Contractor ??
                    (item as any).Organization ??
                    "",
            ).trim(),
        ) || null;

    const deliveryValue = (() => {
        const status = normalizeStatus(item.State);
        const lower = status.toLowerCase();
        if (lower.includes("доставлен") || lower.includes("заверш")) {
            return <DateText value={item.DateVr} />;
        }
        return "-";
    })();

    return (
        <div className="modal-overlay modal-overlay--cargo-details" onClick={onClose}>
            <div className="modal-content modal-content--cargo-details" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <div className="modal-header-main">
                        {(() => {
                            const isFerry = item?.AK === true || item?.AK === 'true' || item?.AK === '1' || item?.AK === 1;
                            return isFerry ? <Ship className="modal-header-transport-icon" style={{ color: 'var(--color-primary-blue)', width: 24, height: 24, flexShrink: 0 }} title="Паром" /> : <Truck className="modal-header-transport-icon" style={{ color: 'var(--color-primary-blue)', width: 24, height: 24, flexShrink: 0 }} title="Авто" />;
                        })()}
                        {roleLabel && (
                            <span className="role-badge modal-header-role-badge">
                                {roleLabel}
                            </span>
                        )}
                    </div>
                    <div className="modal-header-actions">
                            <button
                                type="button"
                                className="modal-header-icon-btn"
                                onClick={async () => {
                                    if (!item.Number) return;
                                    setDownloading("share");
                                    try {
                                        const lines: string[] = [];
                                        lines.push(`Консолидация: ${item.Number}`);
                                        if (item.State) lines.push(`Статус: ${normalizeStatus(item.State)}`);
                                        if (item.DatePrih) lines.push(`Поступление: ${formatDate(item.DatePrih)}`);
                                        lines.push(`Доставка: ${getFilterKeyByStatus(item.State) === 'delivered' && item.DateVr ? formatDate(item.DateVr) : '-'}`);
                                        if (item.Sender) lines.push(`Отправитель: ${stripOoo(item.Sender)}`);
                                        if (item.Customer) lines.push(`Заказчик: ${stripOoo(item.Customer)}`);
                                        if (item.Receiver ?? (item as any).receiver) lines.push(`Получатель: ${stripOoo(item.Receiver ?? (item as any).receiver)}`);
                                        lines.push(`Тип перевозки: ${item?.AK === true || item?.AK === 'true' || item?.AK === '1' || item?.AK === 1 ? 'Паром' : 'Авто'}`);
                                        const fromC = cityToCode(item.CitySender);
                                        const toC = cityToCode(item.CityReceiver);
                                        lines.push(`Место отправления: ${fromC || '-'}`);
                                        lines.push(`Место получения: ${toC || '-'}`);
                                        if (item.Mest !== undefined) lines.push(`Мест: ${item.Mest}`);
                                        if (isCustomerRole) {
                                            if (item.PW !== undefined) lines.push(`Плат. вес: ${item.PW} кг`);
                                            if (item.Sum !== undefined) lines.push(`Стоимость: ${formatCurrency(item.Sum as any)}`);
                                            lines.push(`Оплачено: ${formatCurrency(cargoSumPaid)}`);
                                            lines.push(`Остаток: ${formatCurrency(cargoBalance)}`);
                                            if (item.StateBill) lines.push(`Статус счета: ${item.StateBill}`);
                                        }
                                        const text = lines.join("\n");
                                        if (typeof navigator !== "undefined" && (navigator as any).share) {
                                            await (navigator as any).share({ title: `HAULZ — перевозка ${item.Number}`, text });
                                        } else if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
                                            await navigator.clipboard.writeText(text);
                                            alert("Информация скопирована в буфер обмена");
                                        } else {
                                            alert(text);
                                        }
                                    } catch (e: any) {
                                        console.error("Share error:", e);
                                        alert("Ошибка при попытке поделиться");
                                    } finally {
                                        setDownloading(null);
                                    }
                                }}
                                title="Поделиться"
                            >
                                {downloading === "share" ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--color-text-secondary)' }} /> : <Share2 className="w-4 h-4" style={{ color: 'var(--color-text-secondary)' }} />}
                            </button>
                            <button
                                type="button"
                                className="modal-header-icon-btn"
                                onClick={() => {
                                    const cargoNumber = String(item?.Number || '').trim();
                                    if (!cargoNumber) return;
                                    onCreateClaim?.(cargoNumber);
                                }}
                                title="Создать претензию"
                            >
                                <ClipboardList className="w-4 h-4" style={{ color: 'var(--color-text-secondary)' }} />
                            </button>
                            <button
                                type="button"
                                className="modal-header-icon-btn"
                                onClick={() => onToggleFavorite(item.Number)}
                                title={isFavorite(item.Number) ? "Удалить из избранного" : "Добавить в избранное"}
                            >
                                <Heart className="w-4 h-4" style={{ fill: isFavorite(item.Number) ? '#ef4444' : 'transparent', color: isFavorite(item.Number) ? '#ef4444' : 'var(--color-text-secondary)', transition: 'all 0.2s' }} />
                            </button>
                            <button type="button" className="modal-header-icon-btn" onClick={onClose} aria-label="Закрыть" title="Закрыть">
                                <X size={20} style={{ color: 'var(--color-text-secondary)' }} />
                            </button>
                    </div>
                </div>

                <div className="cargo-details-doc-line">
                    {cargoNumberDisplay ? (
                        <span className="cargo-details-doc-line__cargo">{cargoNumberDisplay}</span>
                    ) : (
                        <span className="cargo-details-doc-line__cargo">—</span>
                    )}
                    {billDisplay ? (
                        <>
                            <span className="cargo-details-doc-line__sep" aria-hidden>
                                ·
                            </span>
                            <span className="cargo-details-doc-line__pair">
                                <span className="cargo-modal-label">Счёт</span>{" "}
                                <ClickableInvoiceNumber
                                    number={billRaw}
                                    invoice={billRaw ? { Number: billRaw } : null}
                                    onOpen={onOpenInvoice}
                                    className="cargo-details-doc-line__link"
                                />
                            </span>
                        </>
                    ) : null}
                    {updDisplay ? (
                        <>
                            <span className="cargo-details-doc-line__sep" aria-hidden>
                                ·
                            </span>
                            <span className="cargo-details-doc-line__pair">
                                <span className="cargo-modal-label">УПД</span>{" "}
                                <ClickableActNumber
                                    number={updRaw}
                                    act={updRaw ? { Number: updRaw } : null}
                                    onOpen={onOpenAct}
                                    className="cargo-details-doc-line__link"
                                />
                            </span>
                        </>
                    ) : null}
                </div>

                {(citySenderDisplay || cityReceiverDisplay) && (
                    <div className="cargo-details-route-chip" aria-label={`Маршрут ${toCity} — ${fromCity}`}>
                        <span className="cargo-details-route-chip__city">{cityReceiverDisplay || "—"}</span>
                        <span className="cargo-details-route-chip__track" aria-hidden />
                        <span className="cargo-details-route-chip__city">{citySenderDisplay || "—"}</span>
                    </div>
                )}

                {useServiceRequest && customerDisplay && (
                    <div className="cargo-details-customer-chip" aria-label={`Заказчик ${customerDisplay}`}>
                        <span className="cargo-details-customer-chip__label">Заказчик</span>
                        <span className="cargo-details-customer-chip__value">{customerDisplay}</span>
                    </div>
                )}

                <div className="cargo-details-modal-main">
                    <div className="cargo-details-modal-rows">
                        <div className="cargo-details-tiles-row">
                            <DetailItem label="Номер заявки заказчика" value={String((item as any).Order ?? "").trim() || "-"} />
                            <DetailItem label="Поступление" value={<DateText value={item.DatePrih} />} />
                            <DetailItem label="Доставка" value={deliveryValue} />
                            <DetailItem
                                label={PLANNED_TERMINAL_ARRIVAL_LABEL}
                                value={plannedDeliveryDate ? <DateText value={plannedDeliveryDate} /> : "-"}
                            />
                        </div>
                        <div className="cargo-details-tiles-row">
                            <DetailItem label="Отправитель" value={stripOoo(item.Sender) || "-"} />
                            <DetailItem label="Получатель" value={stripOoo(item.Receiver ?? (item as any).receiver) || "-"} />
                            <DetailItem label="Место отправления" value={citySenderDisplay || "-"} />
                            <DetailItem label="Место получения" value={cityReceiverDisplay || "-"} />
                        </div>
                        <div className="cargo-details-tiles-row cargo-details-tiles-row--metrics">
                            <DetailItem label="Мест" value={renderValue(item.Mest)} icon={<Layers className="w-4 h-4 mr-1 text-theme-primary" />} />
                            <DetailItem
                                label="Плат. вес"
                                value={renderValue(item.PW, "кг")}
                                icon={<Scale className="w-4 h-4 mr-1 text-theme-primary" />}
                                highlighted
                            />
                            {isCustomerRole && (
                                <>
                                    <DetailItem
                                        label="Вес"
                                        value={renderValue(item.W, "кг")}
                                        icon={<Weight className="w-4 h-4 mr-1 text-theme-primary" />}
                                    />
                                    <DetailItem
                                        label="Объем"
                                        value={renderValue(item.Value, "м³")}
                                        icon={<List className="w-4 h-4 mr-1 text-theme-primary" />}
                                    />
                                </>
                            )}
                        </div>
                        {isCustomerRole && showSums && (
                            <div className="cargo-details-tiles-row cargo-details-tiles-row--finance">
                                <DetailItem label="Стоимость" value={formatCurrency(item.Sum)} textColor={getSumColorByPaymentStatus(item.StateBill)} />
                                <DetailItem label="Оплачено" value={formatCurrency(cargoSumPaid)} />
                                <DetailItem
                                    label="Остаток"
                                    value={formatCurrency(cargoBalance)}
                                    textColor={getSumColorByPaymentStatus(item.StateBill)}
                                />
                                <DetailItem label="Статус Счета" value={<StatusBillBadge status={item.StateBill} />} highlighted />
                            </div>
                        )}
                        <div className="cargo-details-tiles-row cargo-details-tiles-row--logistics">
                            <DetailItem label="Заборная логистика" value={<CargoPickupLogisticsBadge item={item} />} />
                            <DetailItem
                                label="Последняя миля"
                                value={
                                    <span className={`max-badge ${selfPickup ? "cargo-last-mile-self" : "cargo-last-mile-delivery"}`}>
                                        {selfPickup ? "Самовывоз" : "Доставка"}
                                    </span>
                                }
                            />
                        </div>
                        {useServiceRequest && (
                            <div className="cargo-details-tiles-row cargo-details-tiles-row--service">
                                <div className="cargo-details-customer-tile-grid">
                                    <DetailItem label="Заказчик" value={customerDisplay || "-"} />
                                </div>
                            </div>
                        )}
                    </div>
                    {(perevozkaLoading || perevozkaFetched || perevozkaTimeline || perevozkaError) && (
                        <aside className="cargo-details-modal-timeline shipment-status-timeline-wrap">
                            {(() => {
                                const totalHours = (() => {
                                    if (!receivedAtSender?.date) return null;
                                    const startMs = new Date(receivedAtSender.date).getTime();
                                    if (!Number.isFinite(startMs)) return null;
                                    const deliveredMs = deliveredStep?.date ? new Date(deliveredStep.date).getTime() : NaN;
                                    const endMs = Number.isFinite(deliveredMs) ? deliveredMs : Date.now();
                                    return Math.max(0, Math.round((endMs - startMs) / (1000 * 60 * 60)));
                                })();
                                return (
                                    <ShipmentStatusPanel
                                        steps={perevozkaTimeline ?? []}
                                        fromCity={fromCity}
                                        toCity={toCity}
                                        totalHours={totalHours}
                                        loading={perevozkaLoading}
                                        error={perevozkaError}
                                        embedded
                                        stepOutOfSla={(index) => isTimelineStepOutOfSla(perevozkaTimeline?.[index]?.date)}
                                    />
                                );
                            })()}
                        </aside>
                    )}
                </div>
                {hasLastMileBlock && (
                    <div className="cargo-details-last-mile-block">
                        <Typography.Headline className="cargo-modal-section-title" style={{ marginBottom: '0.5rem' }}>
                            Последняя миля
                        </Typography.Headline>
                        <div className="cargo-details-tiles-row cargo-details-last-mile-row">
                            <DetailItem label="Гос номер" value={lastMile.autoReg || '-'} />
                            <DetailItem label="Марка" value={lastMile.autoType || '-'} />
                            <DetailItem label="Экспедитор" value={lastMile.driver || '-'} />
                            <DetailItem label="Телефон" value={lastMile.driverTel || '-'} />
                        </div>
                    </div>
                )}
                <div className="details-grid-modal">
                    {Object.entries(item)
                        .filter(([key]) => !EXCLUDED_KEYS.includes(key))
                        .sort(([a], [b]) => {
                            const pos = (k: string) => {
                                if (k === 'CitySender') return 1;
                                if (k === 'CityReceiver') return 2;
                                if (k === 'Order') return 999;
                                if (k === 'AutoReg') return 1000;
                                return 0;
                            };
                            return pos(a) - pos(b);
                        })
                        .map(([key, val]) => {
                            if (val === undefined || val === null || val === "" || (typeof val === 'string' && val.trim() === "") || (typeof val === 'object' && val !== null && Object.keys(val).length === 0)) return null;
                            if (val === 0 && key.toLowerCase().includes('date') === false) return null;
                            if (key === 'AutoReg' && !useServiceRequest) return null;
                            const isFerry = item?.AK === true || item?.AK === "true" || item?.AK === "1" || item?.AK === 1;
                            const lk = key.toLowerCase();
                            const label =
                                FIELD_LABELS[key]
                                ?? (lk === 'upd' ? 'УПД' : lk === 'billnum' || lk === 'bill_number' ? 'Счет' : key);
                            let value: React.ReactNode;
                            if (lk === 'upd' || lk === 'billnum' || lk === 'bill_number') {
                                value = formatInvoiceNumber(String(val ?? ''));
                            } else if ((key === 'TypeOfTranzit' || key === 'TypeOfTransit') && isFerry) {
                                value = 'Паром';
                            } else if (key === 'CitySender' || key === 'CityReceiver') {
                                value = cityToCode(val) || renderValue(val);
                            } else {
                                value = renderValue(val);
                            }
                            return <DetailItem key={key} label={label} value={value} />;
                        })}
                </div>
                {!perevozkaLoading && perevozkaNomenclature.length > 0 && (
                    <div style={{ marginTop: '1rem', marginBottom: '1rem' }}>
                        <div role="button" tabIndex={0} onClick={() => setNomenclatureOpen((v) => !v)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setNomenclatureOpen((v) => !v); } }} style={{ cursor: 'pointer', userSelect: 'none', marginBottom: nomenclatureOpen ? '0.75rem' : 0 }} title={nomenclatureOpen ? 'Свернуть номенклатуру' : 'Показать номенклатуру'}>
                            <Typography.Headline className="cargo-modal-section-title" style={{ marginBottom: 0 }}>{nomenclatureOpen ? '▼' : '▶'} Номенклатура принятого груза</Typography.Headline>
                        </div>
                        {nomenclatureOpen && (
                            <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--color-border)' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                    <thead>
                                        <tr style={{ backgroundColor: 'var(--color-bg-hover)' }}>
                                            {Object.keys(perevozkaNomenclature[0]).map((col) => (
                                                <th key={col} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--color-border)' }}>
                                                    {col === 'Package' ? 'Штрихкод' : col === 'SKUs' ? 'Номенклатура' : col}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {perevozkaNomenclature.map((row, idx) => (
                                            <tr key={idx} style={{ borderBottom: idx < perevozkaNomenclature.length - 1 ? '1px solid var(--color-border)' : undefined }}>
                                                {Object.keys(perevozkaNomenclature[0]).map((col) => (
                                                    <td key={col} style={{ padding: '0.5rem 0.75rem', verticalAlign: 'top' }}>
                                                        {(() => {
                                                            const val = row[col];
                                                            if (val === undefined || val === null) return '—';
                                                            if (Array.isArray(val)) {
                                                                if (val.length === 0) return '—';
                                                                const first = val[0];
                                                                if (typeof first === 'object' && first !== null && ('SKU' in first || 'sku' in first)) {
                                                                    const list = val.map((it: any) => it?.SKU ?? it?.sku ?? '').filter((s: string) => String(s).trim());
                                                                    return list.length === 0 ? '—' : (
                                                                        <span style={{ display: 'block', maxHeight: '12em', overflowY: 'auto' }}>
                                                                            {list.map((sku: string, i: number) => (
                                                                                <span key={i} style={{ display: 'block', marginBottom: i < list.length - 1 ? '0.25rem' : 0 }}>{sku}</span>
                                                                            ))}
                                                                        </span>
                                                                    );
                                                                }
                                                                return val.map((v: any) => String(v)).join(', ');
                                                            }
                                                            if (typeof val === 'object') return JSON.stringify(val);
                                                            const s = String(val).trim();
                                                            return s !== '' ? s : '—';
                                                        })()}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
                {slaFromTimeline && (
                    <div style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
                        <Typography.Body style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                            {slaFromTimeline.onTime ? <span style={{ color: 'var(--color-success-status)' }}>В срок</span> : <span style={{ color: '#ef4444' }}>Опоздание</span>}
                        </Typography.Body>
                    </div>
                )}
                {downloadError && <Typography.Body className="login-error mb-2">{downloadError}</Typography.Body>}
                <Typography.Headline className="cargo-modal-section-title" style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>Документы</Typography.Headline>
                {(() => {
                    const isPaid = item.StateBill?.toLowerCase().includes('оплачен') || item.StateBill?.toLowerCase().includes('paid') || item.StateBill === 'Оплачен';
                    const isCustomer = isCustomerRole;
                    const availableDocs = isCustomer ? ['ЭР', 'АПП', 'СЧЕТ', 'УПД'] : ['АПП'];
                    return (
                        <div className="document-buttons document-buttons--cargo">
                            {availableDocs.map(doc => {
                                const isUPD = doc === 'УПД';
                                const isHighlighted = isUPD && isPaid;
                                return (
                                    <button
                                        key={doc}
                                        type="button"
                                        className={`doc-button doc-button--cargo ${isHighlighted ? 'doc-button-highlighted' : ''}`}
                                        onClick={() => handleDownload(doc)}
                                        disabled={downloading === doc}
                                    >
                                        {downloading === doc ? (
                                            <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                                        ) : (
                                            <Download className="w-4 h-4" aria-hidden />
                                        )}
                                        {doc}
                                    </button>
                                );
                            })}
                        </div>
                    );
                })()}
                {pdfViewer && (
                    <div style={{ marginTop: '1rem', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
                        <div style={{ padding: '0.5rem', background: 'var(--color-bg-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                            <Typography.Label style={{ fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pdfViewer.name}</Typography.Label>
                            <Flex align="center" gap="0.25rem">
                                {pdfViewer.blob && (
                                    <Button size="small" onClick={() => downloadFile(pdfViewer.blob!, pdfViewer.downloadFileName || pdfViewer.name)} title="Скачать"><Download className="w-4 h-4" /></Button>
                                )}
                                <Button size="small" onClick={() => { URL.revokeObjectURL(pdfViewer.url); setPdfViewer(null); }}><X size={16} /></Button>
                            </Flex>
                        </div>
                        <object data={pdfViewer.url} type="application/pdf" style={{ width: '100%', height: '500px' }}>
                            <Typography.Body style={{ padding: '1rem', textAlign: 'center' }}>Ваш браузер не поддерживает просмотр PDF.</Typography.Body>
                        </object>
                    </div>
                )}
            </div>
        </div>
    );
}

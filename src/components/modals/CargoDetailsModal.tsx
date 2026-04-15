import React, { useState, useEffect } from "react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import { Loader2, X, Truck, Ship, Heart, Share2, Layers, Scale, Weight, List, Download, Info, ClipboardList } from "lucide-react";
import { fetchPerevozkaDetails, getTimelineStepColor } from "../../lib/perevozkaDetails";
import { getWebApp, isMaxWebApp } from "../../webApp";
import { DOCUMENT_METHODS } from "../../documentMethods";
import { PROXY_API_DOWNLOAD_URL } from "../../constants/config";
import { formatCurrency, formatInvoiceNumber, stripOoo, cityToCode, transliterateFilename } from "../../lib/formatUtils";
import { normalizeStatus, getFilterKeyByStatus, getSumColorByPaymentStatus } from "../../lib/statusUtils";
import { formatDate } from "../../lib/dateUtils";
import { getPlanDays } from "../../lib/cargoUtils";
import { DetailItem } from "../ui/DetailItem";
import { DateText } from "../ui/DateText";
import { StatusBadge, StatusBillBadge } from "../shared/StatusBadges";
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

    useEffect(() => {
        if (!isOpen || !item?.Number || !auth?.login || !auth?.password) {
            setPerevozkaTimeline(null);
            setPerevozkaNomenclature([]);
            setPerevozkaMeta({ autoReg: '', autoType: '', driver: '' });
            setPerevozkaError(null);
            return;
        }
        let cancelled = false;
        setPerevozkaLoading(true);
        setPerevozkaError(null);
        fetchPerevozkaDetails(auth, item.Number, item)
            .then(({ steps, nomenclature, meta }) => {
                if (!cancelled) {
                    setPerevozkaTimeline(steps);
                    setPerevozkaNomenclature(nomenclature || []);
                    setPerevozkaMeta(meta || { autoReg: '', autoType: '', driver: '' });
                }
            })
            .catch((e: any) => { if (!cancelled) setPerevozkaError(e?.message || 'Не удалось загрузить статусы'); })
            .finally(() => { if (!cancelled) setPerevozkaLoading(false); });
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
                    number: item.Number,
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

    const EXCLUDED_KEYS = ['Number', 'DatePrih', 'DateVr', 'State', 'Mest', 'PW', 'W', 'Value', 'Sum', 'StateBill', 'BillNumber', 'UpdNumber', 'NomerScheta', 'NomerUPD', 'NomerUpd', 'NumberBill', 'Sender', 'Customer', 'Receiver', 'AK', 'DateDoc', 'OG', 'TypeOfTranzit', 'TypeOfTransit', 'INN', 'Inn', 'inn', 'SenderINN', 'ReceiverINN', '_role', 'Driver', 'AutoType', 'AutoReg', 'DateArrival', 'Order', 'LMAutoReg', 'LMAutoType', 'LMDriver', 'LMDriverTel'];
    const isCustomerRole = item._role === "Customer";
    const FIELD_LABELS: Record<string, string> = {
        CitySender: 'Место отправления',
        CityReceiver: 'Место получения',
        Order: 'Номер заявки заказчика',
        AutoReg: 'Транспортное средство',
    };
    const lastMile = {
        autoReg: String((item as any).LMAutoReg ?? '').trim(),
        autoType: String((item as any).LMAutoType ?? '').trim(),
        driver: String((item as any).LMDriver ?? '').trim(),
        driverTel: String((item as any).LMDriverTel ?? '').trim(),
    };
    const hasLastMileBlock = Boolean(lastMile.autoReg || lastMile.autoType || lastMile.driver || lastMile.driverTel);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <Flex align="center" justify="space-between" style={{ width: '100%', minWidth: 0 }}>
                        <Flex align="center" gap="0.5rem" style={{ flexShrink: 1, minWidth: 0, maxWidth: '55%' }}>
                            {(() => {
                                const isFerry = item?.AK === true || item?.AK === 'true' || item?.AK === '1' || item?.AK === 1;
                                return isFerry ? <Ship className="modal-header-transport-icon" style={{ color: 'var(--color-primary-blue)', width: 24, height: 24, flexShrink: 0 }} title="Паром" /> : <Truck className="modal-header-transport-icon" style={{ color: 'var(--color-primary-blue)', width: 24, height: 24, flexShrink: 0 }} title="Авто" />;
                            })()}
                            {item._role && (
                                <span className="role-badge" style={{ fontSize: '0.7rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: '999px', background: 'var(--color-panel-secondary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {item._role === 'Customer' ? 'Заказчик' : item._role === 'Sender' ? 'Отправитель' : 'Получатель'}
                                </span>
                            )}
                        </Flex>
                        <Flex align="center" gap="0.25rem" style={{ flexShrink: 0 }}>
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
                                        if (item.DatePrih) lines.push(`Приход: ${formatDate(item.DatePrih)}`);
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
                                        if (item._role === 'Customer') {
                                            if (item.PW !== undefined) lines.push(`Плат. вес: ${item.PW} кг`);
                                            if (item.Sum !== undefined) lines.push(`Стоимость: ${formatCurrency(item.Sum as any)}`);
                                            if (item.StateBill) lines.push(`Статус счета: ${item.StateBill}`);
                                            const bn = String(item.BillNumber ?? (item as any).NomerScheta ?? "").trim();
                                            const un = String(item.UpdNumber ?? (item as any).NomerUPD ?? "").trim();
                                            if (bn) lines.push(`Номер счёта: ${bn}`);
                                            if (un) lines.push(`Номер УПД: ${un}`);
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
                        </Flex>
                    </Flex>
                </div>
                <div className="details-grid-modal">
                    <DetailItem label="Номер" value={item.Number || '—'} />
                    <DetailItem label="Статус" value={<StatusBadge status={item.State} />} />
                    <DetailItem label="Приход" value={<DateText value={item.DatePrih} />} />
                    <DetailItem label="Доставка" value={(() => {
                        const status = normalizeStatus(item.State);
                        const lower = status.toLowerCase();
                        if (lower.includes('доставлен') || lower.includes('заверш')) {
                            return <DateText value={item.DateVr} />;
                        }
                        return '-';
                    })()} />
                    <DetailItem
                        label="Плановая дата доставки"
                        value={plannedDeliveryDate ? <DateText value={plannedDeliveryDate} /> : '-'}
                    />
                    <DetailItem label="Номер заявки заказчика" value={String((item as any).Order ?? '').trim() || '-'} />
                    {useServiceRequest && (
                        <>
                            <DetailItem label="Заказчик" value={stripOoo(String(item.Customer ?? (item as any).customer ?? (item as any).Заказчик ?? (item as any).Contractor ?? (item as any).Organization ?? '').trim()) || '-'} />
                            <DetailItem label="Транспортное средство" value={String(item.AutoReg ?? (item as any).autoReg ?? perevozkaMeta.autoReg ?? '-').trim() || '-'} />
                        </>
                    )}
                    <DetailItem label="Отправитель" value={stripOoo(item.Sender) || '-'} />
                    <DetailItem label="Получатель" value={stripOoo(item.Receiver ?? (item as any).receiver) || '-'} />
                    <DetailItem label="Мест" value={renderValue(item.Mest)} icon={<Layers className="w-4 h-4 mr-1 text-theme-primary" />} />
                    <DetailItem label="Плат. вес" value={renderValue(item.PW, 'кг')} icon={<Scale className="w-4 h-4 mr-1 text-theme-primary" />} highlighted />
                    {isCustomerRole && (
                        <>
                            <DetailItem label="Вес" value={renderValue(item.W, 'кг')} icon={<Weight className="w-4 h-4 mr-1 text-theme-primary" />} />
                            <DetailItem label="Объем" value={renderValue(item.Value, 'м³')} icon={<List className="w-4 h-4 mr-1 text-theme-primary" />} />
                            {showSums && <DetailItem label="Стоимость" value={formatCurrency(item.Sum)} textColor={getSumColorByPaymentStatus(item.StateBill)} />}
                            {showSums && <DetailItem label="Статус Счета" value={<StatusBillBadge status={item.StateBill} />} highlighted />}
                            <DetailItem
                                label="Номер счёта"
                                value={(() => {
                                    const s = String(item.BillNumber ?? (item as any).NomerScheta ?? "").trim();
                                    return s ? formatInvoiceNumber(s) : '—';
                                })()}
                            />
                            <DetailItem
                                label="Номер УПД"
                                value={(() => {
                                    const s = String(item.UpdNumber ?? (item as any).NomerUPD ?? "").trim();
                                    return s ? formatInvoiceNumber(s) : '—';
                                })()}
                            />
                        </>
                    )}
                </div>
                {hasLastMileBlock && (
                    <div style={{ marginTop: '0.75rem' }}>
                        <Typography.Headline style={{ marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600 }}>
                            Последняя миля
                        </Typography.Headline>
                        <div className="details-grid-modal">
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
                            const label = FIELD_LABELS[key] || key;
                            const value =
                                (key === 'TypeOfTranzit' || key === 'TypeOfTransit') && isFerry
                                    ? 'Паром'
                                    : (key === 'CitySender' || key === 'CityReceiver')
                                        ? (cityToCode(val) || renderValue(val))
                                        : renderValue(val);
                            return <DetailItem key={key} label={label} value={value} />;
                        })}
                </div>
                {(perevozkaLoading || perevozkaTimeline || perevozkaError) && (
                    <div className="perevozka-timeline-wrap" style={{ marginTop: '1rem', marginBottom: '1rem' }}>
                        <Typography.Headline style={{ marginBottom: '0.75rem', fontSize: '0.9rem', fontWeight: 600 }}>Статусы перевозки</Typography.Headline>
                        {perevozkaLoading && (
                            <Flex align="center" gap="0.5rem" style={{ padding: '0.5rem 0' }}>
                                <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--color-primary-blue)' }} />
                                <Typography.Body style={{ color: 'var(--color-text-secondary)' }}>Загрузка...</Typography.Body>
                            </Flex>
                        )}
                        {perevozkaError && <Typography.Body style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>{perevozkaError}</Typography.Body>}
                        {!perevozkaLoading && perevozkaTimeline && perevozkaTimeline.length > 0 && (() => {
                            const totalHours = (() => {
                                if (!receivedAtSender?.date) return null;
                                const startMs = new Date(receivedAtSender.date).getTime();
                                if (!Number.isFinite(startMs)) return null;
                                const deliveredMs = deliveredStep?.date ? new Date(deliveredStep.date).getTime() : NaN;
                                const endMs = Number.isFinite(deliveredMs) ? deliveredMs : Date.now();
                                return Math.max(0, Math.round((endMs - startMs) / (1000 * 60 * 60)));
                            })();
                            return (
                                <div>
                                    <div className="perevozka-timeline">
                                        <div className="perevozka-timeline-track-fill" style={{ height: `${(perevozkaTimeline.length / Math.max(perevozkaTimeline.length, 1)) * 100}%` }} />
                                        {perevozkaTimeline.map((step, index) => {
                                            const colorKey = getTimelineStepColor(step.label);
                                            const outOfSlaFromThisStep = isTimelineStepOutOfSla(step.date);
                                            return (
                                                <div key={index} className="perevozka-timeline-item">
                                                    <div className={`perevozka-timeline-dot perevozka-timeline-dot-${colorKey}`} />
                                                    <div className="perevozka-timeline-content" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                                        <Typography.Body style={{ fontWeight: 600, fontSize: '0.9rem', color: outOfSlaFromThisStep ? '#ef4444' : undefined }}>{step.label}</Typography.Body>
                                                        {step.date && <Typography.Body style={{ fontSize: '0.8rem', color: outOfSlaFromThisStep ? '#ef4444' : 'var(--color-text-secondary)' }}><DateText value={step.date} /></Typography.Body>}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {totalHours != null && (
                                        <Flex align="center" gap="0.35rem" style={{ marginTop: '0.75rem' }}>
                                            <Typography.Body style={{ fontWeight: 600, fontSize: '0.9rem' }}>Итого время в пути — {totalHours} ч</Typography.Body>
                                            <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.preventDefault(); }} title="Срок не учитывает день получения груза" style={{ display: 'inline-flex', cursor: 'help', color: 'var(--color-text-secondary)' }}><Info className="w-4 h-4" /></span>
                                        </Flex>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                )}
                {!perevozkaLoading && perevozkaNomenclature.length > 0 && (
                    <div style={{ marginTop: '1rem', marginBottom: '1rem' }}>
                        <div role="button" tabIndex={0} onClick={() => setNomenclatureOpen((v) => !v)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setNomenclatureOpen((v) => !v); } }} style={{ cursor: 'pointer', userSelect: 'none', marginBottom: nomenclatureOpen ? '0.75rem' : 0 }} title={nomenclatureOpen ? 'Свернуть номенклатуру' : 'Показать номенклатуру'}>
                            <Typography.Headline style={{ marginBottom: 0, fontSize: '0.9rem', fontWeight: 600 }}>{nomenclatureOpen ? '▼' : '▶'} Номенклатура принятого груза</Typography.Headline>
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
                <Typography.Headline style={{ marginTop: '1rem', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600 }}>Документы</Typography.Headline>
                {(() => {
                    const isPaid = item.StateBill?.toLowerCase().includes('оплачен') || item.StateBill?.toLowerCase().includes('paid') || item.StateBill === 'Оплачен';
                    const isCustomer = item._role === 'Customer';
                    const availableDocs = isCustomer ? ['ЭР', 'АПП', 'СЧЕТ', 'УПД'] : ['АПП'];
                    return (
                        <div className="document-buttons">
                            {availableDocs.map(doc => {
                                const isUPD = doc === 'УПД';
                                const isHighlighted = isUPD && isPaid;
                                return (
                                    <Button key={doc} className={`doc-button ${isHighlighted ? 'doc-button-highlighted' : ''}`} onClick={() => handleDownload(doc)} disabled={downloading === doc} style={isHighlighted ? { border: '2px solid var(--color-primary-blue)', boxShadow: '0 0 8px rgba(37, 99, 235, 0.3)' } : {}}>
                                        {downloading === doc ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4 mr-2" />} {doc}
                                    </Button>
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

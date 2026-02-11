import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { X, Download, Loader2 } from "lucide-react";
import { stripOoo, parseCargoNumbersFromText, formatInvoiceNumber, formatCurrency, transliterateFilename } from "../../lib/formatUtils";
import { normalizeStatus, getStatusClass } from "../../lib/statusUtils";
import { PROXY_API_DOWNLOAD_URL } from "../../constants/config";
import { DOCUMENT_METHODS } from "../../documentMethods";
import type { AuthData } from "../../types";

const DOC_BUTTONS = ["ЭР", "АПП", "СЧЕТ", "УПД"] as const;

type InvoiceDetailModalProps = {
    item: any;
    isOpen: boolean;
    onClose: () => void;
    onOpenCargo?: (cargoNumber: string) => void;
    auth?: AuthData | null;
    /** Карты статус/маршрут по номеру перевозки (для столбцов в таблице номенклатуры) */
    cargoStateByNumber?: Map<string, string>;
    cargoRouteByNumber?: Map<string, string>;
    perevozkiLoading?: boolean;
};

/** Номер перевозки из первой строки номенклатуры счёта (или из любой строки, если в первой нет) */
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

/** Номер перевозки из строки номенклатуры (Operation/Name) */
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

export function InvoiceDetailModal({ item, isOpen, onClose, onOpenCargo, auth, cargoStateByNumber, cargoRouteByNumber, perevozkiLoading }: InvoiceDetailModalProps) {
    const [downloading, setDownloading] = useState<string | null>(null);
    const [downloadError, setDownloadError] = useState<string | null>(null);

    if (!isOpen) return null;
    const list: Array<{ Name?: string; Operation?: string; Quantity?: string | number; Price?: string | number; Sum?: string | number }> = Array.isArray(item?.List) ? item.List : [];
    const num = item?.Number ?? item?.number ?? '—';
    const cargoNumber = getFirstCargoNumberFromInvoice(item);

    const handleDownload = async (label: string) => {
        if (!cargoNumber || !auth?.login || !auth?.password) {
            setDownloadError(cargoNumber ? "Требуется авторизация" : "Номер перевозки не найден в счёте");
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
        const s = stripOoo(raw || '—');
        const parts = parseCargoNumbersFromText(s);
        return (
            <>
                {parts.map((p, k) =>
                    p.type === 'cargo' ? (
                        <span
                            key={k}
                            role="button"
                            tabIndex={0}
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpenCargo?.(p.value); }}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenCargo?.(p.value); } }}
                            style={{ color: 'var(--color-primary)', textDecoration: 'underline', cursor: 'pointer', fontWeight: 600 }}
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
        <div style={{ position: 'fixed', inset: 0, zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
            <Panel className="cargo-card" style={{ minWidth: 'min(95vw, 900px)', maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto', padding: '1rem' }} onClick={e => e.stopPropagation()}>
                <Flex justify="space-between" align="center" style={{ marginBottom: '1rem' }}>
                    <Typography.Headline style={{ fontSize: '1.1rem' }}>Счёт {formatInvoiceNumber(num)}</Typography.Headline>
                    <Button className="filter-button" onClick={onClose} style={{ padding: '0.35rem' }}><X className="w-5 h-5" /></Button>
                </Flex>
                {auth && (
                    <Flex gap="0.5rem" wrap="wrap" style={{ marginBottom: '1rem' }}>
                        {DOC_BUTTONS.map((label) => (
                            <Button
                                key={label}
                                className="filter-button"
                                size="small"
                                disabled={!cargoNumber || downloading !== null}
                                onClick={() => handleDownload(label)}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                            >
                                {downloading === label ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                {label}
                            </Button>
                        ))}
                    </Flex>
                )}
                {downloadError && (
                    <Typography.Body style={{ color: 'var(--color-error)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>{downloadError}</Typography.Body>
                )}
                {list.length > 0 ? (
                    <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                            <thead>
                                <tr style={{ background: 'var(--color-bg-hover)' }}>
                                    <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600 }}>Услуга</th>
                                    <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600 }}>Статус перевозки</th>
                                    <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600 }}>Маршрут</th>
                                    <th style={{ padding: '0.5rem 0.4rem', textAlign: 'right', fontWeight: 600 }}>Кол-во</th>
                                    <th style={{ padding: '0.5rem 0.4rem', textAlign: 'right', fontWeight: 600 }}>Цена</th>
                                    <th style={{ padding: '0.5rem 0.4rem', textAlign: 'right', fontWeight: 600 }}>Сумма</th>
                                </tr>
                            </thead>
                            <tbody>
                                {list.map((row, i) => {
                                    const cargoNum = getCargoNumberFromRow(row);
                                    const deliveryState = cargoNum ? lookupNorm(cargoStateByNumber, cargoNum) : undefined;
                                    const route = cargoNum ? lookupNorm(cargoRouteByNumber, cargoNum) : undefined;
                                    const statusClass = getStatusClass(deliveryState);
                                    const statusLabel = deliveryState != null ? normalizeStatus(deliveryState) : null;
                                    return (
                                    <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                        <td style={{ padding: '0.5rem 0.4rem', maxWidth: 220 }} title={stripOoo(String(row.Operation ?? row.Name ?? ''))}>{renderServiceCell(String(row.Operation ?? row.Name ?? '—'))}</td>
                                        <td style={{ padding: '0.5rem 0.4rem' }}>
                                            {perevozkiLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--color-text-secondary)' }} /> : statusLabel != null ? <span className={statusClass} style={{ fontSize: '0.7rem', padding: '0.15rem 0.35rem', borderRadius: '999px', fontWeight: 600 }}>{statusLabel}</span> : '—'}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.4rem' }}>
                                            {perevozkiLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--color-text-secondary)' }} /> : route ? <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '0.15rem 0.35rem', borderRadius: '999px', background: 'rgba(59, 130, 246, 0.15)', color: 'var(--color-primary-blue)', border: '1px solid rgba(59, 130, 246, 0.4)' }}>{route}</span> : '—'}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right' }}>{row.Quantity ?? '—'}</td>
                                        <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right' }}>{row.Price != null ? formatCurrency(row.Price) : '—'}</td>
                                        <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right' }}>{row.Sum != null ? formatCurrency(row.Sum) : '—'}</td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <Typography.Body style={{ color: 'var(--color-text-secondary)' }}>Нет номенклатуры</Typography.Body>
                )}
            </Panel>
        </div>,
        document.body
    );
}

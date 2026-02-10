import React from "react";
import { createPortal } from "react-dom";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { X } from "lucide-react";
import { stripOoo, parseCargoNumbersFromText, formatInvoiceNumber, formatCurrency } from "../../lib/formatUtils";

type InvoiceDetailModalProps = {
    item: any;
    isOpen: boolean;
    onClose: () => void;
    onOpenCargo?: (cargoNumber: string) => void;
};

export function InvoiceDetailModal({ item, isOpen, onClose, onOpenCargo }: InvoiceDetailModalProps) {
    if (!isOpen) return null;
    const list: Array<{ Name?: string; Operation?: string; Quantity?: string | number; Price?: string | number; Sum?: string | number }> = Array.isArray(item?.List) ? item.List : [];
    const num = item?.Number ?? item?.number ?? '—';

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
                {list.length > 0 ? (
                    <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                            <thead>
                                <tr style={{ background: 'var(--color-bg-hover)' }}>
                                    <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600 }}>Услуга</th>
                                    <th style={{ padding: '0.5rem 0.4rem', textAlign: 'right', fontWeight: 600 }}>Кол-во</th>
                                    <th style={{ padding: '0.5rem 0.4rem', textAlign: 'right', fontWeight: 600 }}>Цена</th>
                                    <th style={{ padding: '0.5rem 0.4rem', textAlign: 'right', fontWeight: 600 }}>Сумма</th>
                                </tr>
                            </thead>
                            <tbody>
                                {list.map((row, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                        <td style={{ padding: '0.5rem 0.4rem', maxWidth: 220 }} title={stripOoo(String(row.Operation ?? row.Name ?? ''))}>{renderServiceCell(String(row.Operation ?? row.Name ?? '—'))}</td>
                                        <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right' }}>{row.Quantity ?? '—'}</td>
                                        <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right' }}>{row.Price != null ? formatCurrency(row.Price) : '—'}</td>
                                        <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right' }}>{row.Sum != null ? formatCurrency(row.Sum) : '—'}</td>
                                    </tr>
                                ))}
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

import React, { useState, useEffect, useId } from "react";
import { Button, Flex, Input, Typography } from "@maxhub/max-ui";
import { GuardedDialog } from "../GuardedDialog";
import { X } from "lucide-react";
import { getTodayDate } from "../../lib/dateUtils";

type FilterDialogProps = {
    isOpen: boolean;
    onClose: () => void;
    dateFrom: string;
    dateTo: string;
    onApply: (from: string, to: string) => void;
    title?: string;
    onReset?: () => void;
    resetLabel?: string;
};

export function FilterDialog({ isOpen, onClose, dateFrom, dateTo, onApply, title = "Произвольный диапазон", onReset, resetLabel = "По умолчанию" }: FilterDialogProps) {
    const fieldId = useId();
    const [tempFrom, setTempFrom] = useState(dateFrom);
    const [tempTo, setTempTo] = useState(dateTo);
    useEffect(() => { if (isOpen) { setTempFrom(dateFrom); setTempTo(dateTo); } }, [isOpen, dateFrom, dateTo]);
    if (!isOpen) return null;
    return (
        <GuardedDialog className="modal-overlay" title={title} onClose={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <Typography.Headline>{title}</Typography.Headline>
                    <Button className="modal-close-button" onClick={onClose} aria-label="Закрыть"><X size={20} /></Button>
                </div>
                <form onSubmit={e => { e.preventDefault(); if (!tempFrom || !tempTo || tempFrom > tempTo) return; onApply(tempFrom, tempTo); onClose(); }}>
                    <div style={{ marginBottom: '1rem' }}><label className="detail-item-label" htmlFor={`${fieldId}-from`}>Дата начала:</label><Input id={`${fieldId}-from`} aria-label="Дата начала" max={tempTo || undefined} type="date" className="login-input date-input" value={tempFrom} onChange={e => setTempFrom(e.target.value)} required /></div>
                    <div style={{ marginBottom: '1rem' }}><label className="detail-item-label" htmlFor={`${fieldId}-to`}>Дата окончания:</label><Input id={`${fieldId}-to`} aria-label="Дата окончания" min={tempFrom || undefined} type="date" className="login-input date-input" value={tempTo} onChange={e => setTempTo(e.target.value)} required /></div>
                    <div className="calendar-quick-today-mobile-only" style={{ marginBottom: '1rem' }}>
                        <Button
                            type="button"
                            className="filter-button"
                            style={{ padding: '0.35rem 0.65rem', fontSize: '0.85rem' }}
                            onClick={() => {
                                const t = getTodayDate();
                                setTempFrom(t);
                                setTempTo(t);
                            }}
                        >
                            Сегодня
                        </Button>
                    </div>
                    <Flex gap="0.5rem" wrap="wrap">
                        {onReset ? (
                            <Button type="button" className="filter-button" onClick={() => { onReset(); onClose(); }}>
                                {resetLabel}
                            </Button>
                        ) : null}
                        <Button className="button-primary" type="submit">Применить</Button>
                    </Flex>
                </form>
            </div>
        </GuardedDialog>
    );
}

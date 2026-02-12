import React from "react";
import { normalizeStatus } from "../../lib/statusUtils";

export const StatusBadge = ({ status }: { status: string | undefined }) => {
    const normalizedStatus = normalizeStatus(status);
    const lower = (normalizedStatus || '').toLowerCase();
    let badgeClass = 'max-badge';
    if (lower.includes('доставлен') || lower.includes('заверш')) badgeClass += ' max-badge-success';
    else if (lower.includes('доставке')) badgeClass += ' max-badge-purple';
    else if (lower.includes('готов')) badgeClass += ' max-badge-ready';
    else if (lower.includes('пути') || lower.includes('отправлен')) badgeClass += ' max-badge-warning';
    else if (lower.includes('отменен') || lower.includes('аннулирован')) badgeClass += ' max-badge-danger';
    else badgeClass += ' max-badge-default';
    return <span className={badgeClass}>{normalizedStatus || '-'}</span>;
};

export const StatusBillBadge = ({ status }: { status: string | undefined }) => {
    const lower = (status || '').toLowerCase().trim();
    let badgeClass = 'max-badge';
    if (lower.includes('не оплачен') || lower.includes('неоплачен') || lower.includes('не оплачён') || lower.includes('неоплачён') ||
        lower.includes('unpaid') || lower.includes('ожидает') || lower.includes('pending') || lower === 'не оплачен' || lower === 'неоплачен') {
        badgeClass += ' max-badge-danger';
    } else if (lower.includes('отменен') || lower.includes('аннулирован') || lower.includes('отменён') || lower.includes('cancelled') || lower.includes('canceled')) {
        badgeClass += ' max-badge-danger';
    } else if (lower.includes('оплачен') || lower.includes('paid') || lower.includes('оплачён')) badgeClass += ' max-badge-success';
    else if (lower.includes('частично') || lower.includes('partial') || lower.includes('частичн')) badgeClass += ' max-badge-warning';
    else badgeClass += ' max-badge-default';
    return <span className={badgeClass}>{status || '-'}</span>;
};

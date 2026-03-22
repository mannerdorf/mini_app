import type { StatusFilter } from "../types";

function remapPostbStatusLabel(raw: string): string {
    const s = String(raw ?? "").trim();
    if (!s) return "";
    const low = s.toLowerCase();
    if (low === "отправлена в аэропорт") return "Отправлена";
    if (low === "улетела") return "В пути";
    return s;
}

/**
 * Статус перевозки из API может быть строкой или объектом (1С/JSON).
 * Без нормализации String(object) даёт «[object Object]» в UI.
 */
export function coerceStatusDisplay(value: unknown): string {
    if (value == null) return "";
    if (typeof value === "string") return remapPostbStatusLabel(value);
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (Array.isArray(value) && value.length > 0) return coerceStatusDisplay(value[0]);
    if (typeof value === "object") {
        const o = value as Record<string, unknown>;
        const keys = [
            "Name",
            "name",
            "Value",
            "value",
            "label",
            "Title",
            "title",
            "Статус",
            "Наименование",
            "State",
            "state",
            "Description",
            "description",
        ] as const;
        for (const k of keys) {
            const v = o[k];
            if (v != null && typeof v !== "object") return remapPostbStatusLabel(String(v));
        }
        for (const v of Object.values(o)) {
            if (typeof v === "string" && v.trim()) return remapPostbStatusLabel(v);
            if (typeof v === "number" || typeof v === "boolean") return String(v);
        }
    }
    return "";
}

export const normalizeStatus = (status: string | undefined): string => {
    if (!status) return '-';
    const remapped = remapPostbStatusLabel(status);
    const lower = remapped.toLowerCase();
    if (lower.includes('поставлена на доставку в месте прибытия') || lower.includes('поставлена на доставку')) {
        return 'На доставке';
    }
    return remapped;
};

export const getPaymentFilterKey = (stateBill: string | undefined): 'unpaid' | 'cancelled' | 'paid' | 'partial' | 'unknown' => {
    if (!stateBill) return "unknown";
    const lower = stateBill.toLowerCase().trim();
    if (lower.includes('не оплачен') || lower.includes('неоплачен') || lower.includes('не оплачён') || lower.includes('неоплачён') ||
        lower.includes('unpaid') || lower.includes('ожидает') || lower.includes('pending') || lower === 'не оплачен' || lower === 'неоплачен') {
        return "unpaid";
    }
    if (lower.includes('отменен') || lower.includes('аннулирован') || lower.includes('отменён') || lower.includes('cancelled') || lower.includes('canceled')) {
        return "cancelled";
    }
    if (lower.includes('оплачен') || lower.includes('paid') || lower.includes('оплачён')) return "paid";
    if (lower.includes('частично') || lower.includes('partial') || lower.includes('частичн')) return "partial";
    return "unknown";
};

export type BillStatusFilterKey = 'all' | ReturnType<typeof getPaymentFilterKey>;
export const BILL_STATUS_MAP: Record<BillStatusFilterKey, string> = {
    all: 'Все', paid: 'Оплачен', unpaid: 'Не оплачен', partial: 'Частично', cancelled: 'Отменён', unknown: 'Не указан',
};

export const isReceivedInfoStatus = (s: string | undefined): boolean => {
    if (!s) return false;
    const l = normalizeStatus(s).toLowerCase();
    return /получена\s*информация|полученаинформация/.test(l) || (l.includes('получена') && l.includes('информация'));
};

export const getFilterKeyByStatus = (s: string | undefined): StatusFilter => {
    if (!s) return 'all';
    const normalized = normalizeStatus(s);
    const l = normalized.toLowerCase();
    if (l.includes('доставлен') || l.includes('заверш')) return 'delivered';
    if (l.includes('пути') || l.includes('отправлен')) return 'in_transit';
    if (l.includes('готов')) return 'ready';
    if (l.includes('доставке')) return 'delivering';
    return 'all';
};

export const STATUS_MAP: Record<StatusFilter, string> = { "all": "Все", "in_transit": "В пути", "ready": "Готов к выдаче", "delivering": "На доставке", "delivered": "Доставлено", "favorites": "Избранные" };

const STATUS_KEYS = Object.keys(STATUS_MAP) as StatusFilter[];
export function isValidStatusFilter(value: unknown): value is StatusFilter {
    return typeof value === "string" && STATUS_KEYS.includes(value as StatusFilter);
}

export const getStatusClass = (status: string | undefined) => {
    const normalized = normalizeStatus(status);
    const lower = (normalized || '').toLowerCase();
    if (lower.includes('доставлен') || lower.includes('заверш')) return 'status-value success';
    if (lower.includes('доставке')) return 'status-value delivering';
    if (lower.includes('пути') || lower.includes('отправлен')) return 'status-value transit';
    if (lower.includes('принят') || lower.includes('оформлен')) return 'status-value accepted';
    if (lower.includes('готов')) return 'status-value ready';
    return 'status-value';
};

export const getSumColorByPaymentStatus = (stateBill: string | undefined): string => {
    if (!stateBill) return 'var(--color-text-primary)';
    const lower = stateBill.toLowerCase().trim();
    if (lower.includes('не оплачен') || lower.includes('неоплачен') || lower.includes('не оплачён') || lower.includes('неоплачён') ||
        lower.includes('unpaid') || lower.includes('ожидает') || lower.includes('pending') || lower === 'не оплачен' || lower === 'неоплачен') {
        return '#ef4444';
    }
    if (lower.includes('оплачен') || lower.includes('paid') || lower.includes('оплачён')) return 'var(--color-success-status)';
    if (lower.includes('частично') || lower.includes('partial') || lower.includes('частичн')) return 'var(--color-pending-status)';
    return 'var(--color-text-primary)';
};

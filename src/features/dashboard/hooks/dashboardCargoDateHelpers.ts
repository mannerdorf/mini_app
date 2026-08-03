import * as dateUtils from "../../../lib/dateUtils";
import type { CargoItem } from "../../../types";

const { parseDateOnly } = dateUtils;

export function parseDashboardDateOnly(value: unknown): Date | null {
    const raw = String(value ?? "").trim();
    if (!raw) return null;
    if (/^0?1[./-]0?1[./-](1900|1901|0001)$/.test(raw)) return null;
    const parsed = parseDateOnly(raw) ?? new Date(raw);
    if (!Number.isFinite(parsed.getTime()) || parsed.getFullYear() <= 1901) return null;
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

export function getManualPlannedDate(item: CargoItem): Date | null {
    const candidates = [
        (item as Record<string, unknown>).DateArrival,
        (item as Record<string, unknown>).PlannedDeliveryDate,
        (item as Record<string, unknown>).PlanDeliveryDate,
        (item as Record<string, unknown>).DateDeliveryPlan,
        (item as Record<string, unknown>).ПлановаяДатаДоставки,
        (item as Record<string, unknown>).ПланДатаДоставки,
        (item as Record<string, unknown>).ПлановаяДата,
        (item as Record<string, unknown>).PlanDate,
    ];
    for (const candidate of candidates) {
        const parsed = parseDashboardDateOnly(candidate);
        if (parsed) return parsed;
    }
    return null;
}

export function getSendingStartDate(item: CargoItem): Date | null {
    const candidates = [
        (item as Record<string, unknown>).DateOtpr,
        (item as Record<string, unknown>).DateSend,
        (item as Record<string, unknown>).DateShipment,
        (item as Record<string, unknown>).ShipmentDate,
        (item as Record<string, unknown>).ДатаОтправки,
        (item as Record<string, unknown>).ДатаОтгрузки,
        (item as Record<string, unknown>).DateDoc,
        (item as Record<string, unknown>).DatePrih,
        (item as Record<string, unknown>).Date,
        (item as Record<string, unknown>).date,
        (item as Record<string, unknown>).Дата,
    ];
    for (const candidate of candidates) {
        const parsed = parseDashboardDateOnly(candidate);
        if (parsed) return parsed;
    }
    return null;
}

export function getActualDeliveryDate(item: CargoItem): Date | null {
    const candidates = [
        (item as Record<string, unknown>).DateVr,
        (item as Record<string, unknown>).DateDeliveryFact,
        (item as Record<string, unknown>).FactDeliveryDate,
        (item as Record<string, unknown>).ДатаФактическойДоставки,
        (item as Record<string, unknown>).ДатаВручения,
        (item as Record<string, unknown>).DateDelivery,
        (item as Record<string, unknown>).DeliveryDate,
    ];
    for (const candidate of candidates) {
        const parsed = parseDashboardDateOnly(candidate);
        if (parsed) return parsed;
    }
    return null;
}

export function getLastStatusDateKey(item: CargoItem): string {
    const candidates = [
        (item as Record<string, unknown>).StatusDate,
        (item as Record<string, unknown>).DateStatus,
        (item as Record<string, unknown>).DateState,
        (item as Record<string, unknown>).UpdatedAt,
        (item as Record<string, unknown>).updated_at,
        (item as Record<string, unknown>).ДатаСтатуса,
        (item as Record<string, unknown>).ДатаИзменения,
        (item as Record<string, unknown>).DateVr,
        (item as Record<string, unknown>).DatePrih,
    ];
    for (const candidate of candidates) {
        const parsed = parseDashboardDateOnly(candidate);
        if (parsed) {
            return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
        }
    }
    return "";
}

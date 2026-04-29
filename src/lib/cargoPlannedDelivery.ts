/**
 * Плановая дата доставки: вручную из полей API или дата отправки + средний срок по маршруту/типу (как на дашборде).
 */
import * as dateUtils from "./dateUtils";
import { cityToCode } from "./formatUtils";
import type { CargoItem } from "../types";
import { isFerry } from "./cargoUtils";

function parseDateOnly(value: unknown): Date | null {
    const raw = String(value ?? "").trim();
    if (!raw) return null;
    if (/^0?1[./-]0?1[./-](1900|1901|0001)$/.test(raw)) return null;
    const parsed = dateUtils.parseDateOnly(raw) ?? new Date(raw);
    if (!Number.isFinite(parsed.getTime()) || parsed.getFullYear() <= 1901) return null;
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

export function getManualPlannedDeliveryDate(item: CargoItem): Date | null {
    const candidates = [
        (item as any).DateArrival,
        (item as any).PlannedDeliveryDate,
        (item as any).PlanDeliveryDate,
        (item as any).DateDeliveryPlan,
        (item as any).ПлановаяДатаДоставки,
        (item as any).ПланДатаДоставки,
        (item as any).ПлановаяДата,
        (item as any).PlanDate,
    ];
    for (const candidate of candidates) {
        const d = parseDateOnly(candidate);
        if (d) return d;
    }
    return null;
}

export function getSendingStartDateForPlan(item: CargoItem): Date | null {
    const candidates = [
        (item as any).DateOtpr,
        (item as any).DateSend,
        (item as any).DateShipment,
        (item as any).ShipmentDate,
        (item as any).ДатаОтправки,
        (item as any).ДатаОтгрузки,
        (item as any).DateDoc,
        (item as any).DatePrih,
        (item as any).Date,
        (item as any).date,
        (item as any).Дата,
    ];
    for (const candidate of candidates) {
        const d = parseDateOnly(candidate);
        if (d) return d;
    }
    return null;
}

export function getActualDeliveryDateForPlan(item: CargoItem): Date | null {
    const candidates = [
        (item as any).DateVr,
        (item as any).DateDeliveryFact,
        (item as any).FactDeliveryDate,
        (item as any).ДатаФактическойДоставки,
        (item as any).ДатаВручения,
        (item as any).DateDelivery,
        (item as any).DeliveryDate,
    ];
    for (const candidate of candidates) {
        const d = parseDateOnly(candidate);
        if (d) return d;
    }
    return null;
}

/** Средний фактический срок (дни) по паре маршрут|тип по уже доставленным перевозкам в выборке. */
export function buildRouteTypePlanDaysMap(items: CargoItem[]): Map<string, number> {
    const dayMs = 24 * 60 * 60 * 1000;
    const byBucket = new Map<string, Array<{ actualMs: number; days: number }>>();
    const routeKeyFor = (item: CargoItem): string => {
        const from = cityToCode(item.CitySender) || String(item.CitySender ?? "").trim().toUpperCase() || "—";
        const to = cityToCode(item.CityReceiver) || String(item.CityReceiver ?? "").trim().toUpperCase() || "—";
        return `${from}-${to}`;
    };
    const typeKeyFor = (item: CargoItem): "ferry" | "auto" => (isFerry(item) ? "ferry" : "auto");
    (items || []).forEach((item) => {
        const start = getSendingStartDateForPlan(item);
        const actual = getActualDeliveryDateForPlan(item);
        if (!start || !actual) return;
        const diffDays = Math.round((actual.getTime() - start.getTime()) / dayMs);
        if (!Number.isFinite(diffDays) || diffDays <= 0) return;
        if (diffDays > 120) return;
        const bucket = `${routeKeyFor(item)}|${typeKeyFor(item)}`;
        const list = byBucket.get(bucket) ?? [];
        list.push({ actualMs: actual.getTime(), days: diffDays });
        byBucket.set(bucket, list);
    });

    const planDaysByBucket = new Map<string, number>();
    byBucket.forEach((rows, bucket) => {
        const lastFive = [...rows]
            .sort((a, b) => b.actualMs - a.actualMs)
            .slice(0, 5)
            .map((r) => r.days);
        if (lastFive.length === 0) return;
        const values =
            lastFive.length >= 3
                ? (() => {
                      const sorted = [...lastFive].sort((a, b) => a - b);
                      return sorted.slice(1, -1);
                  })()
                : lastFive;
        if (values.length === 0) return;
        const avg = values.reduce((acc, n) => acc + n, 0) / values.length;
        const rounded = Math.max(1, Math.round(avg));
        planDaysByBucket.set(bucket, rounded);
    });
    return planDaysByBucket;
}

export function getEffectivePlannedDeliveryDate(item: CargoItem, planDaysByBucket: Map<string, number>): Date | null {
    const manual = getManualPlannedDeliveryDate(item);
    if (manual) return manual;
    const start = getSendingStartDateForPlan(item);
    if (!start) return null;
    const from = cityToCode(item.CitySender) || String(item.CitySender ?? "").trim().toUpperCase() || "—";
    const to = cityToCode(item.CityReceiver) || String(item.CityReceiver ?? "").trim().toUpperCase() || "—";
    const type = isFerry(item) ? "ferry" : "auto";
    const days = planDaysByBucket.get(`${from}-${to}|${type}`);
    if (!days) return null;
    const planned = new Date(start);
    planned.setDate(planned.getDate() + days);
    return planned;
}

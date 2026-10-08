/** Shared SLA deadline rules for the cargo UI and sending planner. */
import { cityToCode } from './cityToCode.js';
import { mapTimelineStageLabel } from './cargoTimelineLabels.js';
import type { CargoItem } from '../src/types.js';

/** Плановые сроки доставки (дней): MSK-KGD авто 7 / паром 20 / авиа 3; KGD-MSK 60 */
export const AUTO_PLAN_DAYS = 7;
export const FERRY_PLAN_DAYS = 20;
export const AIR_PLAN_DAYS = 3;
export const KGD_MSK_PLAN_DAYS = 60;

export function isFerry(item: CargoItem): boolean {
    return item?.AK === true || item?.AK === 'true' || item?.AK === '1' || item?.AK === 1;
}

/**
 * Определение авиа-перевозки.
 * TODO: подключить правило от продукта — пока всегда false.
 */
export function isAir(_item: Pick<CargoItem, "AK"> | Record<string, unknown> | null | undefined): boolean {
    return false;
}

export function isRouteKgdMsk(item: CargoItem): boolean {
    return cityToCode(item.CitySender) === 'KGD' && cityToCode(item.CityReceiver) === 'MSK';
}

export function getPlanDays(item: CargoItem): number {
    if (isRouteKgdMsk(item)) return KGD_MSK_PLAN_DAYS;
    if (isAir(item)) return AIR_PLAN_DAYS;
    return isFerry(item) ? FERRY_PLAN_DAYS : AUTO_PLAN_DAYS;
}

function firstNonEmptyStatusArray(item: CargoItem): unknown[] | undefined {
    const c = item as Record<string, unknown>;
    for (const k of ["Statuses", "statuses", "Steps", "steps", "Статусы", "stages"] as const) {
        const v = c[k];
        if (Array.isArray(v) && v.length > 0) return v;
    }
    return undefined;
}

/**
 * Дата поступления на склад отправления («Получена в MSK» и т.д.), не «Получена информация».
 * Если в объекте перевозки есть массив статусов от API — берём оттуда.
 */
export function getWarehouseReceiptDateForSla(item: CargoItem): string | undefined {
    const rows = firstNonEmptyStatusArray(item);
    if (!rows) return undefined;
    const fromCity = cityToCode(item.CitySender) || "—";
    const wantLabel = `Получена в ${fromCity}`;
    for (const el of rows) {
        const raw = el as Record<string, unknown>;
        const rawLabel = raw?.Stage ?? raw?.Name ?? raw?.Status ?? raw?.label ?? "";
        const labelStr = typeof rawLabel === "string" ? rawLabel : String(rawLabel ?? "");
        const displayLabel = mapTimelineStageLabel(labelStr, item);
        if (displayLabel !== wantLabel) continue;
        const dateRaw = raw?.Date ?? raw?.date ?? raw?.DatePrih ?? raw?.DateVr;
        const date = dateRaw != null ? String(dateRaw).trim() : "";
        if (date) return date;
    }
    return undefined;
}

/** Базовая дата для SLA: склад отправления, иначе DatePrih из списка. */
export function getSlaPlanAnchorDateString(item: CargoItem): string | undefined {
    const wh = getWarehouseReceiptDateForSla(item);
    const dp = item.DatePrih ? String(item.DatePrih).trim() : "";
    return wh || dp || undefined;
}

/** Крайний срок по плану (мс): якорная дата + плановые дни маршрута. */
export function getSlaPlanDeadlineMs(item: CargoItem): number {
    const anchor = getSlaPlanAnchorDateString(item);
    if (!anchor) return 0;
    const t = new Date(anchor).getTime();
    if (Number.isNaN(t)) return 0;
    return t + getPlanDays(item) * 24 * 60 * 60 * 1000;
}

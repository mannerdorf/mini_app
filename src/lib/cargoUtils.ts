/**
 * Shared cargo/SLA helpers used by CargoPage, DashboardPage, CargoDetailsModal.
 */
import { cityToCode } from "./formatUtils";
import { getFilterKeyByStatus } from "./statusUtils";
import { workingDaysBetween, workingDaysInPlan, type WorkSchedule } from "./slaWorkSchedule";
import { mapTimelineStageLabel } from "./perevozkaDetails";
import type { CargoItem } from "../types";

/** Плановые сроки доставки (дней): MSK-KGD авто 7 / паром 20; KGD-MSK авто и паром 60 */
export const AUTO_PLAN_DAYS = 7;
export const FERRY_PLAN_DAYS = 20;
export const KGD_MSK_PLAN_DAYS = 60;

export function isFerry(item: CargoItem): boolean {
    return item?.AK === true || item?.AK === 'true' || item?.AK === '1' || item?.AK === 1;
}

export function isRouteKgdMsk(item: CargoItem): boolean {
    return cityToCode(item.CitySender) === 'KGD' && cityToCode(item.CityReceiver) === 'MSK';
}

export function getPlanDays(item: CargoItem): number {
    if (isRouteKgdMsk(item)) return KGD_MSK_PLAN_DAYS;
    return isFerry(item) ? FERRY_PLAN_DAYS : AUTO_PLAN_DAYS;
}

export function getInnFromCargo(item: CargoItem): string | null {
    const inn = (item?.INN ?? item?.Inn ?? item?.inn ?? "").toString().trim();
    return inn.length > 0 ? inn : null;
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

/** SLA: начало интервала — день после якорной даты поступления на склад («Получена в …» из статусов или DatePrih).
 * Для статусов «Готов к выдаче» и «На доставке» при наличии рабочего графика заказчика
 * считаются только рабочие дни и часы (нерабочее время не входит в SLA).
 */
export function getSlaInfo(
    item: CargoItem,
    workScheduleByInn?: Record<string, WorkSchedule>
): { planDays: number; actualDays: number; onTime: boolean; delayDays: number } | null {
    const anchorRaw = getSlaPlanAnchorDateString(item);
    const fromDate = anchorRaw ? new Date(anchorRaw) : null;
    const toDate = item?.DateVr ? new Date(item.DateVr) : null;
    if (!fromDate || isNaN(fromDate.getTime()) || !toDate || isNaN(toDate.getTime())) return null;
    fromDate.setDate(fromDate.getDate() + 1);
    const planDays = getPlanDays(item);
    const statusKey = getFilterKeyByStatus(item.State);
    const useWorkSchedule = (statusKey === "ready" || statusKey === "delivering") && workScheduleByInn;
    const inn = getInnFromCargo(item);
    const schedule = useWorkSchedule && inn ? workScheduleByInn[inn] : undefined;

    let actualDays: number;
    let planWorkingDays: number;
    if (schedule) {
        actualDays = Math.round(workingDaysBetween(fromDate, toDate, schedule) * 10) / 10;
        planWorkingDays = Math.round(workingDaysInPlan(fromDate, planDays, schedule) * 10) / 10;
    } else {
        const from = fromDate.getTime();
        const to = toDate.getTime();
        actualDays = Math.round((to - from) / (24 * 60 * 60 * 1000));
        planWorkingDays = planDays;
    }
    const onTime = actualDays <= planWorkingDays;
    const delayDays = Math.max(0, Math.round((actualDays - planWorkingDays) * 10) / 10);
    return { planDays: planWorkingDays, actualDays, onTime, delayDays };
}

/** Ключи и шаблоны имён полей API — только место/пункт назначения (не отправитель). */
const DESTINATION_FIELD_KEY_RES = [
    /^cityreceiver$/,
    /^пунктназнач/,
    /^пунктполуч/,
    /^пунктдостав/,
    /^пунктвыдач/,
    /^адресдостав/,
    /^адресполуч/,
    /^городназнач/,
    /^lmpoint$/,
    /^lmaddress$/,
    /^destination/,
    /^receiverpoint$/,
];

function isDestinationFieldKey(key: string): boolean {
    const k = key.trim().toLowerCase();
    if (!k) return false;
    return DESTINATION_FIELD_KEY_RES.some((re) => re.test(k));
}

/**
 * Текст места назначения (пункт / адрес доставки).
 * Включён Receiver: в выдаче API часто там строка вида «… Железнодорожная 12», без отдельного поля улицы.
 */
export function cargoDestinationHaystack(item: CargoItem): string {
    const rec = item as Record<string, unknown>;
    const parts: string[] = [];
    const push = (v: unknown) => {
        if (v == null) return;
        const s = String(v).trim();
        if (s) parts.push(s);
    };

    const explicitKeys = [
        "CityReceiver",
        "ГородНазначения",
        "ПунктНазначенияНаименование",
        "ПунктПолученияНаименование",
        "ПунктНазначения",
        "ПунктНазначенияГородАэропорт",
        "ПунктДоставки",
        "ПунктПолучения",
        "ПунктВыдачи",
        "ПунктВыдачиНаименование",
        "АдресДоставки",
        "АдресПолучения",
        "LMPoint",
        "LMAddress",
        "DestinationPoint",
        "ReceiverPoint",
        "Receiver",
        "receiver",
    ] as const;
    for (const k of explicitKeys) {
        push(rec[k]);
    }

    for (const [k, v] of Object.entries(rec)) {
        if (typeof v !== "string" || !v.trim()) continue;
        if (!isDestinationFieldKey(k)) continue;
        push(v);
    }
    return parts.join("\n");
}

/**
 * Самовывоз: в пункте назначения встречается «Андреевское» / «Андреевск…»
 * или «Железнодорожн…» (в т.ч. «Железнодорожная 12»). Иначе — доставка.
 * Нет текста по назначению — доставка.
 */
export function cargoLastMileIsSelfPickup(item: CargoItem): boolean {
    const raw = cargoDestinationHaystack(item);
    if (!raw.trim()) return false;
    const t = raw.toLowerCase().replace(/ё/g, "е");
    return t.includes("андреевск") || t.includes("железнодорожн");
}

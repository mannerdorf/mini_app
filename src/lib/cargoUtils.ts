/**
 * Shared cargo/SLA helpers used by CargoPage, DashboardPage, CargoDetailsModal.
 */
import { cityToCode } from "./formatUtils";
import { getFilterKeyByStatus } from "./statusUtils";
import { workingDaysBetween, workingDaysInPlan, type WorkSchedule } from "./slaWorkSchedule";
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

/** SLA: начало расчёта — дата приёмки + 1 день (не с даты приёмки).
 * Для статусов «Готов к выдаче» и «На доставке» при наличии рабочего графика заказчика
 * считаются только рабочие дни и часы (нерабочее время не входит в SLA).
 */
export function getSlaInfo(
    item: CargoItem,
    workScheduleByInn?: Record<string, WorkSchedule>
): { planDays: number; actualDays: number; onTime: boolean; delayDays: number } | null {
    const fromDate = item?.DatePrih ? new Date(item.DatePrih) : null;
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

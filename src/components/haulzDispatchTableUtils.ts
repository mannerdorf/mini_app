import type { CargoItem } from "../types";
import { parseDateOnly } from "../lib/dateUtils";
import { getFilterKeyByStatus } from "../lib/statusUtils";
import { getSlaInfo } from "../lib/cargoUtils";
import type { WorkSchedule } from "../lib/slaWorkSchedule";

/**
 * Дата, по которой API `/api/sendings` отфильтровывает перевозку в период (см. `pickDate` в api/sendings.ts).
 */
function pickApiFilterDateRaw(cargo: CargoItem): unknown {
    const c = cargo as Record<string, unknown>;
    return (
        c.DateOtpr ??
        c.DateSend ??
        c.DateShipment ??
        c.ShipmentDate ??
        c.DateDoc ??
        c.Date ??
        c.date ??
        c.ДатаОтправки ??
        c.Дата ??
        c.DatePrih ??
        c.DateVr
    );
}

function normalizeDateOnlyForCell(raw: unknown): string {
    const s = String(raw ?? "").trim();
    if (!s) return "";
    const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    const ruMatch = s.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\D.*)?$/);
    if (ruMatch) return `${ruMatch[3]}-${ruMatch[2]}-${ruMatch[1]}`;
    const parsed = parseDateOnly(s);
    if (parsed) return parsed.toISOString().split("T")[0];
    const fallback = new Date(s);
    if (Number.isNaN(fallback.getTime())) return "";
    return fallback.toISOString().split("T")[0];
}

export function formatDispatchFilterDateCell(cargo: CargoItem): string {
    const d = normalizeDateOnlyForCell(pickApiFilterDateRaw(cargo));
    return d || "—";
}

export function dispatchStatusDateSortKey(cargo: CargoItem): string {
    return normalizeDateOnlyForCell(pickApiFilterDateRaw(cargo)) || "9999-12-31";
}

/** SLA как в списке грузов; для незавершённых без DateVr — конец интервала «сегодня». */
function getDispatchRowSla(item: CargoItem, workScheduleByInn: Record<string, WorkSchedule>) {
    let sla = getSlaInfo(item, workScheduleByInn);
    if (sla) return sla;
    const statusKey = getFilterKeyByStatus(String(item.State ?? ""));
    if (statusKey === "delivered") return null;
    if (!item.DatePrih || !String(item.DatePrih).trim()) return null;
    const vr = String(item.DateVr ?? "").trim();
    if (vr) return null;
    const todayStr = new Date().toISOString().split("T")[0];
    return getSlaInfo({ ...item, DateVr: todayStr }, workScheduleByInn);
}

export function rowIsOutsideSla(item: CargoItem, workScheduleByInn: Record<string, WorkSchedule>): boolean {
    const sla = getDispatchRowSla(item, workScheduleByInn);
    return sla != null && !sla.onTime;
}

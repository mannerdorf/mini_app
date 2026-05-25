/**
 * Shared cargo/SLA helpers used by CargoPage, DashboardPage, CargoDetailsModal.
 */
import { cityToCode } from "./formatUtils";
import { getFilterKeyByStatus } from "./statusUtils";
import { workingDaysBetween, workingDaysInPlan, type WorkSchedule } from "./slaWorkSchedule";
import { mapTimelineStageLabel } from "./perevozkaDetails";
import type { CargoItem } from "../types";
import type { PerevozkiRole } from "../types";

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

export type CargoRoleFilterKey = "all" | "customer" | "sender" | "receiver";

export const CARGO_ROLE_FILTER_LABELS: Record<CargoRoleFilterKey, string> = {
    all: "Все",
    customer: "Заказчик",
    sender: "Отправитель",
    receiver: "Получатель",
};

/** Все роли контрагента по перевозке (из API mode или из _roles после merge). */
export function getCargoRoleSet(item: CargoItem): Set<PerevozkiRole> {
    const fromArray = item._roles?.filter(Boolean);
    if (fromArray?.length) return new Set(fromArray);
    if (item._role) return new Set([item._role]);
    return new Set();
}

/** Приоритет отображения: заказчик, если есть хотя бы одна роль заказчика. */
export function pickCargoDisplayRole(roles: Iterable<PerevozkiRole>): PerevozkiRole | undefined {
    const set = roles instanceof Set ? roles : new Set(roles);
    if (set.size === 0) return undefined;
    if (set.has("Customer")) return "Customer";
    if (set.has("Sender")) return "Sender";
    return "Receiver";
}

export function getCargoDisplayRoleLabel(item: CargoItem): string {
    const roles = getCargoRoleSet(item);
    if (roles.has("Customer")) return "Заказчик";
    const hasSender = roles.has("Sender");
    const hasReceiver = roles.has("Receiver");
    if (hasSender && hasReceiver) return "Отправитель · Получатель";
    if (hasSender) return "Отправитель";
    if (hasReceiver) return "Получатель";
    return "";
}

/** Клиентский фильтр «Роль»: отправитель/получатель без заказчика; заказчик — всегда «Заказчик». */
export function cargoMatchesRoleFilter(item: CargoItem, filter: CargoRoleFilterKey): boolean {
    if (filter === "all") return true;
    const roles = getCargoRoleSet(item);
    if (filter === "customer") return roles.has("Customer");
    if (filter === "sender") return roles.has("Sender") && !roles.has("Customer");
    if (filter === "receiver") return roles.has("Receiver") && !roles.has("Customer");
    return true;
}

export function unionCargoRoles(a: CargoItem, b: CargoItem): PerevozkiRole[] {
    return [...new Set([...getCargoRoleSet(a), ...getCargoRoleSet(b)])];
}

export function applyCargoRolesToItem(item: CargoItem, roles: Iterable<PerevozkiRole>): CargoItem {
    const roleSet = roles instanceof Set ? roles : new Set(roles);
    const rolesArr = [...roleSet];
    const displayRole = pickCargoDisplayRole(roleSet);
    return {
        ...item,
        ...(rolesArr.length ? { _roles: rolesArr } : {}),
        ...(displayRole ? { _role: displayRole } : {}),
    };
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

/** Явные ключи API для пункта назначения (общий список для haystack и слияния ролей). */
export const CARGO_DESTINATION_EXPLICIT_KEYS = [
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

const MSK_KGD_SELF_PICKUP_RECEIVER_ID = "d5d52d44-c5d9-11f0-9e9d-0cc47a39bad5";
const KGD_MSK_SELF_PICKUP_RECEIVER_ID = "419df7bb-4874-11f1-9e9f-0cc47a39bad5";

function normalizePzvText(value: unknown): string {
    return String(value ?? "").toLowerCase().replace(/ё/g, "е");
}

function pickRicherDestinationString(primary: string, secondary: string): string {
    if (!secondary.trim()) return primary;
    if (!primary.trim()) return secondary;
    const p = primary.trim();
    const s = secondary.trim();
    if (s.length > p.length + 6) return s;
    if (p.length > s.length + 6) return p;
    return p;
}

/**
 * При дедупликации одной перевозки по Mode (Customer / Sender / Receiver) 1С отдаёт разный состав полей.
 * Выигрышная запись могла остаться только с CityReceiver=Калининград/МСК/КГД, а «Железнодорожная…» — в Receiver / другой роли.
 * Сливаем поля назначения до «обогащения» маршрута кодами MSK/KGD в UI.
 */
export function mergePerevozkiRoleDuplicates(winner: CargoItem, loser: CargoItem): CargoItem {
    const w = winner as Record<string, unknown>;
    const l = loser as Record<string, unknown>;
    const out: Record<string, unknown> = { ...l, ...w };
    const role = winner._role;

    for (const k of CARGO_DESTINATION_EXPLICIT_KEYS) {
        const ws = w[k] != null ? String(w[k]).trim() : "";
        const ls = l[k] != null ? String(l[k]).trim() : "";
        if (!ws && !ls) continue;
        out[k] = pickRicherDestinationString(ws, ls);
    }

    for (const [k, v] of Object.entries(l)) {
        if (typeof v !== "string" || !v.trim()) continue;
        if (!isDestinationFieldKey(k)) continue;
        const ws = w[k] != null ? String(w[k]).trim() : "";
        const ls = String(v).trim();
        out[k] = pickRicherDestinationString(ws, ls);
    }

    if (role !== undefined) out._role = role;
    const mergedRoles = unionCargoRoles(winner, loser);
    if (mergedRoles.length) {
        out._roles = mergedRoles;
        const displayRole = pickCargoDisplayRole(mergedRoles);
        if (displayRole) out._role = displayRole;
    }
    return out as CargoItem;
}

export function cargoLastMileIsSelfPickup(item: CargoItem): boolean {
    const record = item as Record<string, unknown>;
    const receiverId = String(record.PZV_Receiver_Id ?? "").trim().toLowerCase();
    const pzvReceiver = normalizePzvText(record.PZV_Receiver);
    const from = cityToCode(item.CitySender);
    const to = cityToCode(item.CityReceiver);
    if (from === "MSK" && to === "KGD") {
        return receiverId === MSK_KGD_SELF_PICKUP_RECEIVER_ID || pzvReceiver.includes("железнодорожная");
    }
    if (from === "KGD" && to === "MSK") {
        return receiverId === KGD_MSK_SELF_PICKUP_RECEIVER_ID || pzvReceiver.includes("андреевское");
    }
    return false;
}

export function cargoPickupLogisticsIsTerminalTo(item: CargoItem): boolean {
    const record = item as Record<string, unknown>;
    const pzvSender = normalizePzvText(record.PZV_Sender);
    const from = cityToCode(item.CitySender);
    const to = cityToCode(item.CityReceiver);
    if (from === "MSK" && to === "KGD") return pzvSender.includes("андреевское");
    if (from === "KGD" && to === "MSK") return pzvSender.includes("железнодорожная");
    return false;
}

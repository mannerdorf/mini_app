import { useCallback, useEffect, useMemo, type Dispatch, type SetStateAction } from "react";
import * as dateUtils from "../../../lib/dateUtils";
import { getFilterKeyByStatus, getPaymentFilterKey } from "../../../lib/statusUtils";
import type { CargoStatusFilterKey, RouteFilterKey, SharedBillStatusKey, TypeFilterKey } from "../../../lib/sharedListFilters";
import { resolveDashboardActiveFilters } from "../../../lib/sharedListFilters";
import { getInnFromCargo, type CargoRoleFilterKey } from "../../../lib/cargoUtils";
import { getCargoTransportType, type CargoTransportType } from "../../../lib/cargoTransportType";
import { buildFilteredCargoItems } from "../../../pages/cargoPipeline";
import { cityToCode } from "../../../lib/formatUtils";
import { filterCargoItemsForHeaderCustomer } from "../../../features/documents/lib/documentsPipeline";
import { fetchCustomerWorkSchedules } from "../../../api/client/scheduling";
import type { WorkSchedule } from "../../../lib/slaWorkSchedule";
import type { AuthData, CargoItem } from "../../../types";
import { cargoFlowSelectionEqual, type CargoFlowTableSelection } from "../dashboardTypes";
import {
    parseDashboardDateOnly,
    getManualPlannedDate,
    getSendingStartDate,
    getActualDeliveryDate,
} from "./dashboardCargoDateHelpers";

const { isDateInRange } = dateUtils;

export type UseDashboardCargoMetricsParams = {
    auth: AuthData;
    useServiceRequest: boolean;
    runtimeActiveInn: string | undefined;
    activeCustomerName: string | undefined;
    billStatusFilterSet: Set<SharedBillStatusKey>;
    typeFilterSet: Set<TypeFilterKey>;
    routeFilterSet: Set<RouteFilterKey>;
    roleFilter: CargoRoleFilterKey;
    apiDateRange: { dateFrom: string; dateTo: string };
    items: CargoItem[];
    deliveryFactLookupItems: CargoItem[];
    prevPeriodItems: CargoItem[];
    setWorkScheduleByInn: Dispatch<SetStateAction<Record<string, WorkSchedule>>>;
    cargoFlowTableExpanded: boolean;
    cargoFlowTableSelection: CargoFlowTableSelection | null;
    setCargoFlowTableExpanded: (expanded: boolean) => void;
    setCargoFlowTableSelection: (selection: CargoFlowTableSelection | null) => void;
};

export function useDashboardCargoMetrics({
    auth,
    useServiceRequest,
    runtimeActiveInn,
    activeCustomerName,
    billStatusFilterSet,
    typeFilterSet,
    routeFilterSet,
    roleFilter,
    apiDateRange,
    items,
    deliveryFactLookupItems,
    prevPeriodItems,
    setWorkScheduleByInn,
    cargoFlowTableExpanded,
    cargoFlowTableSelection,
    setCargoFlowTableExpanded,
    setCargoFlowTableSelection,
}: UseDashboardCargoMetricsParams) {
    const activeListFilters = useMemo(
        () =>
            resolveDashboardActiveFilters({
                useServiceRequest,
                billStatusFilterSet,
                typeFilterSet,
                routeFilterSet,
            }),
        [useServiceRequest, billStatusFilterSet, typeFilterSet, routeFilterSet],
    );

    const filterCargoItems = useCallback(
        (source: CargoItem[]) => {
            const filtered = buildFilteredCargoItems({
                items: source,
                searchText: "",
                statusFilterSet: new Set<CargoStatusFilterKey>(),
                senderFilter: "",
                receiverFilter: "",
                transportFilter: "",
                useServiceRequest: !!useServiceRequest,
                billStatusFilterSet: activeListFilters.billStatusFilterSet,
                typeFilterSet: activeListFilters.typeFilterSet,
                routeFilterSet: activeListFilters.routeFilterSet,
                lastMileFilter: "all",
                pickupLogisticsFilter: "all",
                roleFilter: "all",
                sortBy: null,
                sortOrder: "desc",
            });
            if (useServiceRequest) return filtered;
            return filterCargoItemsForHeaderCustomer(filtered, {
                activeInn: auth?.inn ?? runtimeActiveInn,
                activeCustomerName,
            });
        },
        [
            useServiceRequest,
            activeListFilters,
            auth?.inn,
            runtimeActiveInn,
            activeCustomerName,
        ],
    );

    const filteredCargoItems = useMemo(() => filterCargoItems(items), [items, filterCargoItems]);

    const unpaidCount = useMemo(
        () => filteredCargoItems.filter((item) => getPaymentFilterKey(item.StateBill) === "unpaid").length,
        [filteredCargoItems],
    );

    const readyCount = useMemo(
        () => filteredCargoItems.filter((item) => getFilterKeyByStatus(item.State) === "ready").length,
        [filteredCargoItems],
    );

    const dashboardTotalItems = useMemo(() => filteredCargoItems, [filteredCargoItems]);

    const deliveryFactItems = useMemo(
        () => filterCargoItems(useServiceRequest ? deliveryFactLookupItems : items),
        [deliveryFactLookupItems, items, useServiceRequest, filterCargoItems],
    );

    const slaMonitorFilteredItems = useMemo(() => {
        return deliveryFactItems.filter(
            (i) =>
                getFilterKeyByStatus(i.State) === "delivered"
                && isDateInRange(String(i.DateVr ?? "").trim() || undefined, apiDateRange.dateFrom, apiDateRange.dateTo),
        );
    }, [deliveryFactItems, apiDateRange.dateFrom, apiDateRange.dateTo]);

    const getRouteTypePlanDays = useMemo(() => {
        const dayMs = 24 * 60 * 60 * 1000;
        const byBucket = new Map<string, Array<{ actualMs: number; days: number }>>();
        const routeKeyFor = (item: CargoItem): string => {
            const from = cityToCode(item.CitySender) || String(item.CitySender ?? "").trim().toUpperCase() || "—";
            const to = cityToCode(item.CityReceiver) || String(item.CityReceiver ?? "").trim().toUpperCase() || "—";
            return `${from}-${to}`;
        };
        const typeKeyFor = (item: CargoItem): CargoTransportType => getCargoTransportType(item);
        (items || []).forEach((item) => {
            const start = getSendingStartDate(item);
            const actual = getActualDeliveryDate(item);
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
    }, [items]);

    const getEffectivePlannedDate = useCallback(
        (item: CargoItem): Date | null => {
            const manual = getManualPlannedDate(item);
            if (manual) return manual;
            const start = getSendingStartDate(item);
            if (!start) return null;
            const from = cityToCode(item.CitySender) || String(item.CitySender ?? "").trim().toUpperCase() || "—";
            const to = cityToCode(item.CityReceiver) || String(item.CityReceiver ?? "").trim().toUpperCase() || "—";
            const type = getCargoTransportType(item);
            const days = getRouteTypePlanDays.get(`${from}-${to}|${type}`);
            if (!days) return null;
            const planned = new Date(start);
            planned.setDate(planned.getDate() + days);
            return planned;
        },
        [getRouteTypePlanDays],
    );

    const cargoFlowByPlan = useMemo(() => {
        const dateToKey = (date: Date): string =>
            `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
        const getPlannedKey = (item: CargoItem): string | null => {
            const planned = getEffectivePlannedDate(item);
            return planned ? dateToKey(planned) : null;
        };
        const getActualKey = (item: CargoItem): string | null => {
            const candidates = [
                (item as Record<string, unknown>).DateVr,
                (item as Record<string, unknown>).DateDeliveryFact,
                (item as Record<string, unknown>).FactDeliveryDate,
                (item as Record<string, unknown>).ДатаФактическойДоставки,
                (item as Record<string, unknown>).ДатаВручения,
            ];
            for (const candidate of candidates) {
                const parsed = parseDashboardDateOnly(candidate);
                const key = parsed ? dateToKey(parsed) : null;
                if (key) return key;
            }
            return null;
        };
        const toNumber = (value: unknown) => {
            const raw = String(value ?? "").trim().replace(",", ".");
            const n = Number(raw);
            return Number.isFinite(n) ? n : 0;
        };

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayKey = dateToKey(today);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowKey = dateToKey(tomorrow);
        const horizon = new Date(today);
        horizon.setDate(horizon.getDate() + 7);
        const horizonKey = dateToKey(horizon);

        let withPlan = 0;
        let withoutPlan = 0;
        let overdue = 0;
        let dueToday = 0;
        let dueTomorrow = 0;
        let dueNext7 = 0;
        let deliveredOnTime = 0;
        let deliveredLate = 0;
        const emptyTransportStats = () => ({ count: 0, pw: 0, mest: 0, vol: 0 });
        const byDate = new Map<
            string,
            {
                count: number;
                pw: number;
                mest: number;
                vol: number;
                ferry: { count: number; pw: number; mest: number; vol: number };
                auto: { count: number; pw: number; mest: number; vol: number };
                air: { count: number; pw: number; mest: number; vol: number };
            }
        >();

        dashboardTotalItems.forEach((item) => {
            const plannedKey = getPlannedKey(item);
            if (!plannedKey) {
                withoutPlan += 1;
                return;
            }
            withPlan += 1;
            const entry = byDate.get(plannedKey) ?? {
                count: 0,
                pw: 0,
                mest: 0,
                vol: 0,
                ferry: emptyTransportStats(),
                auto: emptyTransportStats(),
                air: emptyTransportStats(),
            };
            const mest = toNumber(item.Mest);
            const pw = toNumber(item.PW);
            const vol = toNumber((item as Record<string, unknown>).Value ?? (item as Record<string, unknown>).Volume ?? (item as Record<string, unknown>).V);
            const transportKey = getCargoTransportType(item);
            entry.count += 1;
            entry.pw += pw;
            entry.mest += mest;
            entry.vol += vol;
            entry[transportKey].count += 1;
            entry[transportKey].pw += pw;
            entry[transportKey].mest += mest;
            entry[transportKey].vol += vol;
            byDate.set(plannedKey, entry);

            const statusKey = getFilterKeyByStatus(item.State);
            const isDelivered = statusKey === "delivered";
            if (!isDelivered) {
                if (plannedKey < todayKey) overdue += 1;
                else if (plannedKey === todayKey) dueToday += 1;
                else if (plannedKey === tomorrowKey) dueTomorrow += 1;
                else if (plannedKey <= horizonKey) dueNext7 += 1;
            } else {
                const actualKey = getActualKey(item);
                if (!actualKey) return;
                if (actualKey <= plannedKey) deliveredOnTime += 1;
                else deliveredLate += 1;
            }
        });

        const upcomingSeries = Array.from({ length: 7 }).map((_, idx) => {
            const date = new Date(today);
            date.setDate(date.getDate() + idx);
            const key = dateToKey(date);
            const values = byDate.get(key) ?? {
                count: 0,
                pw: 0,
                mest: 0,
                vol: 0,
                ferry: emptyTransportStats(),
                auto: emptyTransportStats(),
                air: emptyTransportStats(),
            };
            return {
                key,
                count: values.count,
                pw: values.pw,
                mest: values.mest,
                vol: values.vol,
                ferry: values.ferry,
                auto: values.auto,
                air: values.air,
            };
        });

        return {
            total: dashboardTotalItems.length,
            withPlan,
            withoutPlan,
            overdue,
            dueToday,
            dueTomorrow,
            dueNext7,
            deliveredOnTime,
            deliveredLate,
            upcomingSeries,
        };
    }, [dashboardTotalItems, getEffectivePlannedDate]);

    useEffect(() => {
        if (!useServiceRequest || !auth?.login || !auth?.password || dashboardTotalItems.length === 0) return;
        const inns = [...new Set(dashboardTotalItems.map((i) => getInnFromCargo(i)).filter((x): x is string => !!x))];
        if (inns.length === 0) return;
        let cancelled = false;
        fetchCustomerWorkSchedules({ login: auth.login, password: auth.password }, inns)
            .then(({ items: scheduleItems }) => {
                if (cancelled) return;
                const ws: Record<string, WorkSchedule> = {};
                scheduleItems.forEach((r) => {
                    if (r?.inn) {
                        ws[r.inn.trim()] = {
                            days_of_week: r.days_of_week ?? [1, 2, 3, 4, 5],
                            work_start: r.work_start || "09:00",
                            work_end: r.work_end || "18:00",
                        };
                    }
                });
                if (!cancelled) setWorkScheduleByInn((prev) => ({ ...prev, ...ws }));
            })
            .catch(() => {
                /* ignore */
            });
        return () => {
            cancelled = true;
        };
    }, [useServiceRequest, auth?.login, auth?.password, dashboardTotalItems, setWorkScheduleByInn]);

    const dashboardTotalPrevPeriodItems = useMemo(() => {
        if (!useServiceRequest || prevPeriodItems.length === 0) return [] as CargoItem[];
        return filterCargoItems(prevPeriodItems);
    }, [prevPeriodItems, useServiceRequest, filterCargoItems]);

    const cargoFlowDetailItems = useMemo(() => {
        if (!cargoFlowTableExpanded || !cargoFlowTableSelection) return [] as CargoItem[];
        const dateToKey = (date: Date): string =>
            `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayKey = dateToKey(today);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowKey = dateToKey(tomorrow);
        const horizon = new Date(today);
        horizon.setDate(horizon.getDate() + 7);
        const horizonKey = dateToKey(horizon);
        const getPlannedKey = (item: CargoItem): string | null => {
            const planned = getEffectivePlannedDate(item);
            return planned ? dateToKey(planned) : null;
        };
        const isUndelivered = (item: CargoItem) => getFilterKeyByStatus(item.State) !== "delivered";
        const sel = cargoFlowTableSelection;
        return dashboardTotalItems.filter((item) => {
            const plannedKey = getPlannedKey(item);
            if (sel.kind === "tile") {
                if (!plannedKey) return false;
                return plannedKey === sel.dateKey;
            }
            switch (sel.badge) {
                case "withoutPlan":
                    return !plannedKey;
                case "withPlan":
                    return !!plannedKey;
                case "overdue":
                    if (!plannedKey || !isUndelivered(item)) return false;
                    return plannedKey < todayKey;
                case "dueToday":
                    if (!plannedKey || !isUndelivered(item)) return false;
                    return plannedKey === todayKey;
                case "dueTomorrow":
                    if (!plannedKey || !isUndelivered(item)) return false;
                    return plannedKey === tomorrowKey;
                case "dueNext7":
                    if (!plannedKey || !isUndelivered(item)) return false;
                    return plannedKey > tomorrowKey && plannedKey <= horizonKey;
                default:
                    return false;
            }
        });
    }, [dashboardTotalItems, cargoFlowTableExpanded, cargoFlowTableSelection, getEffectivePlannedDate]);

    const cargoFlowDetailSorted = useMemo(() => {
        return [...cargoFlowDetailItems].sort((a, b) => {
            const ka = getEffectivePlannedDate(a)?.getTime() ?? 0;
            const kb = getEffectivePlannedDate(b)?.getTime() ?? 0;
            if (ka !== kb) return ka - kb;
            return String(a.Number ?? "").localeCompare(String(b.Number ?? ""), "ru");
        });
    }, [cargoFlowDetailItems, getEffectivePlannedDate]);

    const onCargoFlowPick = useCallback(
        (sel: CargoFlowTableSelection) => {
            if (cargoFlowTableExpanded && cargoFlowSelectionEqual(cargoFlowTableSelection, sel)) {
                setCargoFlowTableExpanded(false);
                setCargoFlowTableSelection(null);
                return;
            }
            setCargoFlowTableSelection(sel);
            setCargoFlowTableExpanded(true);
        },
        [cargoFlowTableExpanded, cargoFlowTableSelection, setCargoFlowTableExpanded, setCargoFlowTableSelection],
    );

    return {
        filterCargoItems,
        filteredCargoItems,
        unpaidCount,
        readyCount,
        dashboardTotalItems,
        deliveryFactItems,
        slaMonitorFilteredItems,
        getRouteTypePlanDays,
        getEffectivePlannedDate,
        cargoFlowByPlan,
        dashboardTotalPrevPeriodItems,
        cargoFlowDetailItems,
        cargoFlowDetailSorted,
        onCargoFlowPick,
    };
}

export type DashboardCargoMetricsState = ReturnType<typeof useDashboardCargoMetrics>;

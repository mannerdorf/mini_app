import { useMemo } from "react";
import { cargoLastMileIsSelfPickup, cargoPickupLogisticsIsTerminalTo } from "../../../lib/cargoUtils";
import type { CombinedLogisticsBucketKey } from "../dashboardTypes";
import type { CargoItem } from "../../../types";

function cargoToNum(value: unknown): number {
    const n = typeof value === "string" ? parseFloat(value.replace(",", ".")) : Number(value ?? 0);
    return Number.isFinite(n) ? n : 0;
}

export type UseDashboardLogisticsMetricsParams = {
    dashboardTotalItems: CargoItem[];
    selectedCombinedLogisticsKey: CombinedLogisticsBucketKey | null;
};

export function useDashboardLogisticsMetrics({
    dashboardTotalItems,
    selectedCombinedLogisticsKey,
}: UseDashboardLogisticsMetricsParams) {
    const lastMileTerminalLoad = useMemo(() => {
        const makeBucket = (key: "selfPickup" | "delivery", label: string, color: string) => ({
            key,
            label,
            color,
            count: 0,
            w: 0,
            vol: 0,
            pw: 0,
            mest: 0,
            sum: 0,
        });
        const selfPickup = makeBucket("selfPickup", "Самовывоз", "#2563eb");
        const delivery = makeBucket("delivery", "Доставка", "#10b981");
        dashboardTotalItems.forEach((item) => {
            const bucket = cargoLastMileIsSelfPickup(item) ? selfPickup : delivery;
            bucket.count += 1;
            bucket.w += cargoToNum(item.W);
            bucket.vol += cargoToNum((item as Record<string, unknown>).Value ?? (item as Record<string, unknown>).Volume ?? (item as Record<string, unknown>).V);
            bucket.pw += cargoToNum(item.PW);
            bucket.mest += cargoToNum(item.Mest);
            bucket.sum += cargoToNum(item.Sum);
        });
        const totals = {
            count: selfPickup.count + delivery.count,
            w: selfPickup.w + delivery.w,
            vol: selfPickup.vol + delivery.vol,
            pw: selfPickup.pw + delivery.pw,
            mest: selfPickup.mest + delivery.mest,
            sum: selfPickup.sum + delivery.sum,
        };
        return { rows: [selfPickup, delivery], totals };
    }, [dashboardTotalItems]);

    const pickupLogisticsLoad = useMemo(() => {
        const makeBucket = (key: "pickup" | "terminalTo", label: string, color: string) => ({
            key,
            label,
            color,
            count: 0,
            w: 0,
            vol: 0,
            pw: 0,
            mest: 0,
            sum: 0,
        });
        const pickup = makeBucket("pickup", "PickUP", "#f59e0b");
        const terminalTo = makeBucket("terminalTo", "terminal-to", "#7c3aed");
        dashboardTotalItems.forEach((item) => {
            const bucket = cargoPickupLogisticsIsTerminalTo(item) ? terminalTo : pickup;
            bucket.count += 1;
            bucket.w += cargoToNum(item.W);
            bucket.vol += cargoToNum((item as Record<string, unknown>).Value ?? (item as Record<string, unknown>).Volume ?? (item as Record<string, unknown>).V);
            bucket.pw += cargoToNum(item.PW);
            bucket.mest += cargoToNum(item.Mest);
            bucket.sum += cargoToNum(item.Sum);
        });
        const totals = {
            count: pickup.count + terminalTo.count,
            w: pickup.w + terminalTo.w,
            vol: pickup.vol + terminalTo.vol,
            pw: pickup.pw + terminalTo.pw,
            mest: pickup.mest + terminalTo.mest,
            sum: pickup.sum + terminalTo.sum,
        };
        return { rows: [pickup, terminalTo], totals };
    }, [dashboardTotalItems]);

    const pickupByLastMileLoad = useMemo(() => {
        const makeBucket = (key: CombinedLogisticsBucketKey, label: string, color: string) => ({
            key,
            label,
            color,
            count: 0,
            w: 0,
            vol: 0,
            pw: 0,
            mest: 0,
            sum: 0,
            items: [] as CargoItem[],
        });
        const buckets = {
            terminalToSelfPickup: makeBucket("terminalToSelfPickup", "terminal-to - самовывоз", "#2563eb"),
            terminalToDelivery: makeBucket("terminalToDelivery", "terminal-to - доставка", "#7c3aed"),
            pickupSelfPickup: makeBucket("pickupSelfPickup", "PickUP - самовывоз", "#f59e0b"),
            pickupDelivery: makeBucket("pickupDelivery", "PickUP - доставка", "#10b981"),
        };
        dashboardTotalItems.forEach((item) => {
            const terminalTo = cargoPickupLogisticsIsTerminalTo(item);
            const selfPickup = cargoLastMileIsSelfPickup(item);
            const bucket = terminalTo
                ? selfPickup
                    ? buckets.terminalToSelfPickup
                    : buckets.terminalToDelivery
                : selfPickup
                  ? buckets.pickupSelfPickup
                  : buckets.pickupDelivery;
            bucket.count += 1;
            bucket.w += cargoToNum(item.W);
            bucket.vol += cargoToNum((item as Record<string, unknown>).Value ?? (item as Record<string, unknown>).Volume ?? (item as Record<string, unknown>).V);
            bucket.pw += cargoToNum(item.PW);
            bucket.mest += cargoToNum(item.Mest);
            bucket.sum += cargoToNum(item.Sum);
            bucket.items.push(item);
        });
        const rows = [
            buckets.terminalToSelfPickup,
            buckets.terminalToDelivery,
            buckets.pickupSelfPickup,
            buckets.pickupDelivery,
        ];
        const totals = rows.reduce(
            (acc, row) => ({
                count: acc.count + row.count,
                w: acc.w + row.w,
                vol: acc.vol + row.vol,
                pw: acc.pw + row.pw,
                mest: acc.mest + row.mest,
                sum: acc.sum + row.sum,
            }),
            { count: 0, w: 0, vol: 0, pw: 0, mest: 0, sum: 0 },
        );
        return { rows, totals };
    }, [dashboardTotalItems]);

    const selectedCombinedLogisticsBucket = useMemo(
        () => pickupByLastMileLoad.rows.find((row) => row.key === selectedCombinedLogisticsKey) ?? null,
        [pickupByLastMileLoad.rows, selectedCombinedLogisticsKey],
    );

    const combinedLogisticsCustomerRows = useMemo(() => {
        if (!selectedCombinedLogisticsBucket) return [];
        const byCustomer = new Map<
            string,
            {
                customer: string;
                items: CargoItem[];
                count: number;
                w: number;
                vol: number;
                pw: number;
                mest: number;
                sum: number;
            }
        >();
        selectedCombinedLogisticsBucket.items.forEach((item) => {
            const customer = String(item.Customer ?? (item as Record<string, unknown>).customer ?? "").trim() || "Без заказчика";
            const row = byCustomer.get(customer) ?? {
                customer,
                items: [],
                count: 0,
                w: 0,
                vol: 0,
                pw: 0,
                mest: 0,
                sum: 0,
            };
            row.items.push(item);
            row.count += 1;
            row.w += cargoToNum(item.W);
            row.vol += cargoToNum((item as Record<string, unknown>).Value ?? (item as Record<string, unknown>).Volume ?? (item as Record<string, unknown>).V);
            row.pw += cargoToNum(item.PW);
            row.mest += cargoToNum(item.Mest);
            row.sum += cargoToNum(item.Sum);
            byCustomer.set(customer, row);
        });
        return [...byCustomer.values()].sort(
            (a, b) => b.count - a.count || b.sum - a.sum || a.customer.localeCompare(b.customer, "ru"),
        );
    }, [selectedCombinedLogisticsBucket]);

    return {
        lastMileTerminalLoad,
        pickupLogisticsLoad,
        pickupByLastMileLoad,
        selectedCombinedLogisticsBucket,
        combinedLogisticsCustomerRows,
    };
}

export type DashboardLogisticsMetricsState = ReturnType<typeof useDashboardLogisticsMetrics>;

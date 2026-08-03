import { useCallback, useMemo } from "react";
import type { AuthData } from "../../../types";
import { useCargoTransportFilter, usePerevozki } from "../../../hooks/useApi";
import {
    buildCargoRouteByNumber,
    buildCargoStateByNumber,
    buildCargoSumByNumber,
    buildCargoTransportByNumber,
    buildTransportLinkedCargoNumbersInPeriod,
} from "../lib/documentsPipeline";
import { buildCargoSumPaidByNumber } from "../../../../lib/invoiceAmounts.js";

export type UseDocumentsCargoContextParams = {
    auth: AuthData;
    effectiveActiveInn?: string;
    serviceModeForCurrentDocSection: boolean;
    transportFilter: string;
    apiDateRange: { dateFrom: string; dateTo: string };
    perevozkiDateRange: { dateFrom: string; dateTo: string };
    perevozkiItemsBase: unknown[];
    sendingsItems: unknown[];
};

export function useDocumentsCargoContext({
    auth,
    effectiveActiveInn,
    serviceModeForCurrentDocSection,
    transportFilter,
    apiDateRange,
    perevozkiDateRange,
    perevozkiItemsBase,
    sendingsItems,
}: UseDocumentsCargoContextParams) {
    const normCargoKey = useCallback((num: string | null | undefined): string => {
        if (num == null) return "";
        const s = String(num).replace(/^0000-/, "").trim().replace(/^0+/, "") || "0";
        return s;
    }, []);

    const { cargoNumbers: dbTransportCargoNumbers, loading: dbTransportLoading } = useCargoTransportFilter({
        auth,
        vehicle: transportFilter,
        dateFrom: apiDateRange.dateFrom,
        dateTo: apiDateRange.dateTo,
        useServiceRequest: serviceModeForCurrentDocSection,
        enabled: !!serviceModeForCurrentDocSection && !!transportFilter,
    });

    const transportLinkedCargoNumbers = useMemo(() => {
        if (!serviceModeForCurrentDocSection || !transportFilter || dbTransportLoading) return undefined;
        if (dbTransportCargoNumbers.length > 0) {
            return new Set(dbTransportCargoNumbers.map((n) => normCargoKey(n)).filter(Boolean));
        }
        return buildTransportLinkedCargoNumbersInPeriod(
            sendingsItems,
            apiDateRange.dateFrom,
            apiDateRange.dateTo,
            transportFilter,
        );
    }, [
        serviceModeForCurrentDocSection,
        transportFilter,
        dbTransportCargoNumbers,
        dbTransportLoading,
        sendingsItems,
        apiDateRange.dateFrom,
        apiDateRange.dateTo,
        normCargoKey,
    ]);

    const includeCargoNumbersForTransport = useMemo(() => {
        if (!transportLinkedCargoNumbers?.size) return [];
        const existing = new Set(
            (perevozkiItemsBase || []).map((i: any) => normCargoKey(String(i?.Number ?? i?.number ?? ""))).filter(Boolean),
        );
        return [...transportLinkedCargoNumbers].filter((n) => !existing.has(n));
    }, [transportLinkedCargoNumbers, perevozkiItemsBase, normCargoKey]);

    const { items: transportLinkedPerevozkiItems } = usePerevozki({
        auth,
        dateFrom: perevozkiDateRange.dateFrom,
        dateTo: perevozkiDateRange.dateTo,
        inn: effectiveActiveInn || undefined,
        useServiceRequest: serviceModeForCurrentDocSection,
        includeCargoNumbers: includeCargoNumbersForTransport,
        enabled: !!serviceModeForCurrentDocSection && !!transportFilter && includeCargoNumbersForTransport.length > 0,
    });

    const perevozkiItems = useMemo(() => {
        if (!transportFilter || !transportLinkedPerevozkiItems.length) return perevozkiItemsBase || [];
        const byNumber = new Map<string, any>();
        for (const item of perevozkiItemsBase || []) {
            const key = normCargoKey(String((item as any)?.Number ?? (item as any)?.number ?? ""));
            if (key) byNumber.set(key, item);
        }
        for (const item of transportLinkedPerevozkiItems) {
            const key = normCargoKey(String((item as any)?.Number ?? (item as any)?.number ?? ""));
            if (key && !byNumber.has(key)) byNumber.set(key, item);
        }
        return Array.from(byNumber.values());
    }, [perevozkiItemsBase, transportLinkedPerevozkiItems, transportFilter, normCargoKey]);

    const cargoStateByNumber = useMemo(
        () => buildCargoStateByNumber(perevozkiItems || []),
        [perevozkiItems],
    );

    const cargoRouteByNumber = useMemo(
        () => buildCargoRouteByNumber(perevozkiItems || []),
        [perevozkiItems],
    );

    const cargoSumByNumber = useMemo(
        () => buildCargoSumByNumber(perevozkiItems || []),
        [perevozkiItems],
    );

    const cargoSumPaidByNumber = useMemo(
        () => buildCargoSumPaidByNumber((perevozkiItems || []) as Record<string, unknown>[]),
        [perevozkiItems],
    );

    const cargoTransportByNumber = useMemo(() => {
        const base = buildCargoTransportByNumber(perevozkiItems || []);
        (sendingsItems || []).forEach((row: any) => {
            const transport = String(
                row?.АвтомобильCMRНаименование
                ?? row?.AutoReg
                ?? row?.autoReg
                ?? row?.AutoType
                ?? "",
            ).trim();
            if (!transport) return;
            const numbers: string[] = [];
            const addNumber = (value: unknown) => {
                const v = String(value ?? "").trim();
                if (v) numbers.push(v);
            };
            addNumber(row?.НомерПеревозки);
            addNumber(row?.CargoNumber);
            addNumber(row?.NumberPerevozki);
            addNumber(row?.ИДОтправления);
            const rawParcels = row?.Посылки ?? row?.Parcels ?? row?.parcels ?? row?.Packages ?? row?.packages;
            const parcels = Array.isArray(rawParcels)
                ? rawParcels
                : (rawParcels && typeof rawParcels === "object"
                    ? Object.values(rawParcels as Record<string, any>)
                    : []);
            parcels.forEach((parcel: any) => {
                addNumber(parcel?.ИДОтправления);
                addNumber(parcel?.НомерПеревозки);
                addNumber(parcel?.CargoNumber);
                addNumber(parcel?.NumberPerevozki);
                const goodsRaw = parcel?.Товары;
                const goods = Array.isArray(goodsRaw)
                    ? (goodsRaw[0] ?? {})
                    : (goodsRaw && typeof goodsRaw === "object" ? goodsRaw : null);
                if (goods && typeof goods === "object") {
                    addNumber((goods as any)?.ИДОтправления);
                    addNumber((goods as any)?.НомерПеревозки);
                    addNumber((goods as any)?.CargoNumber);
                    addNumber((goods as any)?.NumberPerevozki);
                }
            });
            Array.from(new Set(numbers)).forEach((raw) => {
                const key = normCargoKey(raw);
                base.set(key, transport);
                if (key !== raw) base.set(raw, transport);
            });
        });
        return base;
    }, [perevozkiItems, sendingsItems, normCargoKey]);

    return {
        normCargoKey,
        perevozkiItems,
        transportLinkedCargoNumbers,
        cargoStateByNumber,
        cargoRouteByNumber,
        cargoSumByNumber,
        cargoSumPaidByNumber,
        cargoTransportByNumber,
    };
}

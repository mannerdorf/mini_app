export type CargoFlowTableSelection =
    | { kind: 'badge'; badge: 'withPlan' | 'withoutPlan' | 'overdue' | 'dueToday' | 'dueTomorrow' | 'dueNext7' }
    | { kind: 'tile'; dateKey: string };

export type CombinedLogisticsBucketKey =
    | 'terminalToSelfPickup'
    | 'terminalToDelivery'
    | 'pickupSelfPickup'
    | 'pickupDelivery';

export function cargoFlowSelectionEqual(a: CargoFlowTableSelection | null, b: CargoFlowTableSelection | null): boolean {
    if (!a || !b) return false;
    if (a.kind !== b.kind) return false;
    if (a.kind === 'tile') return a.dateKey === b.dateKey;
    return a.badge === b.badge;
}

export type DashboardChartPoint = { date: string; value: number; dateKey?: string };

export type DashboardMainChartVariant = 'area' | 'columns' | 'combo' | 'line' | 'dot';

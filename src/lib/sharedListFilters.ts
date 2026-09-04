import type { StatusFilter } from "../types";
import type { BillStatusFilterKey } from "./statusUtils";
import { cityToCode } from "./formatUtils";
import { type DateFilterState, loadDateFilterState as loadDateFilterStateBase } from "./dateUtils";

export type CargoStatusFilterKey = Exclude<StatusFilter, "all" | "favorites">;
export type TypeFilterKey = "ferry" | "auto" | "air";
export type RouteFilterKey = "MSK-KGD" | "KGD-MSK";
export type SharedBillStatusKey = Exclude<BillStatusFilterKey, "all">;

export const SHARED_LIST_FILTERS_STORAGE_KEY = "haulz.sharedListFilters";
export const LEGACY_DASHBOARD_DATE_KEY = "haulz.dashboard.dateFilterState";

export type SharedListFiltersState = {
  cargoStatusKeys: CargoStatusFilterKey[];
  billStatusKeys: SharedBillStatusKey[];
  typeKeys: TypeFilterKey[];
  routeKeys: RouteFilterKey[];
};

const EMPTY_SHARED: SharedListFiltersState = {
  cargoStatusKeys: [],
  billStatusKeys: [],
  typeKeys: [],
  routeKeys: [],
};

const CARGO_STATUS_KEYS: CargoStatusFilterKey[] = ["in_transit", "ready", "delivering", "delivered"];
const BILL_STATUS_KEYS: SharedBillStatusKey[] = ["paid", "unpaid", "partial", "cancelled", "unknown"];
const TYPE_KEYS: TypeFilterKey[] = ["ferry", "auto", "air"];
const TYPE_FILTER_LABELS: Record<TypeFilterKey, string> = {
  ferry: "Паром",
  auto: "Авто",
  air: "Авиа",
};
const ROUTE_KEYS: RouteFilterKey[] = ["MSK-KGD", "KGD-MSK"];

function isCargoStatusKey(v: unknown): v is CargoStatusFilterKey {
  return typeof v === "string" && (CARGO_STATUS_KEYS as string[]).includes(v);
}

function isBillStatusKey(v: unknown): v is SharedBillStatusKey {
  return typeof v === "string" && (BILL_STATUS_KEYS as string[]).includes(v);
}

function isTypeKey(v: unknown): v is TypeFilterKey {
  return v === "ferry" || v === "auto" || v === "air";
}

function isRouteKey(v: unknown): v is RouteFilterKey {
  return v === "MSK-KGD" || v === "KGD-MSK";
}

export function loadSharedListFilters(): SharedListFiltersState {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(SHARED_LIST_FILTERS_STORAGE_KEY) : null;
    if (!raw) return { ...EMPTY_SHARED };
    const parsed = JSON.parse(raw) as Partial<SharedListFiltersState>;
    return {
      cargoStatusKeys: Array.isArray(parsed.cargoStatusKeys) ? parsed.cargoStatusKeys.filter(isCargoStatusKey) : [],
      billStatusKeys: Array.isArray(parsed.billStatusKeys) ? parsed.billStatusKeys.filter(isBillStatusKey) : [],
      typeKeys: Array.isArray(parsed.typeKeys) ? parsed.typeKeys.filter(isTypeKey) : [],
      routeKeys: Array.isArray(parsed.routeKeys) ? parsed.routeKeys.filter(isRouteKey) : [],
    };
  } catch {
    return { ...EMPTY_SHARED };
  }
}

export function saveSharedListFilters(state: SharedListFiltersState) {
  try {
    typeof localStorage !== "undefined" &&
      localStorage.setItem(SHARED_LIST_FILTERS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/** Сквозные фильтры главной/грузов/документов: дата отдельно, здесь — счёт, тип, маршрут без сброса статуса перевозки. */
export function saveSharedVisibleListFilters(params: {
  billStatusFilterSet: Set<SharedBillStatusKey>;
  typeFilterSet: Set<TypeFilterKey>;
  routeFilterSet: Set<RouteFilterKey>;
}) {
  const existing = loadSharedListFilters();
  saveSharedListFilters({
    ...existing,
    billStatusKeys: setToKeys(params.billStatusFilterSet),
    typeKeys: setToKeys(params.typeFilterSet),
    routeKeys: setToKeys(params.routeFilterSet),
  });
}

export function loadSharedDateFilterState(): DateFilterState {
  return loadDateFilterStateBase();
}

export function keysToSet<T extends string>(keys: T[]): Set<T> {
  return new Set(keys);
}

export function setToKeys<T extends string>(set: Set<T>): T[] {
  return [...set];
}

export function typeKeysToSingle(typeKeys: TypeFilterKey[]): "all" | TypeFilterKey {
  if (typeKeys.length !== 1) return "all";
  return typeKeys[0];
}

export function singleToTypeKeys(value: "all" | TypeFilterKey): TypeFilterKey[] {
  return value === "all" ? [] : [value];
}

export function routeKeysToSingle(routeKeys: RouteFilterKey[]): "all" | RouteFilterKey {
  if (routeKeys.length !== 1) return "all";
  return routeKeys[0];
}

export function singleToRouteKeys(value: "all" | RouteFilterKey): RouteFilterKey[] {
  return value === "all" ? [] : [value];
}

export function routeKeyToCargoLabel(key: RouteFilterKey): string {
  return key === "MSK-KGD" ? "MSK – KGD" : "KGD – MSK";
}

export function routeCargoLabelToKey(label: string): RouteFilterKey | null {
  const compact = String(label ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[–—−]/g, "-")
    .toUpperCase();
  if (compact === "MSK-KGD" || compact === "MSKKGD") return "MSK-KGD";
  if (compact === "KGD-MSK" || compact === "KGDMSK") return "KGD-MSK";
  return null;
}

export function sharedFromFilterSets(params: {
  statusFilterSet: Set<CargoStatusFilterKey>;
  billStatusFilterSet: Set<SharedBillStatusKey>;
  typeFilterSet: Set<TypeFilterKey>;
  routeFilterSet: Set<RouteFilterKey>;
}): SharedListFiltersState {
  return {
    cargoStatusKeys: setToKeys(params.statusFilterSet),
    billStatusKeys: setToKeys(params.billStatusFilterSet),
    typeKeys: setToKeys(params.typeFilterSet),
    routeKeys: setToKeys(params.routeFilterSet),
  };
}

export function initSharedFilterSets(): {
  statusFilterSet: Set<CargoStatusFilterKey>;
  billStatusFilterSet: Set<SharedBillStatusKey>;
  typeFilterSet: Set<TypeFilterKey>;
  routeFilterSet: Set<RouteFilterKey>;
} {
  const shared = loadSharedListFilters();
  return {
    statusFilterSet: keysToSet(shared.cargoStatusKeys),
    billStatusFilterSet: keysToSet(shared.billStatusKeys),
    typeFilterSet: keysToSet(shared.typeKeys),
    routeFilterSet: keysToSet(shared.routeKeys),
  };
}

const emptyBillStatusSet = (): Set<SharedBillStatusKey> => new Set();
const emptyCargoStatusSet = (): Set<CargoStatusFilterKey> => new Set();
const emptyTypeSet = (): Set<TypeFilterKey> => new Set();
const emptyRouteSet = (): Set<RouteFilterKey> => new Set();

/** Фильтры, которые реально применяются на «Главной» (только те, что есть в UI дашборда). */
export function resolveDashboardActiveFilters(params: {
  useServiceRequest: boolean;
  billStatusFilterSet: Set<SharedBillStatusKey>;
  typeFilterSet: Set<TypeFilterKey>;
  routeFilterSet: Set<RouteFilterKey>;
}): {
  billStatusFilterSet: Set<SharedBillStatusKey>;
  typeFilterSet: Set<TypeFilterKey>;
  routeFilterSet: Set<RouteFilterKey>;
} {
  return {
    billStatusFilterSet: params.useServiceRequest ? params.billStatusFilterSet : emptyBillStatusSet(),
    typeFilterSet: params.typeFilterSet,
    routeFilterSet: params.routeFilterSet,
  };
}

/** Фильтры, которые реально применяются на «Грузах» (только те, что есть в UI вкладки). */
export function resolveCargoActiveFilters(params: {
  showSums: boolean;
  statusFilterSet: Set<CargoStatusFilterKey>;
  billStatusFilterSet: Set<SharedBillStatusKey>;
  typeFilterSet: Set<TypeFilterKey>;
  routeFilterSet: Set<RouteFilterKey>;
}): {
  statusFilterSet: Set<CargoStatusFilterKey>;
  billStatusFilterSet: Set<SharedBillStatusKey>;
  typeFilterSet: Set<TypeFilterKey>;
  routeFilterSet: Set<RouteFilterKey>;
} {
  return {
    statusFilterSet: params.statusFilterSet,
    billStatusFilterSet: params.showSums ? params.billStatusFilterSet : emptyBillStatusSet(),
    typeFilterSet: params.typeFilterSet,
    routeFilterSet: params.routeFilterSet,
  };
}

/** Фильтры отправок: тип, маршрут и статус доставки (без статуса счёта). */
export function resolveSendingsActiveFilters(params: {
  typeFilterSet: Set<TypeFilterKey>;
  routeFilterSet: Set<RouteFilterKey>;
  deliveryStatusFilterSet: Set<CargoStatusFilterKey>;
}): {
  typeFilterSet: Set<TypeFilterKey>;
  routeFilterSet: Set<RouteFilterKey>;
  deliveryStatusFilterSet: Set<CargoStatusFilterKey>;
} {
  return {
    typeFilterSet: params.typeFilterSet,
    routeFilterSet: params.routeFilterSet,
    deliveryStatusFilterSet: params.deliveryStatusFilterSet,
  };
}

export function formatTypeFilterSetLabel(typeFilterSet: Set<TypeFilterKey>): string {
  if (typeFilterSet.size === 0) return "Все";
  const ordered = TYPE_KEYS.filter((k) => typeFilterSet.has(k)).map((k) => TYPE_FILTER_LABELS[k]);
  if (ordered.length === 0) return "Все";
  return ordered.join(", ");
}

export function matchesTypeFilterSet(
  transportOrAk: TypeFilterKey | unknown,
  typeFilterSet: Set<TypeFilterKey>,
): boolean {
  if (typeFilterSet.size === 0) return true;
  let type: TypeFilterKey;
  if (transportOrAk === "ferry" || transportOrAk === "auto" || transportOrAk === "air") {
    type = transportOrAk;
  } else {
    // legacy: только AK → паром/авто (авиа пока не выводится из AK)
    const isFerry = transportOrAk === true || transportOrAk === "true" || transportOrAk === "1" || transportOrAk === 1;
    type = isFerry ? "ferry" : "auto";
  }
  return typeFilterSet.has(type);
}

export function matchesRouteFilterSet(
  sender: unknown,
  receiver: unknown,
  routeFilterSet: Set<RouteFilterKey>
): boolean {
  if (routeFilterSet.size === 0) return true;
  const mskKgd = cityToCode(sender) === "MSK" && cityToCode(receiver) === "KGD";
  const kgdMsk = cityToCode(sender) === "KGD" && cityToCode(receiver) === "MSK";
  return (routeFilterSet.has("MSK-KGD") && mskKgd) || (routeFilterSet.has("KGD-MSK") && kgdMsk);
}

import type { StatusFilter } from "../types";
import type { BillStatusFilterKey } from "./statusUtils";
import { cityToCode } from "./formatUtils";
import { DATE_FILTER_STORAGE_KEY, type DateFilterState, loadDateFilterState as loadDateFilterStateBase } from "./dateUtils";

export type CargoStatusFilterKey = Exclude<StatusFilter, "all" | "favorites">;
export type TypeFilterKey = "ferry" | "auto";
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
const TYPE_KEYS: TypeFilterKey[] = ["ferry", "auto"];
const ROUTE_KEYS: RouteFilterKey[] = ["MSK-KGD", "KGD-MSK"];

function isCargoStatusKey(v: unknown): v is CargoStatusFilterKey {
  return typeof v === "string" && (CARGO_STATUS_KEYS as string[]).includes(v);
}

function isBillStatusKey(v: unknown): v is SharedBillStatusKey {
  return typeof v === "string" && (BILL_STATUS_KEYS as string[]).includes(v);
}

function isTypeKey(v: unknown): v is TypeFilterKey {
  return v === "ferry" || v === "auto";
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

export function loadSharedDateFilterState(): Partial<DateFilterState> | null {
  const main = loadDateFilterStateBase();
  if (main) return main;
  try {
    const legacy = typeof localStorage !== "undefined" ? localStorage.getItem(LEGACY_DASHBOARD_DATE_KEY) : null;
    if (!legacy) return null;
    const parsed = JSON.parse(legacy) as Partial<DateFilterState>;
    if (parsed && typeof parsed === "object") {
      saveDateFilterStateFromPartial(parsed);
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function saveDateFilterStateFromPartial(state: Partial<DateFilterState>) {
  try {
    if (typeof localStorage === "undefined" || !state.dateFilter) return;
    localStorage.setItem(
      DATE_FILTER_STORAGE_KEY,
      JSON.stringify({
        dateFilter: state.dateFilter,
        customDateFrom: state.customDateFrom ?? "",
        customDateTo: state.customDateTo ?? "",
        selectedMonthForFilter: state.selectedMonthForFilter ?? null,
        selectedYearForFilter: state.selectedYearForFilter ?? null,
        selectedWeekForFilter: state.selectedWeekForFilter ?? null,
      } satisfies DateFilterState)
    );
  } catch {
    /* ignore */
  }
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

export function matchesTypeFilterSet(ak: unknown, typeFilterSet: Set<TypeFilterKey>): boolean {
  if (typeFilterSet.size === 0) return true;
  const isFerry = ak === true || ak === "true" || ak === "1" || ak === 1;
  return (typeFilterSet.has("ferry") && isFerry) || (typeFilterSet.has("auto") && !isFerry);
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

import { describe, expect, it } from "vitest";
import {
  resolveCargoActiveFilters,
  resolveDashboardActiveFilters,
  type RouteFilterKey,
  type SharedBillStatusKey,
  type TypeFilterKey,
} from "./sharedListFilters";

describe("resolveDashboardActiveFilters", () => {
  it("ignores bill status when service mode is off", () => {
    const bill = new Set<SharedBillStatusKey>(["unpaid"]);
    const type = new Set<TypeFilterKey>(["ferry"]);
    const route = new Set<RouteFilterKey>(["MSK-KGD"]);

    const active = resolveDashboardActiveFilters({
      useServiceRequest: false,
      billStatusFilterSet: bill,
      typeFilterSet: type,
      routeFilterSet: route,
    });

    expect(active.billStatusFilterSet.size).toBe(0);
    expect(active.typeFilterSet).toEqual(type);
    expect(active.routeFilterSet).toEqual(route);
  });

  it("applies bill status in service mode", () => {
    const bill = new Set<SharedBillStatusKey>(["paid"]);
    const active = resolveDashboardActiveFilters({
      useServiceRequest: true,
      billStatusFilterSet: bill,
      typeFilterSet: new Set(),
      routeFilterSet: new Set(),
    });
    expect(active.billStatusFilterSet).toEqual(bill);
  });
});

describe("resolveCargoActiveFilters", () => {
  it("ignores bill status when sums are hidden", () => {
    const bill = new Set<SharedBillStatusKey>(["unpaid"]);
    const active = resolveCargoActiveFilters({
      showSums: false,
      statusFilterSet: new Set(["ready"]),
      billStatusFilterSet: bill,
      typeFilterSet: new Set(),
      routeFilterSet: new Set(),
    });
    expect(active.billStatusFilterSet.size).toBe(0);
    expect(active.statusFilterSet.has("ready")).toBe(true);
  });

  it("applies bill status when sums are shown", () => {
    const bill = new Set<SharedBillStatusKey>(["partial"]);
    const active = resolveCargoActiveFilters({
      showSums: true,
      statusFilterSet: new Set(),
      billStatusFilterSet: bill,
      typeFilterSet: new Set(),
      routeFilterSet: new Set(),
    });
    expect(active.billStatusFilterSet).toEqual(bill);
  });
});

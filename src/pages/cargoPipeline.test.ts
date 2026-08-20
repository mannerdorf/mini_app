import { describe, expect, it } from "vitest";
import type { CargoItem } from "../types";
import { buildFilteredCargoItems, resolveCargoSearchQuery } from "./cargoPipeline";

const item = (number: string, extra: Partial<CargoItem> = {}): CargoItem =>
  ({
    Number: number,
    State: "Отправлена",
    Sender: "Test",
    Customer: "Test Co",
    Sum: 1000,
    ...extra,
  }) as CargoItem;

describe("resolveCargoSearchQuery", () => {
  it("treats full cargo number as exact lookup", () => {
    const q = resolveCargoSearchQuery("141535");
    expect(q.mode).toBe("cargo_number");
    if (q.mode === "cargo_number") {
      expect(q.normalizedKeys.has("141535")).toBe(true);
    }
  });
});

describe("buildFilteredCargoItems search", () => {
  const base = {
    statusFilterSet: new Set<"accepted">(),
    senderFilter: "",
    receiverFilter: "",
    transportFilter: "",
    useServiceRequest: false,
    billStatusFilterSet: new Set<"paid">(),
    typeFilterSet: new Set<"avia">(),
    routeFilterSet: new Set<"MSK-KGD">(),
    lastMileFilter: "all" as const,
    sortBy: null,
    sortOrder: "desc" as const,
  };

  it("matches exact cargo number only", () => {
    const items = [
      item("0000141535"),
      item("1141535"),
      item("0000141536"),
    ];
    const filtered = buildFilteredCargoItems({
      ...base,
      items,
      searchText: "141535",
      statusFilterSet: new Set(),
      billStatusFilterSet: new Set(),
      typeFilterSet: new Set(),
      routeFilterSet: new Set(),
    });
    expect(filtered.map((i) => String(i.Number))).toEqual(["0000141535"]);
  });

  it("still supports text search by sender", () => {
    const items = [item("1", { Sender: "АВТОПИТЕР" }), item("2", { Sender: "Другой" })];
    const filtered = buildFilteredCargoItems({
      ...base,
      items,
      searchText: "автопитер",
      statusFilterSet: new Set(),
      billStatusFilterSet: new Set(),
      typeFilterSet: new Set(),
      routeFilterSet: new Set(),
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].Sender).toBe("АВТОПИТЕР");
  });
});

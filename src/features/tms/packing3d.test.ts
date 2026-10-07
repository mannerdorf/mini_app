import { it, expect } from "vitest";
import { planLoad } from "./planner";
import { pack3d, packageProblem } from "./packing3d";
import type { PlanOptions, TmsCargo, PackageGroup } from "./model";
const box = (extra: Partial<PackageGroup> = {}): PackageGroup => ({
  count: 1,
  length: 1,
  width: 1,
  height: 1,
  weight: 100,
  pallet: false,
  floorOnly: false,
  stackable: false,
  maxTopLoad: 0,
  rotate: true,
  ...extra,
});
const cargo = (
  id: string,
  weight = 100,
  extra: Partial<TmsCargo> = {},
): TmsCargo => ({
  id,
  number: id,
  customer: "A",
  customerId: "A",
  receiver: "B",
  received: "2026-10-01",
  route: "KGD → MSK",
  weight,
  volume: 1,
  places: 1,
  readiness: "ready",
  reason: "",
  updatedAt: null,
  ...extra,
});
const options = (packages: Record<string, PackageGroup[]>): PlanOptions => ({
  vehicle: {
    id: "test",
    name: "test",
    mode: "road",
    payload: 5000,
    volume: 3,
    compartments: [{ length: 1, width: 1, height: 3 }],
  },
  order: "fifo",
  strictSelection: true,
  priority: [],
  floorCustomers: [],
  pallets: {},
  palletLength: 1.2,
  palletWidth: 0.8,
  reservePercent: 0,
  packages,
  requireDimensions: true,
});
it("puts a light box above a dense floor pallet even if FIFO selected the light cargo first", () => {
  const o = options({
    "1": [box({ weight: 10 })],
    "2": [box({ weight: 500, pallet: true, stackable: true, maxTopLoad: 100 })],
  });
  const p = planLoad([cargo("1", 10), cargo("2", 500)], o);
  expect(p.selected.map((c) => c.id)).toEqual(["1", "2"]);
  const lower = p.placements.find((p) => p.cargoId === "2")!,
    upper = p.placements.find((p) => p.cargoId === "1")!;
  expect(lower.z).toBe(0);
  expect(lower.topLoad).toBe(10);
  expect(upper.z).toBe(1);
  expect(upper.support).toBe(lower.unit);
});
it("checks cumulative loads through every supporting layer", () => {
  const o = options({
    "1": [box({ weight: 500, stackable: true, maxTopLoad: 100 })],
    "2": [box({ weight: 80, stackable: true, maxTopLoad: 50 })],
    "3": [box({ weight: 30 })],
  });
  const p = planLoad([cargo("1", 500), cargo("2", 80), cargo("3", 30)], o);
  expect(p.selected.map((c) => c.id)).toEqual(["1", "2"]);
  expect(p.placements[0].topLoad).toBe(80);
});
it("does not use fragile cargo as support, or put a pallet in an upper layer", () => {
  for (const g of [box({ weight: 10 }), box({ weight: 10, pallet: true })]) {
    const o = options({ "1": [box({ stackable: false })], "2": [g] });
    expect(planLoad([cargo("1"), cargo("2", 10)], o).selected).toHaveLength(1);
  }
});
it("does not allow heavier or denser cargo on a lighter support", () => {
  const o = options({
    "1": [box({ weight: 20, stackable: true, maxTopLoad: 1000 })],
    "2": [box({ weight: 100 })],
  });
  expect(planLoad([cargo("1", 20), cargo("2", 100)], o).selected).toHaveLength(
    1,
  );
});
it("requires full footprint support, with no floating or overhanging cargo", () => {
  const o = options({
    "1": [box({ length: 0.5, weight: 500, stackable: true, maxTopLoad: 500 })],
    "2": [box({ weight: 10 })],
  });
  expect(planLoad([cargo("1", 500), cargo("2", 10)], o).selected).toHaveLength(
    1,
  );
});
it("validates dimensions, measured mass totals and the no-estimates mode", () => {
  const c = cargo("1");
  expect(packageProblem(c, options({}))).toContain("габариты");
  expect(packageProblem(c, options({ "1": [box({ weight: 10 })] }))).toContain(
    "Масса",
  );
  expect(packageProblem(c, options({ "1": [box({ length: 0 })] }))).toContain(
    "Проверьте",
  );
});
it("counts bounding-box volume if greater than the shipment volume", () => {
  const o = options({ "1": [box({ length: 2 })] });
  o.vehicle.compartments[0].length = 2;
  o.vehicle.volume = 1.5;
  expect(planLoad([cargo("1")], o).selected).toEqual([]);
});
it("does not partially load a multi-group shipment", () => {
  const o = options({
    "1": [box({ weight: 50 }), box({ weight: 50, height: 4 })],
  });
  expect(planLoad([cargo("1")], o).placements).toEqual([]);
});
it("uses upright horizontal rotation only and stays inside the roof", () => {
  const o = options({ "1": [box({ length: 2, width: 1, height: 0.5 })] });
  o.vehicle.compartments = [{ length: 1, width: 2, height: 1 }];
  const p = pack3d([cargo("1")], o)!;
  expect(p[0].length).toBe(1);
  expect(p[0].width).toBe(2);
  o.packages!["1"][0].rotate = false;
  expect(pack3d([cargo("1")], o)).toBeNull();
});
it("keeps strict priority order even when the first cargo has no geometry", () => {
  const o = options({ "2": [box()] });
  expect(planLoad([cargo("1"), cargo("2")], o).selected).toEqual([]);
  o.strictSelection = false;
  expect(
    planLoad([cargo("1"), cargo("2")], o).selected.map((c) => c.id),
  ).toEqual(["2"]);
});
it("checks deterministic 3D non-overlap and support bounds with mixed package sizes", () => {
  const rows = Array.from({ length: 20 }, (_, i) => cargo(String(i), 100 - i));
  const o = options(
    Object.fromEntries(
      rows.map((c, i) => [
        c.id,
        [
          box({
            length: 0.5 + (i % 3) * 0.1,
            width: 0.5,
            height: 0.3,
            weight: c.weight!,
            stackable: true,
            maxTopLoad: 400,
          }),
        ],
      ]),
    ),
  );
  o.vehicle.compartments = [{ length: 4, width: 2, height: 2 }];
  o.vehicle.volume = 16;
  o.strictSelection = false;
  const p = pack3d(rows, o)!;
  expect(p).not.toBeNull();
  expect(pack3d(rows, o)).toEqual(p);
  for (const a of p) {
    expect(a.z + a.height).toBeLessThanOrEqual(2.00001);
    expect(a.x + a.length).toBeLessThanOrEqual(4.00001);
    expect(a.y + a.width).toBeLessThanOrEqual(2.00001);
    if (a.z > 0) {
      const base = p.find((b) => b.unit === a.support)!;
      expect(base).toBeDefined();
      expect(a.z).toBeCloseTo(base.z + base.height);
      expect(a.x).toBeGreaterThanOrEqual(base.x - 0.00001);
      expect(a.x + a.length).toBeLessThanOrEqual(
        base.x + base.length + 0.00001,
      );
      expect(base.topLoad).toBeLessThanOrEqual(base.maxTopLoad);
    }
    for (const b of p) {
      if (a === b) continue;
      expect(
        a.x + a.length <= b.x + 0.00001 ||
          b.x + b.length <= a.x + 0.00001 ||
          a.y + a.width <= b.y + 0.00001 ||
          b.y + b.width <= a.y + 0.00001 ||
          a.z + a.height <= b.z + 0.00001 ||
          b.z + b.height <= a.z + 0.00001,
      ).toBe(true);
    }
  }
});

it("uses three estimated layers instead of stopping after one third of the volume", () => {
  const rows = [cargo("1", 300, { volume: 3, places: 3 })];
  const o = { ...options({}), requireDimensions: false };
  const plan = planLoad(rows, o);
  expect(plan.selected).toHaveLength(1);
  expect(plan.volume).toBe(3);
  expect(plan.floorArea).toBe(1);
  expect(plan.placements.map((p) => p.z)).toEqual([0, 1, 2]);
  expect(plan.placements.every((p) => p.estimated)).toBe(true);
  expect(plan.placements[0].topLoad).toBe(200);
  expect(planLoad(rows, { ...o, estimatedTopLoadFactor: 0 }).selected).toEqual([]);
  expect(planLoad(rows, { ...o, estimatedTopLoadFactor: 1 }).selected).toEqual([]);
});

it("puts lighter estimated boxes above heavier ones regardless of FIFO order", () => {
  const o = { ...options({}), requireDimensions: false };
  const rows = [cargo("light", 10), cargo("medium", 50), cargo("heavy", 100)];
  const p = planLoad(rows, o);
  expect(p.selected).toHaveLength(3);
  const sorted = [...p.placements].sort((a, b) => a.z - b.z);
  expect(sorted.map((p) => p.weight)).toEqual([100, 50, 10]);
  expect(sorted[0].topLoad).toBe(60);
});

it("keeps estimated pallets on the floor while allowing lighter boxes above", () => {
  const o = { ...options({}), requireDimensions: false, floorCustomers: ["pallet"], pallets: { p: 1 }, palletLength: 1, palletWidth: 1 };
  const p = planLoad([cargo("p", 100, { customerId: "pallet" }), cargo("b", 10)], o);
  expect(p.placements.find((p) => p.cargoId === "p")?.z).toBe(0);
  expect(p.placements.find((p) => p.cargoId === "b")?.z).toBe(1);
  expect(planLoad([cargo("p", 200, { customerId: "pallet", volume: 2 })], { ...o, pallets: { p: 2 } }).selected).toEqual([]);
});

it("never overrides a measured no-stacking rule with an estimated load factor", () => {
  const o = { ...options({ base: [box({ stackable: false })] }), requireDimensions: false, estimatedTopLoadFactor: 5 };
  expect(planLoad([cargo("base"), cargo("top", 10)], o).selected).toHaveLength(1);
  expect(() => planLoad([], { ...o, estimatedTopLoadFactor: NaN })).toThrow("нагрузка");
});

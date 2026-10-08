import { it, expect } from "vitest";
import { planLoad } from "./planner";
import { pack3d, packageProblem } from "./packing3d";
import mixedLoadShapes from "./__fixtures__/mixed-load-shapes.json";
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
      expect(a.supports!.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(1);
      for (const support of a.supports!) {
        const base = p.find((b) => b.unit === support.unit)!;
        expect(a.z).toBeCloseTo(base.z + base.height);
        const area =
          Math.max(
            0,
            Math.min(a.x + a.length, base.x + base.length) -
              Math.max(a.x, base.x),
          ) *
          Math.max(
            0,
            Math.min(a.y + a.width, base.y + base.width) -
              Math.max(a.y, base.y),
          );
        expect(support.share).toBeCloseTo(area / (a.length * a.width));
        expect(base.topLoad).toBeLessThanOrEqual(base.maxTopLoad);
        expect(a.density).toBeLessThanOrEqual(base.density + 0.00001);
      }
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
  expect(planLoad(rows, { ...o, estimatedTopLoadFactor: 0 }).selected).toEqual(
    [],
  );
  expect(planLoad(rows, { ...o, estimatedTopLoadFactor: 1 }).selected).toEqual(
    [],
  );
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
  const o = {
    ...options({}),
    requireDimensions: false,
    floorCustomers: ["pallet"],
    pallets: { p: 1 },
    palletLength: 1,
    palletWidth: 1,
  };
  const p = planLoad(
    [cargo("p", 100, { customerId: "pallet" }), cargo("b", 10)],
    o,
  );
  expect(p.placements.find((p) => p.cargoId === "p")?.z).toBe(0);
  expect(p.placements.find((p) => p.cargoId === "b")?.z).toBe(1);
  expect(
    planLoad([cargo("p", 200, { customerId: "pallet", volume: 2 })], {
      ...o,
      pallets: { p: 2 },
    }).selected,
  ).toEqual([]);
});

it("never overrides a measured no-stacking rule with an estimated load factor", () => {
  const o = {
    ...options({ base: [box({ stackable: false })] }),
    requireDimensions: false,
    estimatedTopLoadFactor: 5,
  };
  expect(planLoad([cargo("base"), cargo("top", 10)], o).selected).toHaveLength(
    1,
  );
  expect(() => planLoad([], { ...o, estimatedTopLoadFactor: NaN })).toThrow(
    "нагрузка",
  );
});

it("starts partial loads at the front wall in every compartment, with and without rotation", () => {
  for (const rotate of [true, false]) {
    const o = options({
      a: [
        box({
          length: 4.5,
          width: 1,
          height: 1,
          rotate,
          weight: 100,
          stackable: true,
          maxTopLoad: 50,
        }),
      ],
      b: [box({ length: 1, width: 1, height: 1, rotate, weight: 10 })],
      c: [
        box({
          length: 4.5,
          width: 1,
          height: 1,
          rotate,
          weight: 100,
          floorOnly: true,
        }),
      ],
    });
    o.vehicle.compartments = [
      { length: 5, width: 1, height: 3 },
      { length: 5, width: 1, height: 3 },
    ];
    const p = pack3d([cargo("a"), cargo("b", 10), cargo("c")], o)!;
    expect(p).not.toBeNull();
    expect(new Set(p.map((p) => p.compartment)).size).toBe(2);
    for (const compartment of [0, 1]) {
      expect(
        Math.min(
          ...p.filter((p) => p.compartment === compartment).map((p) => p.x),
        ),
      ).toBe(0);
    }
    const upper = p.find((p) => p.cargoId === "b")!;
    const lower = p.find((p) => p.unit === upper.support)!;
    expect(lower).toBeDefined();
    expect(upper.x).toBe(lower.x);
    expect(upper.z).toBe(lower.z + lower.height);
  }
});

it("fills estimated cargo to the roof without an invented layer limit, while retaining a chosen load factor", () => {
  const o = {
    ...options({}),
    requireDimensions: false,
    estimatedStacking: "height" as const,
  };
  o.vehicle.compartments = [{ length: 1, width: 1, height: 6 }];
  o.vehicle.volume = 6;
  const rows = [cargo("1", 600, { volume: 6, places: 6 })];
  const p = planLoad(rows, o);
  expect(p.selected).toHaveLength(1);
  expect(p.placements.map((p) => p.z)).toEqual([0, 1, 2, 3, 4, 5]);
  expect(p.placements[0].topLoad).toBe(500);
  expect(
    planLoad(rows, {
      ...o,
      estimatedStacking: "load",
      estimatedTopLoadFactor: 2,
    }).selected,
  ).toHaveLength(0);
  expect(
    planLoad(rows, {
      ...o,
      estimatedStacking: "load",
      estimatedTopLoadFactor: 5,
    }).selected,
  ).toHaveLength(1);
});

it("fills above an estimated floor pallet to the roof, without placing another pallet above it", () => {
  const o = {
    ...options({}),
    requireDimensions: false,
    estimatedStacking: "height" as const,
    floorCustomers: ["pallet"],
    pallets: { p: 1 },
    palletLength: 1,
    palletWidth: 1,
  };
  o.vehicle.compartments = [{ length: 1, width: 1, height: 5 }];
  o.vehicle.volume = 5;
  const p = planLoad(
    [
      cargo("p", 500, { customerId: "pallet" }),
      cargo("b", 40, { places: 4, volume: 4 }),
    ],
    o,
  );
  expect(p.selected).toHaveLength(2);
  expect(p.placements.filter((p) => p.pallet).every((p) => p.z === 0)).toBe(
    true,
  );
  expect(Math.max(...p.placements.map((p) => p.z + p.height))).toBe(5);
});

it("requires explicit pallet stacking permission on both pallets and respects floor-only rules", () => {
  for (const [baseAllowed, upperAllowed, floorOnly, expected] of [
    [false, false, false, 1],
    [true, false, false, 1],
    [false, true, false, 1],
    [true, true, true, 1],
    [true, true, false, 2],
  ] as const) {
    const o = options({
      base: [
        box({
          pallet: true,
          palletStacking: baseAllowed,
          stackable: true,
          maxTopLoad: 200,
        }),
      ],
      upper: [
        box({
          pallet: true,
          palletStacking: upperAllowed,
          floorOnly,
          weight: 50,
        }),
      ],
    });
    const p = planLoad([cargo("base"), cargo("upper", 50)], o);
    expect(p.selected).toHaveLength(expected);
    if (expected === 2)
      expect(p.placements.find((p) => p.cargoId === "upper")?.z).toBe(1);
  }
});

it("does not place an allowed pallet on loose boxes, or override measured compression limits in height mode", () => {
  const o = options({
    base: [box({ stackable: true, maxTopLoad: 20 })],
    top: [box({ pallet: true, palletStacking: true, weight: 10 })],
  });
  o.estimatedStacking = "height";
  expect(planLoad([cargo("base"), cargo("top", 10)], o).selected).toHaveLength(
    1,
  );
  o.packages!.top = [box({ weight: 30 })];
  expect(planLoad([cargo("base"), cargo("top", 30)], o).selected).toHaveLength(
    1,
  );
});

it("ignores an inactive load factor in height mode but validates it when enabled", () => {
  const o = { ...options({}), estimatedTopLoadFactor: NaN };
  expect(() =>
    planLoad([], { ...o, estimatedStacking: "height" }),
  ).not.toThrow();
  expect(() => planLoad([], { ...o, estimatedStacking: "load" })).toThrow(
    "нагрузка",
  );
});

it("fills the floor with dense places before stacking lighter places from another customer", () => {
  const o = {
    ...options({}),
    requireDimensions: false,
    estimatedStacking: "height" as const,
  };
  o.vehicle.compartments = [{ length: 2, width: 1, height: 2 }];
  o.vehicle.volume = 4;
  const rows = [
    cargo("light", 20, { customerId: "priority", places: 2, volume: 2 }),
    cargo("dense", 200, { customerId: "other", places: 2, volume: 2 }),
  ];
  o.priority = ["priority"];
  const plan = planLoad(rows, o);
  expect(plan.selected.map((c) => c.id)).toEqual(["light", "dense"]);
  expect(
    plan.placements.filter((p) => p.z === 0).map((p) => p.cargoId),
  ).toEqual(["dense", "dense"]);
  expect(
    plan.placements.filter((p) => p.z === 1).map((p) => p.cargoId),
  ).toEqual(["light", "light"]);
  for (const upper of plan.placements.filter((p) => p.z > 0)) {
    expect(plan.placements.find((p) => p.unit === upper.support)?.cargoId).toBe(
      "dense",
    );
  }
});

it("interleaves measured package groups by their own density instead of shipment averages", () => {
  const support = (weight: number) =>
    box({ weight, stackable: true, maxTopLoad: 200 });
  const o = options({
    a: [support(100), support(10)],
    b: [support(80), support(20)],
  });
  o.vehicle.compartments = [{ length: 2, width: 1, height: 2 }];
  const rows = [
    cargo("a", 110, { customerId: "A" }),
    cargo("b", 100, { customerId: "B" }),
  ];
  const p = pack3d(rows, o)!;
  expect(p.map((p) => p.weight)).toEqual([100, 80, 20, 10]);
  expect(p.filter((p) => p.z === 0).map((p) => p.weight)).toEqual([100, 80]);
  expect(p.filter((p) => p.z === 1).map((p) => p.weight)).toEqual([20, 10]);
  expect(
    pack3d(
      rows.map((c) => ({
        ...c,
        customerId: "same-customer",
        customer: "Same",
      })),
      o,
    ),
  ).toEqual(p);
  expect(pack3d([...rows].reverse(), o)).toEqual(p);
});

it("compares lower surfaces across all compartments before creating upper tiers", () => {
  const o = options({
    a: [box({ count: 2, stackable: true, maxTopLoad: 200 })],
  });
  o.vehicle.compartments = [
    { length: 1, width: 1, height: 2 },
    { length: 1, width: 1, height: 2 },
  ];
  const p = pack3d([cargo("a", 200)], o)!;
  expect(p.map((p) => p.z)).toEqual([0, 0]);
  expect(p.map((p) => p.compartment)).toEqual([0, 1]);
});

it("supports a wide lighter box across two customers and distributes the load", () => {
  const o = options({
    a: [box({ weight: 100, stackable: true, maxTopLoad: 40 })],
    b: [box({ weight: 80, stackable: true, maxTopLoad: 40 })],
    c: [box({ length: 2, weight: 60 })],
  });
  o.vehicle.compartments = [{ length: 2, width: 1, height: 2 }];
  const p = pack3d([cargo("a"), cargo("b", 80), cargo("c", 60)], o)!;
  expect(p).not.toBeNull();
  const upper = p.find((p) => p.cargoId === "c")!;
  expect(upper.z).toBe(1);
  expect(upper.supports!.map((s) => s.share)).toEqual([0.5, 0.5]);
  expect(p.filter((p) => p.z === 0).map((p) => p.topLoad)).toEqual([30, 30]);
  o.packages!.b[0].maxTopLoad = 29;
  expect(pack3d([cargo("a"), cargo("b", 80), cargo("c", 60)], o)).toBeNull();
});

it("rejects support gaps and unequal top heights", () => {
  for (const change of [{ length: 0.9 }, { height: 0.9 }]) {
    const o = options({
      a: [
        box({
          count: 2,
          weight: 100,
          stackable: true,
          maxTopLoad: 100,
          ...change,
        }),
      ],
      b: [box({ length: 2, weight: 20 })],
    });
    if ("height" in change)
      (o.packages!.a.push(
        box({ weight: 100, stackable: true, maxTopLoad: 100 }),
      ),
        (o.packages!.a[0].count = 1));
    o.vehicle.compartments = [{ length: 2, width: 1, height: 2 }];
    expect(pack3d([cargo("a", 200), cargo("b", 20)], o)).toBeNull();
  }
});

it("accumulates split load once through a shared ancestor", () => {
  const o = options({
    a: [box({ length: 2, weight: 400, stackable: true, maxTopLoad: 250 })],
    b: [box({ count: 2, weight: 100, stackable: true, maxTopLoad: 50 })],
    c: [box({ length: 2, weight: 40 })],
  });
  o.vehicle.compartments = [{ length: 2, width: 1, height: 3 }];
  const rows = [cargo("a", 400), cargo("b", 200), cargo("c", 40)];
  const p = pack3d(rows, o)!;
  expect(p.find((p) => p.cargoId === "a")!.topLoad).toBeCloseTo(240);
  expect(p.filter((p) => p.cargoId === "b").map((p) => p.topLoad)).toEqual([
    20, 20,
  ]);
  o.packages!.a[0].maxTopLoad = 239;
  expect(pack3d(rows, o)).toBeNull();
});

it("requires permission on every pallet supporting an upper pallet", () => {
  const o = options({
    a: [
      box({
        count: 2,
        pallet: true,
        palletStacking: true,
        weight: 100,
        stackable: true,
        maxTopLoad: 100,
      }),
    ],
    b: [box({ length: 2, pallet: true, palletStacking: true, weight: 40 })],
  });
  o.vehicle.compartments = [{ length: 2, width: 1, height: 2 }];
  const rows = [cargo("a", 200), cargo("b", 40)];
  expect(
    pack3d(rows, o)!.find((p) => p.cargoId === "b")!.supports,
  ).toHaveLength(2);
  o.packages!.a[0].palletStacking = false;
  expect(pack3d(rows, o)).toBeNull();
});

it("tries another support when the first tight fit cannot bear the load", () => {
  const o = options({
    a: [box({ weight: 100, stackable: true, maxTopLoad: 1 })],
    b: [box({ weight: 90, stackable: true, maxTopLoad: 100 })],
    c: [box({ weight: 20 })],
  });
  o.vehicle.compartments = [{ length: 2, width: 1, height: 2 }];
  const p = pack3d([cargo("a"), cargo("b", 90), cargo("c", 20)], o);
  expect(p).not.toBeNull();
  expect(p!.find((p) => p.cargoId === "c")!.support).toBe("b/0/0");
});

it("compacts dense small boxes vertically to leave floor for tall light cargo", () => {
  const o = options({
    dense: [
      box({
        count: 4,
        length: 0.5,
        width: 1,
        height: 0.5,
        weight: 100,
        rotate: false,
        stackable: true,
        maxTopLoad: 1000,
      }),
    ],
    tall: [
      box({ length: 1, width: 1, height: 1.6, weight: 20, rotate: false }),
    ],
  });
  o.vehicle.compartments = [{ length: 2, width: 1, height: 2 }];
  o.vehicle.volume = 4;
  const rows = [
    cargo("dense", 400, { volume: 1 }),
    cargo("tall", 20, { volume: 1.6 }),
  ];
  expect(pack3d(rows, o, "density-low")).toBeNull();
  const p = planLoad(rows, o);
  expect(p.selected.map((c) => c.id)).toEqual(["dense", "tall"]);
  expect(p.volume).toBeCloseTo(2.6);
  expect(p.placements.find((p) => p.cargoId === "tall")!.z).toBe(0);
  expect(
    p.placements.filter((p) => p.cargoId === "dense").map((p) => p.z),
  ).toEqual([0, 0.5, 1, 1.5]);
  o.packages!.dense[0].maxTopLoad = 99;
  expect(planLoad(rows, o).selected.map((c) => c.id)).toEqual(["dense"]);
});

it("packs over 61 cubic metres of mixed shapes while retaining all physical constraints", () => {
  // Anonymous shape totals only: no customer, shipment number or address.
  const rows = mixedLoadShapes.map(([weight, volume, places], i) =>
    cargo(`shape-${i}`, weight, { volume, places }),
  );
  const o = {
    ...options({}),
    requireDimensions: false,
    estimatedStacking: "height" as const,
  };
  o.vehicle = {
    id: "40hc",
    name: "40HC",
    mode: "ferry",
    payload: 26000,
    volume: 76,
    compartments: [{ length: 12.03, width: 2.35, height: 2.69 }],
  };
  const p = pack3d(rows, o, "area-compact")!;
  expect(p).not.toBeNull();
  expect(
    p.reduce((sum, p) => sum + p.length * p.width * p.height, 0),
  ).toBeGreaterThan(61);
  const byUnit = new Map(p.map((p) => [p.unit, p]));
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    expect(
      a.x >= -1e-6 &&
        a.y >= -1e-6 &&
        a.z >= -1e-6 &&
        a.x + a.length <= 12.030001 &&
        a.y + a.width <= 2.350001 &&
        a.z + a.height <= 2.690001,
    ).toBe(true);
    expect(a.topLoad).toBeLessThanOrEqual(a.maxTopLoad + 1e-6);
    if (a.z > 1e-6) {
      expect(a.supports!.reduce((s, p) => s + p.share, 0)).toBeCloseTo(1);
      for (const support of a.supports!) {
        const base = byUnit.get(support.unit)!;
        expect(base.z + base.height).toBeCloseTo(a.z);
        expect(a.density).toBeLessThanOrEqual(base.density + 1e-6);
      }
    }
    const overlaps = p
      .slice(i + 1)
      .some(
        (b) =>
          a.x < b.x + b.length - 1e-6 &&
          a.x + a.length > b.x + 1e-6 &&
          a.y < b.y + b.width - 1e-6 &&
          a.y + a.width > b.y + 1e-6 &&
          a.z < b.z + b.height - 1e-6 &&
          a.z + a.height > b.z + 1e-6,
      );
    expect(overlaps).toBe(false);
  }
});

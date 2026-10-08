import { describe, it, expect } from "vitest";
import { planLoad } from "./planner";
import { VEHICLES, type TmsCargo, type PlanOptions } from "./model";
const cargo = (
  id: string,
  weight = 100,
  volume = 1,
  extra: Partial<TmsCargo> = {},
): TmsCargo => ({
  id,
  number: id,
  customer: "Клиент",
  customerId: "customer",
  receiver: "Получатель",
  received: "2026-10-01",
  route: "KGD → MSK",
  weight,
  volume,
  places: 1,
  readiness: "ready",
  reason: "",
  updatedAt: null,
  ...extra,
});
const options = (extra: Partial<PlanOptions> = {}): PlanOptions => ({
  vehicle: {
    id: "test",
    name: "ТС",
    mode: "road",
    payload: 1000,
    volume: 10,
    compartments: [{ length: 5, width: 2, height: 1 }],
  },
  order: "fifo",
  strictSelection: false,
  priority: [],
  floorCustomers: [],
  pallets: {},
  palletLength: 1.2,
  palletWidth: 0.8,
  reservePercent: 0,
  ...extra,
});
describe("TMS load planning", () => {
  it("never exceeds payload, volume or physical compartment boundaries", () => {
    const o = options();
    const p = planLoad(
      Array.from({ length: 35 }, (_, i) =>
        cargo(String(i), 30 + i * 5, 0.2 + i * 0.04),
      ),
      o,
    );
    expect(p.weight).toBeLessThanOrEqual(p.payloadLimit + 1e-6);
    expect(p.volume).toBeLessThanOrEqual(p.volumeLimit + 1e-6);
    p.placements.forEach((x) => {
      const c = o.vehicle.compartments[x.compartment];
      expect(x.x).toBeGreaterThanOrEqual(0);
      expect(x.y).toBeGreaterThanOrEqual(0);
      expect(x.x + x.length).toBeLessThanOrEqual(c.length + 1e-6);
      expect(x.y + x.width).toBeLessThanOrEqual(c.width + 1e-6);
    });
  });
  it("reserves weight and volume capacity", () => {
    const p = planLoad(
      [cargo("1", 600, 6), cargo("2", 400, 4)],
      options({ reservePercent: 10 }),
    );
    expect(p.weight).toBeLessThanOrEqual(900);
    expect(p.volume).toBeLessThanOrEqual(9);
  });
  it("keeps high priority cargo ahead of better filling ordinary cargo", () => {
    const p = planLoad(
      [cargo("1", 900, 9), cargo("2", 500, 5, { customerId: "vip" })],
      options({ priority: ["vip"] }),
    );
    expect(p.selected.map((c) => c.id)).toEqual(["2"]);
  });
  it("honors FIFO and LIFO when equally fitting", () => {
    const rows = [
      cargo("1", 600, 6, { received: "2026-09-01" }),
      cargo("2", 600, 6, { received: "2026-10-01" }),
    ];
    expect(planLoad(rows, options()).selected[0].id).toBe("1");
    expect(planLoad(rows, options({ order: "lifo" })).selected[0].id).toBe("2");
  });
  it("skips a consignment that does not fit and improves a greedy fill", () => {
    const p = planLoad(
      [
        cargo("1", 1200, 12),
        cargo("2", 600, 6),
        cargo("3", 500, 5, { places: 5 }),
        cargo("4", 500, 5, { places: 5 }),
      ],
      options(),
    );
    expect(p.weight).toBe(1000);
    expect(p.selected.map((c) => c.id).sort()).toEqual(["3", "4"]);
  });
  it("requires actual positive weight, volume, receipt and verified readiness", () => {
    const rows = [
      cargo("1", NaN),
      cargo("2", 100, 0),
      cargo("3", 100, 1, { weight: null }),
      cargo("4", 100, 1, { readiness: "pending" }),
      cargo("5", 100, 1, { received: "" }),
      cargo("6", 100, 1, { readiness: "dispatched" }),
    ];
    expect(planLoad(rows, options()).selected).toHaveLength(0);
  });
  it("does not confuse places with floor pallets", () => {
    const p = planLoad(
      [cargo("1", 100, 1, { places: 33 })],
      options({ floorCustomers: ["customer"] }),
    );
    expect(p.selected).toHaveLength(0);
    expect(p.omitted[0].reason).toContain("количество палет");
  });
  it("packs floor pallets without stacking or overlapping loose cargo", () => {
    const o = options({ floorCustomers: ["pallet"], pallets: { "1": 4 } });
    const p = planLoad(
      [cargo("1", 100, 3, { customerId: "pallet" }), cargo("2", 200, 2)],
      o,
    );
    expect(p.pallets).toBe(4);
    expect(p.selected).toHaveLength(2);
    for (let i = 0; i < p.placements.length; i++)
      for (let j = i + 1; j < p.placements.length; j++) {
        const a = p.placements[i],
          b = p.placements[j];
        expect(
          a.x + a.length <= b.x + 1e-6 ||
            b.x + b.length <= a.x + 1e-6 ||
            a.y + a.width <= b.y + 1e-6 ||
            b.y + b.width <= a.y + 1e-6,
        ).toBe(true);
      }
  });
  it("rejects pallets whose volume cannot fit below the roof", () => {
    expect(
      planLoad(
        [cargo("1", 100, 3)],
        options({ floorCustomers: ["customer"], pallets: { "1": 1 } }),
      ).selected,
    ).toHaveLength(0);
  });
  it("keeps road train compartments separate and never splits a consignment", () => {
    const vehicle = {
      ...options().vehicle,
      volume: 16,
      compartments: [
        { length: 4, width: 2, height: 1 },
        { length: 4, width: 2, height: 1 },
      ],
    };
    const p = planLoad(
      [cargo("1", 100, 9), cargo("2", 100, 7), cargo("3", 100, 7)],
      options({ vehicle }),
    );
    expect(p.selected.map((c) => c.id)).toEqual(["2", "3"]);
    expect(new Set(p.placements.map((p) => p.compartment)).size).toBe(2);
  });
  it("does not mix routes", () =>
    expect(() =>
      planLoad(
        [cargo("1"), cargo("2", 100, 1, { route: "MSK → KGD" })],
        options(),
      ),
    ).toThrow("один маршрут"));
  it("rejects invalid capacities instead of dividing by zero", () =>
    expect(() =>
      planLoad([], options({ vehicle: { ...VEHICLES[0], payload: 0 } })),
    ).toThrow());
  it("returns deterministic results and accounts for every cargo exactly once", () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      cargo(String(i), 30 + i * 10, 0.5 + i * 0.1),
    );
    const p = planLoad(rows, options());
    expect(planLoad(rows, options())).toEqual(p);
    expect(
      new Set([
        ...p.selected.map((c) => c.id),
        ...p.omitted.map((c) => c.cargo.id),
      ]).size,
    ).toBe(rows.length);
  });
});
it("uses mixed pallet orientations to fit 11 EUR pallets into a 20 foot container", () => {
  const vehicle = VEHICLES.find((v) => v.id === "20dc")!;
  const p = planLoad(
    [cargo("1", 1100, 10)],
    options({ vehicle, floorCustomers: ["customer"], pallets: { "1": 11 } }),
  );
  expect(p.pallets).toBe(11);
});
it("keeps mixed pallets and stacked boxes within the vehicle without 3D overlap", () => {
  let seed = 117;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let run = 0; run < 40; run++) {
    const vehicle = VEHICLES[run % VEHICLES.length];
    const pallets: Record<string, number> = {};
    const rows = Array.from({ length: 16 }, (_, i) => {
      const id = String(i);
      pallets[id] = 1 + Math.floor(random() * 4);
      return cargo(id, 50 + random() * 500, 0.3 + random() * 3, {
        customerId: i % 2 ? "floor" : "loose",
      });
    });
    const p = planLoad(
      rows,
      options({ vehicle, floorCustomers: ["floor"], pallets }),
    );
    expect(p.weight).toBeLessThanOrEqual(p.payloadLimit + 1e-6);
    expect(p.volume).toBeLessThanOrEqual(p.volumeLimit + 1e-6);
    for (let i = 0; i < p.placements.length; i++) {
      const a = p.placements[i],
        b = vehicle.compartments[a.compartment];
      expect(a.x).toBeGreaterThanOrEqual(-1e-6);
      expect(a.y).toBeGreaterThanOrEqual(-1e-6);
      expect(a.x + a.length).toBeLessThanOrEqual(b.length + 1e-6);
      expect(a.y + a.width).toBeLessThanOrEqual(b.width + 1e-6);
      expect(a.z + a.height).toBeLessThanOrEqual(b.height + 1e-6);
      if (a.pallet) expect(a.z).toBe(0);
      expect(a.topLoad).toBeLessThanOrEqual(a.maxTopLoad + 1e-6);
      for (let j = i + 1; j < p.placements.length; j++) {
        const c = p.placements[j];
        if (c.compartment !== a.compartment) continue;
        expect(
          a.x + a.length <= c.x + 1e-6 ||
            c.x + c.length <= a.x + 1e-6 ||
            a.y + a.width <= c.y + 1e-6 ||
            c.y + c.width <= a.y + 1e-6 ||
            a.z + a.height <= c.z + 1e-6 ||
            c.z + c.height <= a.z + 1e-6,
        ).toBe(true);
      }
    }
  }
}, 30000);
describe("strict selection", () => {
  it("stops at the first unfit shipment without filling the gap with later cargo", () => {
    const rows = [
      cargo("1", 600, 6, { places: 6 }),
      cargo("2", 500, 5, { places: 5 }),
      cargo("3", 400, 4, { places: 4 }),
    ];
    const p = planLoad(rows, options({ strictSelection: true }));
    expect(p.selected.map((c) => c.id)).toEqual(["1"]);
    expect(p.omitted.find((c) => c.cargo.id === "3")?.reason).toContain(
      "остановлена на перевозке 2",
    );
    expect(planLoad(rows, options()).weight).toBe(1000);
  });
  it("keeps the vehicle empty if the first priority shipment cannot fit", () => {
    const rows = [
      cargo("1", 100, 1),
      cargo("2", 1500, 2, { customerId: "vip" }),
    ];
    expect(
      planLoad(rows, options({ strictSelection: true, priority: ["vip"] }))
        .selected,
    ).toEqual([]);
  });
  it("obeys LIFO without rearranging shipments for a better fill", () => {
    const rows = [
      cargo("1", 400, 4, { received: "2026-10-01" }),
      cargo("2", 700, 7, { received: "2026-10-02" }),
      cargo("3", 600, 6, { received: "2026-10-03" }),
    ];
    expect(
      planLoad(
        rows,
        options({ strictSelection: true, order: "lifo" }),
      ).selected.map((c) => c.id),
    ).toEqual(["3"]);
  });
  it("does not silently skip a shipment with missing weight or pallet count", () => {
    for (const first of [
      cargo("1", 100, 1, { weight: null }),
      cargo("1", 100, 1, { customerId: "floor" }),
    ]) {
      const p = planLoad(
        [first, cargo("2")],
        options({ strictSelection: true, floorCustomers: ["floor"] }),
      );
      expect(p.selected).toEqual([]);
      expect(p.omitted.find((c) => c.cargo.id === "2")?.reason).toContain(
        "остановлена на перевозке 1",
      );
    }
  });
  it("stops on floor space even when weight and volume still allow further cargo", () => {
    const rows = [
      cargo("1", 100, 1),
      cargo("2", 100, 1, { customerId: "floor" }),
      cargo("3", 100, 1),
    ];
    const p = planLoad(
      rows,
      options({
        strictSelection: true,
        floorCustomers: ["floor"],
        pallets: { "2": 20 },
      }),
    );
    expect(p.selected.map((c) => c.id)).toEqual(["1"]);
  });
});

it("reports monotonic progress for layout variants, including strict selection", () => {
  for (const strictSelection of [false, true]) {
    const events: { completed: number; total: number; bestVolume: number }[] =
      [];
    const plan = planLoad(
      [cargo("a", 100, 1)],
      options({ strictSelection }),
      (p) => events.push(p),
    );
    const total = strictSelection ? 3 : 18;
    expect(events.map((e) => e.completed)).toEqual(
      Array.from({ length: total }, (_, i) => i + 1),
    );
    expect(events.every((e) => e.total === total)).toBe(true);
    expect(events.at(-1)!.bestVolume).toBe(plan.volume);
    expect(plan.variantsChecked).toBe(total);
    expect(
      events.every(
        (e, i) => i === 0 || e.bestVolume >= events[i - 1].bestVolume,
      ),
    ).toBe(true);
  }
});

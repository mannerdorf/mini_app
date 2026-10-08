import { describe, it, expect } from "vitest";
import { pack3d, packingUnits } from "./packing3d";
import { auditPacking } from "./packingEngines";
import { planLoad } from "./planner";
import { anonymousJob } from "./anonymousJob";
import type { PackageGroup, PlanOptions, TmsCargo } from "./model";

const cargo = (id: string, weight = 100, volume = 1, places = 1): TmsCargo => ({
  id,
  number: id,
  customerId: `customer-${id}`,
  customer: `Secret company ${id}`,
  receiver: "Secret recipient",
  route: "KGD → MSK",
  received: "2026-10-01",
  readiness: "ready",
  reason: "",
  updatedAt: null,
  weight,
  volume,
  places,
});
const box = (extra: Partial<PackageGroup> = {}): PackageGroup => ({
  count: 1,
  length: 1,
  width: 1,
  height: 1,
  weight: 100,
  pallet: false,
  floorOnly: false,
  stackable: true,
  maxTopLoad: 1000,
  rotate: true,
  ...extra,
});
const options = (extra: Partial<PlanOptions> = {}): PlanOptions => ({
  vehicle: {
    id: "test",
    name: "test",
    mode: "road",
    payload: 10000,
    volume: 8,
    compartments: [{ length: 2, width: 2, height: 2 }],
  },
  order: "fifo",
  strictSelection: false,
  priority: [],
  floorCustomers: [],
  pallets: {},
  palletLength: 1.2,
  palletWidth: 0.8,
  reservePercent: 0,
  estimatedStacking: "height",
  ...extra,
});
for (const engine of ["laff", "loadza"] as const)
  describe(engine, () => {
    it("sums split weight reaching a shared ancestor exactly once", () => {
      const o = options({
        engine,
        strictSelection: true,
        vehicle: {
          ...options().vehicle,
          volume: 4,
          compartments: [{ length: 1, width: 1, height: 4 }],
        },
        packages: {
          a: [box({ weight: 500, maxTopLoad: 175 })],
          b: [box({ count: 2, width: 0.5, weight: 50 })],
          c: [box({ weight: 50 })],
          d: [box({ weight: 50 })],
        },
      });
      const p = planLoad(
        [
          cargo("a", 500),
          cargo("b", 100, 1, 2),
          cargo("c", 50),
          cargo("d", 50),
        ],
        o,
      );
      expect(p.selected.map((c) => c.id)).toEqual(["a", "b", "c"]);
      expect(p.placements.find((p) => p.cargoId === "a")!.topLoad).toBe(150);
      expect(
        p.placements.filter((p) => p.cargoId === "b").map((p) => p.topLoad),
      ).toEqual([25, 25]);
    });
    it("reuses lower support faces between mixed-height tiers instead of losing that space", () => {
      const rows = Array.from({ length: 4 }, (_, i) =>
        cargo(String(i + 1), 1100 + i * 100, 4.5 + i * 0.5, 8),
      );
      const o = options({
        engine,
        vehicle: {
          id: "tent",
          name: "tent",
          mode: "road",
          payload: 20000,
          volume: 89.9,
          compartments: [{ length: 13.6, width: 2.45, height: 2.7 }],
        },
      });
      const p = planLoad(rows, o);
      expect(p.volume).toBe(21);
      expect(p.placements).toHaveLength(32);
      expect(p.placements.some((p) => p.z > 0)).toBe(true);
    });
    it("does not invent a single place when aggregate place count is missing", () => {
      const p = planLoad(
        [{ ...cargo("a"), places: null }],
        options({ engine }),
      );
      expect(p.selected).toHaveLength(0);
      expect(p.omitted[0].reason).toContain("количество грузовых мест");
    });
    it("uses all tiers and exactly preserves anonymous aggregate weight, volume and place count", () => {
      const rows = [cargo("1", 800, 8, 8)],
        o = options({ engine });
      const p = planLoad(rows, o);
      expect(p.volume).toBe(8);
      expect(p.weight).toBe(800);
      expect(p.placements).toHaveLength(8);
      expect(p.placements.filter((x) => x.z > 0)).toHaveLength(4);
      expect(
        auditPacking(
          p.placements,
          packingUnits(rows, o),
          o.vehicle.compartments,
        ),
      ).toBeNull();
    });
    it("places a lighter customer's box above a dense pallet, but rejects an unauthorized second pallet", () => {
      const o = options({
        engine,
        vehicle: {
          ...options().vehicle,
          volume: 3,
          compartments: [{ length: 1, width: 1, height: 3 }],
        },
        packages: {
          a: [box({ weight: 500, pallet: true, floorOnly: true })],
          b: [box({ weight: 10 })],
          c: [box({ weight: 5, pallet: true })],
        },
      });
      const p = planLoad([cargo("b", 10), cargo("a", 500), cargo("c", 5)], o);
      expect(p.selected.map((c) => c.id).sort()).toEqual(["a", "b"]);
      expect(p.placements.find((p) => p.cargoId === "a")!.z).toBe(0);
      expect(p.placements.find((p) => p.cargoId === "b")!.z).toBe(1);
    });
    it("enforces the sum of upper loads through the entire stack", () => {
      const o = options({
        engine,
        strictSelection: true,
        vehicle: {
          ...options().vehicle,
          volume: 3,
          compartments: [{ length: 1, width: 1, height: 3 }],
        },
        packages: {
          a: [box({ weight: 500, maxTopLoad: 100 })],
          b: [box({ weight: 80 })],
          c: [box({ weight: 30 })],
        },
      });
      const p = planLoad([cargo("a", 500), cargo("b", 80), cargo("c", 30)], o);
      expect(p.selected.map((c) => c.id)).toEqual(["a", "b"]);
    });
    it("allows a larger top-load factor without an extra one-own-weight ceiling", () => {
      const o = options({
        engine,
        vehicle: {
          ...options().vehicle,
          volume: 2,
          compartments: [{ length: 1, width: 1, height: 2 }],
        },
        packages: {
          a: [box({ height: 0.5, weight: 100, maxTopLoad: 300 })],
          b: [box({ height: 1.5, weight: 250 })],
        },
      });
      const p = planLoad([cargo("a", 100, 0.5), cargo("b", 250, 1.5)], o);
      expect(p.selected).toHaveLength(2);
      expect(p.placements.find((p) => p.cargoId === "b")!.z).toBe(0.5);
    });
    it("never publishes a partially loaded shipment and stops strict selection at the first failure", () => {
      const rows = [cargo("a", 100, 9, 9), cargo("b", 100, 1)];
      const p = planLoad(rows, options({ engine, strictSelection: true }));
      expect(p.selected).toHaveLength(0);
      expect(p.omitted).toHaveLength(2);
      expect(
        planLoad(rows, options({ engine })).selected.map((c) => c.id),
      ).toEqual(["b"]);
    });
    it("uses measured rectangular dimensions and separate compartments", () => {
      const o = options({
        engine,
        vehicle: {
          ...options().vehicle,
          volume: 4,
          compartments: [
            { length: 2, width: 1, height: 1 },
            { length: 2, width: 1, height: 1 },
          ],
        },
        packages: { a: [box({ count: 2, length: 2, width: 1, weight: 50 })] },
      });
      const p = planLoad([cargo("a", 100, 4, 2)], o);
      expect(p.placements).toHaveLength(2);
      expect(new Set(p.placements.map((p) => p.compartment)).size).toBe(2);
      expect(p.estimatedPlaces).toBe(0);
    });
  });
it("audits tampered coordinates and upper loads independently of the solver metadata", () => {
  const rows = [cargo("a", 200, 2, 2)],
    o = options();
  const units = packingUnits(rows, o),
    placed = pack3d(rows, o, "loadza-layer")!;
  placed[1] = { ...placed[1], x: placed[0].x, y: placed[0].y, z: placed[0].z };
  expect(auditPacking(placed, units, o.vehicle.compartments)).toBe(
    "Пересечение грузовых мест",
  );
});
it("removes business identifiers before calculation and restores every reference afterwards", () => {
  const rows = [cargo("private-uuid", 800, 8, 8)];
  const o = options({ engine: "loadza", priority: [rows[0].customerId] });
  const job = anonymousJob(rows, o);
  const payload = JSON.stringify({ cargo: job.cargo, options: job.options });
  expect(payload).not.toContain("private-uuid");
  expect(payload).not.toContain("Secret");
  expect(payload).not.toContain("KGD");
  const restored = job.restore(planLoad(job.cargo, job.options));
  expect(restored.selected[0]).toBe(rows[0]);
  expect(
    restored.placements.every(
      (p) => p.cargoId === rows[0].id && p.unit.startsWith(`${rows[0].id}/`),
    ),
  ).toBe(true);
  expect(
    restored.placements
      .flatMap((p) => p.supports ?? [])
      .every((s) => s.unit.startsWith(`${rows[0].id}/`)),
  ).toBe(true);
});

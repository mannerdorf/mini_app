import type { TmsCargo, PlanOptions, PackageGroup, Placement } from "./model";
import { packFloor, type FloorRect } from "./packing";
const EPS = 1e-6;
export function packageGroups(
  c: TmsCargo,
  o: PlanOptions,
): { groups: PackageGroup[]; estimated: boolean } {
  if (o.packages?.[c.id]?.length)
    return { groups: o.packages[c.id], estimated: false };
  const pallet = o.floorCustomers.includes(c.customerId);
  const count = pallet
    ? o.pallets[c.id]
    : Number.isInteger(c.places) && c.places! > 0
      ? c.places!
      : 1;
  const v = (c.volume ?? 0) / count;
  const weight = (c.weight ?? 0) / count;
  const factor = o.estimatedTopLoadFactor ?? 2;
  const byHeight = o.estimatedStacking === "height";
  // An explicit estimate, never a claim about actual individual package dimensions.
  const width = pallet
    ? o.palletWidth
    : Math.min(Math.cbrt(v), ...o.vehicle.compartments.map((b) => b.width));
  const height = pallet
    ? v / (o.palletLength * width)
    : Math.min(Math.cbrt(v), ...o.vehicle.compartments.map((b) => b.height));
  const length = pallet ? o.palletLength : v / (width * height);
  return {
    estimated: true,
    groups: [
      {
        count,
        length,
        width,
        height,
        weight,
        pallet,
        floorOnly: pallet,
        stackable: byHeight || factor > 0,
        // Vehicle payload is only a numeric bound here, not verified packaging strength.
        maxTopLoad: byHeight ? o.vehicle.payload : weight * factor,
        rotate: true,
      },
    ],
  };
}
export function packageProblem(c: TmsCargo, o: PlanOptions): string | null {
  const { groups, estimated } = packageGroups(c, o);
  if (estimated && o.requireDimensions)
    return "Введите габариты и массу грузовых мест";
  if (
    groups.some(
      (g) =>
        !Number.isInteger(g.count) ||
        g.count < 1 ||
        g.count > 1000 ||
        ![g.length, g.width, g.height, g.weight].every(
          (n) => Number.isFinite(n) && n > 0,
        ) ||
        !Number.isFinite(g.maxTopLoad) ||
        g.maxTopLoad < 0,
    )
  )
    return "Проверьте размеры, количество, массу и нагрузку сверху";
  if (groups.reduce((s, g) => s + g.count, 0) > 1000)
    return "Не более 1000 грузовых мест в одной перевозке";
  if (!estimated) {
    const w = groups.reduce((s, g) => s + g.weight * g.count, 0);
    if (Math.abs(w - c.weight!) > Math.max(0.1, c.weight! * 0.01))
      return "Масса мест должна совпадать с массой перевозки (допуск 1%)";
  }
  return null;
}
export const packedVolume = (c: TmsCargo, o: PlanOptions) =>
  Math.max(
    c.volume ?? 0,
    packageGroups(c, o).groups.reduce(
      (s, g) => s + g.count * g.length * g.width * g.height,
      0,
    ),
  );
export const packedWeight = (c: TmsCargo, o: PlanOptions) =>
  Math.max(
    c.weight ?? 0,
    packageGroups(c, o).groups.reduce((s, g) => s + g.count * g.weight, 0),
  );
type Unit = PackageGroup & {
  cargoId: string;
  unit: string;
  estimated: boolean;
  density: number;
};
type Surface = { parent: string | null; z: number; free: FloorRect[] };
type Bin = { surfaces: Surface[]; placements: Placement[] };
/** Conservative 3D packing: full support by one box, upright only, cumulative load down the support chain. */
export function pack3d(cargo: TmsCargo[], o: PlanOptions): Placement[] | null {
  const bins: Bin[] = o.vehicle.compartments.map((b) => ({
    placements: [],
    surfaces: [
      {
        parent: null,
        z: 0,
        free: [{ x: 0, y: 0, length: b.length, width: b.width }],
      },
    ],
  }));
  const groups = cargo
    .map((c) => {
      const { groups, estimated } = packageGroups(c, o);
      const units: Unit[] = groups.flatMap((g, i) =>
        Array.from({ length: g.count }, (_, j) => ({
          ...g,
          pallet: g.pallet || o.floorCustomers.includes(c.customerId),
          floorOnly:
            g.floorOnly || (g.pallet && !g.palletStacking) || o.floorCustomers.includes(c.customerId),
          cargoId: c.id,
          unit: `${c.id}/${i}/${j}`,
          estimated,
          density: g.weight / (g.length * g.width * g.height),
        })),
      );
      units.sort(
        (a, b) =>
          Number(b.floorOnly) - Number(a.floorOnly) ||
          Number(b.stackable) - Number(a.stackable) ||
          b.density - a.density ||
          b.weight - a.weight,
      );
      return {
        units,
        rank: Math.max(
          ...units.map((u) => (u.floorOnly ? 2 : u.stackable ? 1 : 0)),
        ),
        density: c.weight! / c.volume!,
      };
    })
    .sort((a, b) => b.rank - a.rank || b.density - a.density);
  if (groups.reduce((s, g) => s + g.units.length, 0) > 2000)
    throw new Error(
      "Для 3D-расчёта выберите до 2000 мест. Сузьте период или маршрут.",
    );
  for (const { units } of groups) {
    let fitted = false;
    for (let bi = 0; bi < bins.length; bi++) {
      const bin: Bin = structuredClone(bins[bi]),
        bounds = o.vehicle.compartments[bi];
      const byUnit = new Map(bin.placements.map((p) => [p.unit, p]));
      let ok = true;
      for (const u of units) {
        let candidate: {
          si: number;
          layout: NonNullable<ReturnType<typeof packFloor>>;
          ancestors: Placement[];
          score: number;
        } | null = null;
        bin.surfaces.forEach((s, si) => {
          if (
            !s.free.length ||
            (u.floorOnly && s.z > EPS) ||
            s.z + u.height > bounds.height + EPS
          )
            return;
          const layout = packFloor(s.free, 1, u.length, u.width, u.rotate);
          if (!layout) return;
          if (u.pallet && s.parent) {
            const base = byUnit.get(s.parent)!;
            if (!u.palletStacking || !base.pallet || !base.palletStacking) return;
          }
          const ancestors: Placement[] = [];
          let parent = s.parent;
          while (parent) {
            const p = byUnit.get(parent)!;
            if (
              p.topLoad + u.weight > p.maxTopLoad + EPS ||
              u.density > p.density + EPS ||
              u.weight > p.weight + EPS
            )
              return;
            ancestors.push(p);
            parent = p.support;
          }
          // Prefer an allowed stack to consuming more floor. Lower available layer wins.
          const score =
            (s.parent ? 0 : 10000) + s.z * 100 + layout.placements[0].x;
          if (!candidate || score < candidate.score)
            candidate = { si, layout, ancestors, score };
        });
        if (!candidate) {
          ok = false;
          break;
        }
        const fit = candidate as {
          si: number;
          layout: NonNullable<ReturnType<typeof packFloor>>;
          ancestors: Placement[];
          score: number;
        };
        const surface = bin.surfaces[fit.si];
        const rect = fit.layout.placements[0];
        surface.free = fit.layout.free;
        for (const a of fit.ancestors) a.topLoad += u.weight;
        const placed: Placement = {
          ...rect,
          z: surface.z,
          height: u.height,
          weight: u.weight,
          density: u.density,
          cargoId: u.cargoId,
          unit: u.unit,
          pallet: u.pallet,
          palletStacking: !!u.palletStacking,
          estimated: u.estimated,
          compartment: bi,
          support: surface.parent,
          topLoad: 0,
          maxTopLoad: u.stackable ? u.maxTopLoad : 0,
        };
        bin.placements.push(placed);
        byUnit.set(placed.unit, placed);
        if (placed.maxTopLoad > 0)
          bin.surfaces.push({
            parent: placed.unit,
            z: placed.z + placed.height,
            free: [rect],
          });
      }
      if (ok) {
        bins[bi] = bin;
        fitted = true;
        break;
      }
    }
    if (!fitted) return null;
  }
  // x = 0 is the front wall. Keep the packing origin instead of moving cargo
  // toward the center: a mass-center estimate is not an axle-load calculation.
  return bins.flatMap((b) => b.placements);
}

import type { TmsCargo, PlanOptions, LoadPlan } from "./model";

/** Shared anonymous problem for all solvers; business identities stay in UI. */
export function anonymousJob(cargo: TmsCargo[], options: PlanOptions) {
  const cargoIds = new Map(cargo.map((c, i) => [c.id, `cargo-${i + 1}`]));
  const customers = new Map(
    [...new Set(cargo.map((c) => c.customerId))].map((id, i) => [
      id,
      `group-${i + 1}`,
    ]),
  );
  const routes = new Map(
    [...new Set(cargo.map((c) => c.route))].map((id, i) => [
      id,
      `route-${i + 1}`,
    ]),
  );
  const keyed = <T>(values: Record<string, T>) =>
    Object.fromEntries(
      Object.entries(values)
        .filter(([id]) => cargoIds.has(id))
        .map(([id, value]) => [cargoIds.get(id)!, value]),
    );
  const anonymousOptions: PlanOptions = {
    ...options,
    vehicle: {
      ...options.vehicle,
      id: "vehicle",
      name: "Транспортное средство",
    },
    packages: options.packages ? keyed(options.packages) : undefined,
    pallets: keyed(options.pallets),
    priority: options.priority.flatMap((id) =>
      customers.has(id) ? [customers.get(id)!] : [],
    ),
    floorCustomers: options.floorCustomers.flatMap((id) =>
      customers.has(id) ? [customers.get(id)!] : [],
    ),
  };
  const ranks = new Map(
    [...cargo]
      .sort((a, b) =>
        a.number.localeCompare(b.number, undefined, { numeric: true }),
      )
      .map((c, i) => [c.id, i + 1]),
  );
  const anonymousCargo: TmsCargo[] = cargo.map((c) => ({
    id: cargoIds.get(c.id)!,
    number: String(ranks.get(c.id)).padStart(6, "0"),
    customer: customers.get(c.customerId)!,
    customerId: customers.get(c.customerId)!,
    receiver: "",
    received: c.received,
    route: !c.route ? "" : c.route.includes("?") ? "?" : routes.get(c.route)!,
    weight: c.weight,
    volume: c.volume,
    places: c.places,
    readiness: c.readiness,
    reason: "",
    updatedAt: null,
  }));
  const originals = new Map(cargo.map((c) => [cargoIds.get(c.id)!, c]));
  const unitId = (unit: string) => {
    const index = unit.indexOf("/");
    const id = unit.slice(0, index);
    return `${originals.get(id)?.id ?? id}${unit.slice(index)}`;
  };
  const restore = (plan: LoadPlan): LoadPlan => ({
    ...plan,
    selected: plan.selected.map((c) => originals.get(c.id)!),
    omitted: plan.omitted.map((row) => ({
      cargo: originals.get(row.cargo.id)!,
      reason: row.reason.replace(/перевозке (\d+)/g, (text, number) => {
        const c = anonymousCargo.find((c) => c.number === number);
        return c ? `перевозке ${originals.get(c.id)!.number}` : text;
      }),
    })),
    placements: plan.placements.map((p) => ({
      ...p,
      cargoId: originals.get(p.cargoId)!.id,
      unit: unitId(p.unit),
      support: p.support ? unitId(p.support) : null,
      supports: p.supports?.map((s) => ({ ...s, unit: unitId(s.unit) })),
    })),
  });
  return { cargo: anonymousCargo, options: anonymousOptions, restore };
}

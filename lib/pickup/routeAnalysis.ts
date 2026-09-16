import type { Job, Route } from "./model.js";
import type { DgisDebugEntry } from "./dgisRouteError.js";

export type Point = { lat: number; lon: number };
export type Leg = { distance: number; duration: number } | null;
export type Visit = {
  id: string;
  arrival: number;
  departure: number;
  wait: number;
  late: number;
};
export type Assessment = {
  ids: string[];
  km: number;
  minutes: number;
  waiting: number;
  finish: number;
  lateStops: number;
  lateMinutes: number;
  depotLate: number;
  shiftLate: number;
  unreachable: number;
  visits: Visit[];
};
export type AnalysisResult = {
  status: "green" | "amber" | "red" | "gray";
  message: string;
  warnings: string[];
  checkedAt: string;
  signature: string;
  routeVersion: number;
  originLabel: string;
  departure: string;
  traffic: "jam" | "statistics";
  current?: Assessment;
  proposed?: Assessment;
  ids?: string[];
  points?: { id: string; address: string; point: Point }[];
  currentGeometry?: number[][][];
  proposedGeometry?: number[][][];
  /** Ответ 2ГИС при ошибке расчёта (без ключа API). */
  dgisDebug?: DgisDebugEntry[];
};
export const truckFields = [
  ["truckMaxMass", "Разрешённая максимальная масса, т", "max_perm_mass"],
  ["truckMass", "Полная масса с грузом в конце рейса, т", "mass"],
  ["truckAxleLoad", "Максимальная нагрузка на ось, т", "axle_load"],
  ["truckHeight", "Внешняя высота ТС, м", "height"],
  ["truckWidth", "Внешняя ширина ТС, м", "width"],
  ["truckLength", "Полная длина ТС, м", "length"],
] as const;
export function minutes(value: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value || "")) return NaN;
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}
export function timeLabel(value: number) {
  if (!Number.isFinite(value)) return "—";
  const n = Math.ceil(value),
    days = Math.floor(n / 1440);
  return `${String(Math.floor(n / 60) % 24).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}${days ? ` (+${days} д.)` : ""}`;
}
export function pointValid(point: Point | undefined | null): point is Point {
  return (
    !!point &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lon) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lon) <= 180
  );
}
export type AnalysisPlan = {
  jobs: Job[];
  matrix: Leg[][];
  departure: number;
  depotFrom: number;
  depotTo: number;
  shiftTo: number; // Matrix: 0=origin, 1..jobs.length=jobs, last=depot.
};
export function assess(plan: AnalysisPlan, order: number[]): Assessment {
  let clock = plan.departure,
    distance = 0,
    waiting = 0,
    previous = 0,
    unreachable = 0;
  const visits: Visit[] = [];
  const travel = (next: number) => {
    const leg = plan.matrix[previous]?.[next];
    if (!leg) {
      unreachable++;
      clock += 24 * 60;
    } else {
      clock += leg.duration / 60;
      distance += leg.distance;
    }
    previous = next;
  };
  for (const index of order) {
    const job = plan.jobs[index];
    travel(index + 1);
    const arrival = clock,
      wait = Math.max(0, minutes(job.data.windowFrom) - clock);
    clock += wait + job.data.serviceMinutes;
    waiting += wait;
    visits.push({
      id: job.id,
      arrival,
      departure: clock,
      wait,
      late: Math.max(0, clock - minutes(job.data.windowTo)),
    });
  }
  travel(plan.jobs.length + 1);
  const depotWait = Math.max(0, plan.depotFrom - clock);
  clock += depotWait;
  waiting += depotWait;
  return {
    ids: order.map((i) => plan.jobs[i].id),
    km: distance / 1000,
    minutes: clock - plan.departure,
    waiting,
    finish: clock,
    lateStops: visits.filter((v) => v.late > 0).length,
    lateMinutes: visits.reduce((n, v) => n + v.late, 0),
    depotLate: Math.max(0, clock - plan.depotTo),
    shiftLate: Math.max(0, clock - plan.shiftTo),
    unreachable,
    visits,
  };
}
export function compare(a: Assessment, b: Assessment) {
  const score = (x: Assessment) => [
    x.unreachable,
    x.lateStops,
    x.lateMinutes,
    x.depotLate + x.shiftLate,
    x.minutes,
    x.km,
  ];
  const aa = score(a),
    bb = score(b);
  for (let i = 0; i < aa.length; i++)
    if (Math.abs(aa[i] - bb[i]) > 1e-6) return aa[i] - bb[i];
  return 0;
}
/** Bounded local search: swaps and reversals. All started stops remain fixed. */
export function optimise(plan: AnalysisPlan) {
  const original = plan.jobs.map((_, i) => i);
  let order = [...original],
    best = assess(plan, order);
  const slots = original.filter((i) => plan.jobs[i].status === "pending");
  for (let pass = 0; pass < 12; pass++) {
    let improved = false,
      next = order;
    for (let a = 0; a < slots.length; a++)
      for (let b = a + 1; b < slots.length; b++) {
        for (const reverse of [false, true]) {
          const candidate = [...order];
          if (reverse)
            for (let k = a; k <= b; k++)
              candidate[slots[k]] = order[slots[b - (k - a)]];
          else
            [candidate[slots[a]], candidate[slots[b]]] = [
              candidate[slots[b]],
              candidate[slots[a]],
            ];
          const score = assess(plan, candidate);
          if (compare(score, best) < 0) {
            best = score;
            next = candidate;
            improved = true;
          }
        }
      }
    order = next;
    if (!improved) break;
  }
  const current = assess(plan, original);
  // Ignore negligible travel savings, but retain any reduction of risks.
  const risk = (x: Assessment) =>
    x.unreachable + x.lateStops + x.lateMinutes + x.depotLate + x.shiftLate;
  const meaningful =
    compare(best, current) < 0 &&
    (risk(best) < risk(current) ||
      current.minutes - best.minutes >= 5 ||
      (current.minutes >= best.minutes && current.km - best.km >= 1));
  return { current, proposed: meaningful ? best : undefined };
}
export function mergedOrder(allJobs: Job[], proposed: string[]) {
  const remaining = new Set(proposed);
  let index = 0;
  return allJobs.map((j) => (remaining.has(j.id) ? proposed[index++] : j.id));
}
export function analysisSignature(
  route: Route,
  jobs: Job[],
  resources: unknown,
) {
  // Stable serialized revision data, also checked on apply. No credentials.
  return JSON.stringify([
    route.id,
    route.version,
    route.status,
    route.snapshot,
    jobs.map((j) => [j.id, j.version, j.status, j.position]),
    resources,
  ]);
}

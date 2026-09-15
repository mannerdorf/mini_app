import { it, expect } from "vitest";
import {
  assess,
  optimise,
  mergedOrder,
  type AnalysisPlan,
} from "./routeAnalysis";
import type { Job } from "./model";
const job = (id: string, from = "08:00", to = "18:00", service = 20) =>
  ({
    id,
    status: "pending",
    data: { windowFrom: from, windowTo: to, serviceMinutes: service },
  }) as Job;
function plan(jobs: Job[]): AnalysisPlan {
  return {
    jobs,
    departure: 480,
    depotFrom: 480,
    depotTo: 1080,
    shiftTo: 1080,
    matrix: Array.from({ length: jobs.length + 2 }, () =>
      Array.from({ length: jobs.length + 2 }, () => ({
        distance: 1000,
        duration: 600,
      })),
    ),
  };
}
it("includes waiting and loading, requires loading to finish before window closes, checks depot and shift", () => {
  const p = plan([job("a", "09:00", "09:10", 20)]);
  p.depotTo = 550;
  p.shiftTo = 565;
  const result = assess(p, [0]);
  expect(result.waiting).toBe(50);
  expect(result.finish).toBe(570);
  expect(result.lateStops).toBe(1);
  expect(result.lateMinutes).toBe(10);
  expect(result.depotLate).toBe(20);
  expect(result.shiftLate).toBe(5);
});
it("chooses a longer path if it avoids a missed pickup", () => {
  const p = plan([job("a"), job("urgent", "08:00", "08:35")]);
  p.matrix[0][2] = { distance: 9000, duration: 600 };
  const result = optimise(p);
  expect(result.current.lateStops).toBe(1);
  expect(result.proposed?.ids).toEqual(["urgent", "a"]);
  expect(result.proposed?.lateStops).toBe(0);
  expect(result.proposed!.km).toBeGreaterThan(result.current.km);
});
it("fixes started stops and preserves completed slots when applying remaining order", () => {
  const a = job("a"),
    b = job("b"),
    c = job("c");
  b.status = "arrived";
  const p = plan([a, b, c]);
  p.matrix[0][1] = { distance: 90000, duration: 5000 };
  const result = optimise(p);
  expect(result.proposed?.ids[1] || result.current.ids[1]).toBe("b");
  expect(
    mergedOrder(
      [a, { ...job("done"), status: "picked_up" }, b, c],
      ["c", "b", "a"],
    ),
  ).toEqual(["c", "done", "b", "a"]);
});
it("cannot label an unreachable route as feasible, and ignores insignificant savings", () => {
  const p = plan([job("a"), job("b")]);
  p.matrix[0][1] = null;
  expect(optimise(p).current.unreachable).toBe(1);
  expect(optimise(p).proposed?.unreachable).toBe(0);
  const q = plan([job("a"), job("b")]);
  q.matrix[0][1] = { distance: 1100, duration: 620 };
  expect(optimise(q).proposed).toBeUndefined();
});

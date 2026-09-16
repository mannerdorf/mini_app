import { describe, it, expect } from "vitest";
import type { Job, Route, Resource } from "../../../lib/pickup/model";
import {
  attentionItems,
  movePendingStop,
  currentDriverJob,
  canDepositJobs,
  publicationIssues,
} from "./operations";
const job = (id: string, status: Job["status"] = "pending"): Job =>
  ({
    id,
    status,
    date: "2026-09-15",
    resolution: null,
    data: { windowFrom: "10:00", windowTo: "17:00", weightKg: 10, volumeM3: 1 },
  }) as Job;
describe("pickup operational guidance", () => {
  it("uses city local time and excludes future days and completed pickups from closing alerts", () => {
    const now = new Date("2026-09-15T13:45:00Z");
    expect(attentionItems([job("a")], [], "moscow", now)[0].title).toContain(
      "15 мин",
    );
    expect(attentionItems([job("a")], [], "kaliningrad", now)).toHaveLength(0);
    expect(
      attentionItems(
        [{ ...job("a"), date: "2026-09-16" }, job("b", "picked_up")],
        [],
        "moscow",
        now,
      ),
    ).toHaveLength(0);
  });
  it("only flags unresolved issues and pending route acknowledgements", () => {
    const route = {
      id: "r",
      status: "started",
      version: 4,
      acknowledged_version: 3,
      snapshot: {},
    } as Route;
    const items = attentionItems(
      [job("a", "problem"), { ...job("b", "partial"), resolution: "Принято" }],
      [route],
      "moscow",
      new Date("2026-09-15T07:00:00Z"),
    );
    expect(items.map((i) => i.kind)).toEqual(["problem", "ack"]);
  });
  it("allows reorder only when all fixed positions remain fixed", () => {
    const jobs = [job("a"), job("b", "picked_up"), job("c"), job("d")];
    expect(movePendingStop(jobs, "d", "c")).toEqual(["a", "b", "d", "c"]);
    expect(movePendingStop(jobs, "a", "c")).toBeNull();
    expect(movePendingStop(jobs, "b", "a")).toBeNull();
  });
  it("prioritizes arrived point and holds depot handoff for unresolved issues", () => {
    expect(currentDriverJob([job("a"), job("b", "arrived")])?.id).toBe("b");
    expect(canDepositJobs([])).toBe(false);
    expect(canDepositJobs([job("a", "picked_up"), job("b", "partial")])).toBe(
      false,
    );
    expect(
      canDepositJobs([
        job("a", "picked_up"),
        { ...job("b", "partial"), resolution: "Принято" },
      ]),
    ).toBe(true);
  });
  it("blocks publication for unavailable resources, windows and overload", () => {
    const route = {
      driver_id: "d",
      vehicle_id: "v",
      depot_id: "s",
      start_time: "18:00",
    } as Route;
    const resources = [
      { id: "d", active: true, data: { from: "08:00", to: "20:00" } },
      { id: "v", active: true, data: { capacityKg: "5" } },
      { id: "s", active: true, data: { to: "18:00" } },
    ] as Resource[];
    expect(publicationIssues(route, [job("a")], resources).length).toBe(1);
    expect(
      publicationIssues({ ...route, start_time: "09:00" }, [job("a")], []),
    ).toHaveLength(3);
  });
});

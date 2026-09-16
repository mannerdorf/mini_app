import { describe, expect, it } from "vitest";
import { buildDispatcherManualJobUpdate } from "./dispatcherJobStatus";
import type { Job } from "./model";

const job = {
  id: "j1",
  status: "pending",
  actual_places: null,
  resolution: "",
  data: { places: [{ count: 2 }] },
} as unknown as Job;

describe("buildDispatcherManualJobUpdate", () => {
  it("requires note", () => {
    expect(() =>
      buildDispatcherManualJobUpdate(job, "arrived", { note: "" }),
    ).toThrow();
  });

  it("sets picked_up with places count", () => {
    const u = buildDispatcherManualJobUpdate(job, "picked_up", {
      note: "Водитель без связи",
      actual_places: 2,
    });
    expect(u.status).toBe("picked_up");
    expect(u.actual_places).toBe(2);
  });

  it("sets partial when count differs", () => {
    const u = buildDispatcherManualJobUpdate(job, "picked_up", {
      note: "Забрали одно место",
      actual_places: 1,
    });
    expect(u.status).toBe("partial");
  });
});

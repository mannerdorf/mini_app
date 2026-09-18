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

 describe("dispatcher warehouse handoff", () => {
  it("requires an order number before depositing", () => {
    expect(() => buildDispatcherManualJobUpdate(job, "deposited", {note:"Принят складом"})).toThrow("Введите номер заявки");
  });
  it("preserves leading zeros and trims entered number", () => {
    const result = buildDispatcherManualJobUpdate(job, "deposited", {note:"Принят складом", zayavkaNumber:" 000018123 "});
    expect(result.status).toBe("deposited");
    expect(result.zayavkaNumber).toBe("000018123");
  });
  it("uses an existing number when omitted, but rejects explicit blank or invalid input", () => {
    const existing = {...job, data:{...job.data, zayavkaNumber:"000018123"}};
    expect(buildDispatcherManualJobUpdate(existing,"deposited",{note:"Принят"}).zayavkaNumber).toBe("000018123");
    for(const zayavkaNumber of ["", "   ", 123, "1".repeat(101)]) {
      expect(() => buildDispatcherManualJobUpdate(existing,"deposited",{note:"Принят",zayavkaNumber})).toThrow();
    }
  });
 });

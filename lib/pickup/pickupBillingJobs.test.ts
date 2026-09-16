import { describe, it, expect } from "vitest";
import type { Job } from "./model";
import { pickupJobOnBillingTab } from "./pickupBillingJobs";

function job(
  patch: Partial<Job> = {},
  dataPatch: Partial<Job["data"]> = {},
): Job {
  return {
    id: "1",
    city: "moscow",
    date: "2026-09-15",
    status: "deposited",
    route_id: "r1",
    position: 1,
    actual_places: 2,
    note: "",
    version: 1,
    resolution: "",
    data: {
      senderName: "S",
      customerName: "C",
      cargoNumber: "TR-100",
      zayavkaNumber: "",
      windowFrom: "10:00",
      windowTo: "12:00",
      ...dataPatch,
    },
    ...patch,
  } as Job;
}

describe("pickupJobOnBillingTab", () => {
  it("includes deposited jobs with cargo number", () => {
    expect(pickupJobOnBillingTab(job({}))).toBe(true);
  });
  it("excludes other statuses and empty cargo number", () => {
    expect(pickupJobOnBillingTab(job({ status: "picked_up" }))).toBe(false);
    expect(
      pickupJobOnBillingTab(job({}, { cargoNumber: "  " })),
    ).toBe(false);
    expect(pickupJobOnBillingTab(job({ status: "pending" }))).toBe(false);
  });
});

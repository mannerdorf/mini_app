import { describe, it, expect } from "vitest";
import {
  normalizeJob,
  plannedPlaces,
  validDate,
  safeUrl,
  driverJob,
  routeWarnings,
  validateCompletion,
  pickupJobNumberLabel,
  type Job,
  type Resource,
} from "./model";

export const validJobData = () =>
  normalizeJob({
    customerInn: "1",
    senderInn: "2",
    address: "Москва, склад 1",
    windowFrom: "10:00",
    windowTo: "16:00",
    contacts: [
      {
        name: "Контакт",
        phone: "+79990000000",
        extension: "418",
        purpose: "Звонки",
      },
    ],
    documents: [
      { number: "ЛЮ-28133", date: "2026-04-16" },
      { number: "22355", date: "" },
    ],
    places: [
      { kind: "Рулон", count: 2, lengthCm: 150, widthCm: 30, heightCm: 30 },
    ],
    weightKg: 37,
    volumeM3: 0.27,
    priceRub: 1500,
    payment: "Оплачен",
  });
describe("pickup validation", () => {
  it("preserves multiple pickup documents and extensions independently", () => {
    const d = validJobData();
    expect(d.documents).toHaveLength(2);
    expect(d.documents[1].date).toBe("");
    expect(d.contacts[0].extension).toBe("418");
    expect(plannedPlaces(d)).toBe(2);
  });
  it("rejects invalid dates, windows, negative loads and fractional packages", () => {
    expect(() => validDate("2026-02-30")).toThrow();
    expect(() =>
      normalizeJob({ ...validJobData(), windowTo: "09:00" }),
    ).toThrow();
    expect(() => normalizeJob({ ...validJobData(), weightKg: -1 })).toThrow();
    expect(() =>
      normalizeJob({ ...validJobData(), places: [{ count: 1.5 }] }),
    ).toThrow();
  });
  it("does not replace missing physical loads with zero", () => {
    const d = normalizeJob({ ...validJobData(), weightKg: "", volumeM3: null });
    expect(d.weightKg).toBeNull();
    expect(d.volumeM3).toBeNull();
  });
  it("rejects script links and partial coordinates", () => {
    expect(() => safeUrl("javascript:alert(1)")).toThrow();
    expect(() =>
      normalizeJob({ ...validJobData(), latitude: 55, longitude: null }),
    ).toThrow();
  });
  it("requires a reason for both shortages and extra places", () => {
    const job = { data: validJobData() } as Job;
    expect(() => validateCompletion(job, 1, "")).toThrow();
    expect(() => validateCompletion(job, 3, "")).toThrow();
    expect(() => validateCompletion(job, 0, "нет груза")).toThrow();
    expect(validateCompletion(job, 1, "Остаток не готов")).toBe(1);
  });
  it("removes customer financials from driver responses", () => {
    const job = { data: validJobData() } as Job;
    expect(driverJob(job).data).not.toHaveProperty("priceRub");
    expect(driverJob(job).data).not.toHaveProperty("payment");
    expect(job.data.priceRub).toBe(1500);
  });
  it("checks both weight and volume and reports incomplete data", () => {
    const jobs = [{ data: validJobData() }] as Job[];
    const vehicle = {
      data: { capacityKg: "20", capacityM3: "0.1" },
    } as Resource;
    expect(routeWarnings(jobs, vehicle)).toHaveLength(2);
    expect(
      routeWarnings([{ data: { ...validJobData(), weightKg: null } }] as Job[]),
    ).toHaveLength(1);
  });
  it("formats internal pickup job number", () => {
    expect(pickupJobNumberLabel(42)).toBe("№42");
    expect(pickupJobNumberLabel(undefined)).toBe("");
  });
});

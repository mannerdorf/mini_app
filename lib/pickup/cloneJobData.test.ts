import { describe, expect, it } from "vitest";
import { cloneJobDataForCopy } from "./cloneJobData";
import type { JobData } from "./model";

const sample: JobData = {
  customerInn: "1",
  customerName: "A",
  senderInn: "2",
  senderName: "B",
  address: "Addr",
  instructions: "",
  directionsUrl: "",
  contacts: [{ name: "X", phone: "+7", extension: "", purpose: "Звонки" }],
  documents: [{ number: "1", date: "2026-01-01" }],
  places: [{ kind: "Короб", count: 1, lengthCm: 10, widthCm: 10, heightCm: 10 }],
  weightKg: 1,
  volumeM3: 1,
  windowFrom: "10:00",
  windowTo: "18:00",
  warehouseHours: "",
  serviceMinutes: 20,
  zayavkaNumber: "Z-1",
  cargoNumber: "",
  priceRub: null,
  payment: "",
  mkadKm: null,
  requirements: "",
  note: "",
  latitude: null,
  longitude: null,
  deliveryMode: "courier",
  addressKind: "pvz",
  pvzRef: "",
  defaultPlaceAddress: "",
  defaultPlaceLatitude: null,
  defaultPlaceLongitude: null,
  defaultPlaceMode: "point",
  defaultPlaceKind: "pvz",
  defaultPlacePvzRef: "",
  scheduleMode: "",
  schedulePattern: "",
  scheduleGroupId: "",
  scheduleWeekdays: "",
  scheduleUntil: "",
  scheduleDates: "",
};

describe("cloneJobDataForCopy", () => {
  it("deep-clones nested arrays", () => {
    const copy = cloneJobDataForCopy(sample);
    expect(copy).toEqual(sample);
    expect(copy.contacts).not.toBe(sample.contacts);
    expect(copy.places).not.toBe(sample.places);
  });
});

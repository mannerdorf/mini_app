import { describe, expect, it } from "vitest";
import { warehouseForCity } from "../../../lib/haulzCalculator/warehouses";
import {
  defaultPickupDefaultPlaceState,
  defaultPlaceStateToJobPatch,
  jobDataToDefaultPlaceState,
} from "./pickupJobDefaultPlaceState";

describe("pickupJobDefaultPlaceState", () => {
  it("defaults to HAULZ warehouse in pickup city", () => {
    const state = defaultPickupDefaultPlaceState("moscow");
    expect(state.deliveryMode).toBe("point");
    const wh = warehouseForCity("moscow");
    expect(defaultPlaceStateToJobPatch(state).defaultPlaceAddress).toBe(
      wh.fullAddress,
    );
    expect(defaultPlaceStateToJobPatch(state).defaultPlaceLatitude).toBe(
      wh.point.lat,
    );
  });

  it("restores saved custom default place", () => {
    const state = jobDataToDefaultPlaceState(
      {
        customerInn: "",
        customerName: "",
        senderInn: "",
        senderName: "",
        address: "",
        instructions: "",
        directionsUrl: "",
        contacts: [],
        documents: [],
        places: [],
        weightKg: null,
        volumeM3: null,
        windowFrom: "10:00",
        windowTo: "18:00",
        warehouseHours: "",
        serviceMinutes: 20,
        zayavkaNumber: "",
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
        defaultPlaceAddress: "Калининград, тест",
        defaultPlaceLatitude: 54.7,
        defaultPlaceLongitude: 20.5,
        defaultPlaceMode: "courier",
        defaultPlaceKind: "custom",
        defaultPlacePvzRef: "",
        scheduleMode: "",
        schedulePattern: "",
        scheduleGroupId: "",
        scheduleWeekdays: "",
        scheduleUntil: "",
        scheduleDates: "",
      },
      "kaliningrad",
    );
    expect(state.deliveryMode).toBe("courier");
    expect(state.query).toBe("Калининград, тест");
  });
});

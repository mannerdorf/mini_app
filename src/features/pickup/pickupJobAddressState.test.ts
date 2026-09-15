import { describe, expect, it } from "vitest";
import {
  defaultPickupAddressState,
  jobDataToPickupAddressState,
  pickupAddressStateToJobPatch,
} from "./pickupJobAddressState";

describe("pickupJobAddressState", () => {
  it("maps custom address with coordinates", () => {
    const state = jobDataToPickupAddressState(
      {
        customerInn: "",
        customerName: "",
        senderInn: "",
        senderName: "",
        address: "Москва, ул. Тест, 1",
        instructions: "",
        directionsUrl: "",
        contacts: [{ name: "Иван", phone: "+7999", extension: "", purpose: "Звонки" }],
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
        latitude: 55.75,
        longitude: 37.62,
        deliveryMode: "courier",
        addressKind: "custom",
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
      },
      "moscow",
    );
    expect(state.addressKind).toBe("custom");
    expect(state.query).toBe("Москва, ул. Тест, 1");
    expect(pickupAddressStateToJobPatch(state).address).toBe("Москва, ул. Тест, 1");
  });

  it("defaults to pvz picker mode", () => {
    const state = defaultPickupAddressState("kaliningrad");
    expect(state.deliveryMode).toBe("courier");
    expect(state.addressKind).toBe("pvz");
    expect(state.city).toBe("kaliningrad");
  });
});

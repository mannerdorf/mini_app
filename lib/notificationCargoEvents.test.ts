import { describe, expect, it } from "vitest";
import {
  getCargoStageEventIdFromState,
  getCargoStageEventsOnStateChange,
  isCargoStageNotificationEnabled,
  isLegacyCoarseDeliveredFlag,
  isRecentNotificationItem,
} from "./notificationCargoEvents.js";

describe("isRecentNotificationItem", () => {
  it("accepts cargo from the last three days", () => {
    const now = Date.parse("2026-08-18T12:00:00Z");
    expect(isRecentNotificationItem({ DatePrih: "2026-08-17" }, now)).toBe(true);
    expect(isRecentNotificationItem({ DatePrih: "17.08.2026" }, now)).toBe(true);
  });

  it("rejects historical cargo and missing dates", () => {
    const now = Date.parse("2026-08-18T12:00:00Z");
    expect(isRecentNotificationItem({ DatePrih: "2026-01-01" }, now)).toBe(false);
    expect(isRecentNotificationItem({ Number: "1" }, now)).toBe(false);
  });
});

describe("getCargoStageEventIdFromState", () => {
  it("maps planned delivery and arrived labels from 1C", () => {
    expect(getCargoStageEventIdFromState("Запланирована доставка")).toBe("delivery_scheduled");
    expect(getCargoStageEventIdFromState("Прибыла в город назначения")).toBe("arrived");
  });
});

describe("isLegacyCoarseDeliveredFlag", () => {
  it("treats delivered-only save as granular stage", () => {
    expect(isLegacyCoarseDeliveredFlag({ delivered: true })).toBe(false);
    expect(isCargoStageNotificationEnabled({ delivered: true }, "delivered")).toBe(true);
    expect(isCargoStageNotificationEnabled({ delivered: true }, "delivery_scheduled")).toBe(false);
  });

  it("detects old coarse delivered with in_transit", () => {
    expect(isLegacyCoarseDeliveredFlag({ in_transit: true, delivered: true })).toBe(true);
  });
});

describe("getCargoStageEventsOnStateChange", () => {
  it("does not notify first-seen historical cargo", () => {
    expect(getCargoStageEventsOnStateChange(null, "Отправлена", true)).toEqual([]);
  });

  it("notifies the current stage for a recent first sighting", () => {
    expect(
      getCargoStageEventsOnStateChange(null, "Отправлена", true, { notifyFirstSeen: true }),
    ).toEqual(["sent"]);
  });

  it("notifies when the mapped stage changes", () => {
    expect(getCargoStageEventsOnStateChange("Отправлена", "Доставлена", false)).toEqual(["delivered"]);
    expect(getCargoStageEventsOnStateChange("Отправлена", "Улетела", false)).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { deviceTokenSuffix, isPushEventAllowedForInn } from "./pushControl.js";

describe("deviceTokenSuffix", () => {
  it("returns last 12 chars for long tokens", () => {
    expect(deviceTokenSuffix("abcdefghijklmnop")).toBe("efghijklmnop");
  });

  it("returns full short token", () => {
    expect(deviceTokenSuffix("short")).toBe("short");
  });

  it("returns null for empty", () => {
    expect(deviceTokenSuffix("")).toBeNull();
    expect(deviceTokenSuffix(null)).toBeNull();
  });
});

describe("isPushEventAllowedForInn", () => {
  it("uses activation registry when present", () => {
    expect(
      isPushEventAllowedForInn({
        activation: { delivered: true, bill_created: false },
        prefs: { delivered: false, bill_created: true },
        eventId: "delivered",
      }),
    ).toBe(true);
    expect(
      isPushEventAllowedForInn({
        activation: { delivered: true, bill_created: false },
        prefs: { delivered: true, bill_created: true },
        eventId: "bill_created",
      }),
    ).toBe(false);
  });

  it("falls back to prefs when activation is missing", () => {
    expect(
      isPushEventAllowedForInn({
        activation: null,
        prefs: { bill_created: true },
        eventId: "bill_created",
      }),
    ).toBe(true);
    expect(
      isPushEventAllowedForInn({
        activation: null,
        prefs: {},
        eventId: "delivered",
      }),
    ).toBe(false);
  });

  it("falls back to prefs for new event ids missing from activation registry", () => {
    expect(
      isPushEventAllowedForInn({
        activation: { bill_created: true },
        prefs: {},
        eventId: "planned_delivery_date",
      }),
    ).toBe(true);
    expect(
      isPushEventAllowedForInn({
        activation: { bill_created: true },
        prefs: {},
        eventId: "app_update",
      }),
    ).toBe(true);
  });
});

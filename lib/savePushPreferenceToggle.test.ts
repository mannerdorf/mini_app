import { describe, expect, it } from "vitest";
import { applyPushPreferenceToggle } from "./notificationEmailPrefs.js";

describe("savePushPreferenceToggle helpers", () => {
  it("persists arrived=true without dropping sent", () => {
    const saved = applyPushPreferenceToggle({ sent: true, arrived: false }, "arrived", true);
    expect(saved.sent).toBe(true);
    expect(saved.arrived).toBe(true);
  });

  it("persists delivery_scheduled=true without dropping arrived", () => {
    const saved = applyPushPreferenceToggle(
      { sent: true, arrived: true, delivery_scheduled: false },
      "delivery_scheduled",
      true,
    );
    expect(saved.arrived).toBe(true);
    expect(saved.delivery_scheduled).toBe(true);
  });
});

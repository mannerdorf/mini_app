import { describe, expect, it } from "vitest";
import { defaultProfileViewAfterRegisteredLogin } from "./registeredLoginLanding";

describe("registeredLoginLanding", () => {
  it("opens driver pickup for driver-only", () => {
    expect(defaultProfileViewAfterRegisteredLogin({ driver: true })).toBe(
      "pickupDriver",
    );
  });

  it("prefers dispatch when dispatcher is enabled", () => {
    expect(
      defaultProfileViewAfterRegisteredLogin({ driver: true, dispatcher: true }),
    ).toBe("pickupDispatch");
  });

  it("returns null when LK permissions need a customer", () => {
    expect(defaultProfileViewAfterRegisteredLogin({ driver: true, cargo: true })).toBe(
      null,
    );
  });
});

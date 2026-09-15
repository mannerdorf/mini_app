import { describe, expect, it } from "vitest";
import { isPickupStandaloneAccount, pickupStandaloneMode } from "./pickupStandaloneApp";

describe("pickupStandaloneApp", () => {
  it("treats driver-only as standalone", () => {
    const perms = { driver: true, home: false, cargo: false };
    expect(isPickupStandaloneAccount({ isRegisteredUser: true, permissions: perms })).toBe(
      true,
    );
    expect(pickupStandaloneMode({ isRegisteredUser: true, permissions: perms })).toBe(
      "driver",
    );
  });

  it("prefers dispatch when dispatcher is enabled", () => {
    const perms = { driver: true, dispatcher: true };
    expect(pickupStandaloneMode({ isRegisteredUser: true, permissions: perms })).toBe(
      "dispatch",
    );
  });

  it("is not standalone when cargo is enabled", () => {
    expect(
      isPickupStandaloneAccount({
        isRegisteredUser: true,
        permissions: { driver: true, cargo: true },
      }),
    ).toBe(false);
  });
});

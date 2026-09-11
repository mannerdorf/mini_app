import { describe, expect, it } from "vitest";
import { guestPathForScreen, parseGuestRoute } from "./guestRoutes";

describe("parseGuestRoute", () => {
  it("maps landing paths to route-landing with direction", () => {
    expect(parseGuestRoute("/perevozka-moskva-kaliningrad", "").screen).toBe("route-landing");
    expect(parseGuestRoute("/perevozka-moskva-kaliningrad", "").direction).toBe("mow_kgd");
    expect(parseGuestRoute("/perevozka-kaliningrad-moskva", "").direction).toBe("kgd_mow");
  });

  it("maps calculator with direction query", () => {
    const state = parseGuestRoute("/kalkulyator", "direction=kgd_mow");
    expect(state.screen).toBe("calculator");
    expect(state.direction).toBe("kgd_mow");
  });

  it("maps public guest paths", () => {
    expect(parseGuestRoute("/faq", "").screen).toBe("faq");
    expect(parseGuestRoute("/sklady", "").screen).toBe("warehouses");
  });
});

describe("guestPathForScreen", () => {
  it("builds calculator path with direction", () => {
    expect(guestPathForScreen("calculator", "mow_kgd")).toBe("/kalkulyator?direction=mow_kgd");
  });
});

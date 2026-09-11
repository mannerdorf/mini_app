import { describe, expect, it } from "vitest";
import { isAppPathKnown } from "./notFoundRoute";

describe("isAppPathKnown", () => {
  it("allows guest SEO paths", () => {
    expect(isAppPathKnown("/kalkulyator")).toBe(true);
    expect(isAppPathKnown("/perevozka-moskva-kaliningrad")).toBe(true);
    expect(isAppPathKnown("/faq")).toBe(true);
  });

  it("rejects unknown paths", () => {
    expect(isAppPathKnown("/unknown-page")).toBe(false);
  });
});

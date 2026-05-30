import { describe, expect, it } from "vitest";
import { normCargoKey, normalizeTransportName } from "./documentsPipeline";

describe("normCargoKey", () => {
  it("trims and strips leading zeros", () => {
    expect(normCargoKey("  00123  ")).toBe("123");
  });

  it("returns empty for null", () => {
    expect(normCargoKey(null)).toBe("");
  });
});

describe("normalizeTransportName", () => {
  it("normalizes container id", () => {
    expect(normalizeTransportName("MSKU1234567")).toBe("MSKU 1234567");
  });
});

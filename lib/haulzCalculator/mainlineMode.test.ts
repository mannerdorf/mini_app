import { describe, expect, it } from "vitest";
import {
  compareMainlineModeOrder,
  isMainlineMode,
  mainlineModeLabelQuoteLine,
  mainlineModeLabelRu,
  parseMainlineMode,
} from "./mainlineMode.js";

describe("mainlineMode", () => {
  it("parses known modes", () => {
    expect(parseMainlineMode("auto")).toBe("auto");
    expect(parseMainlineMode("Авиа")).toBe("air");
    expect(parseMainlineMode("ferry")).toBe("ferry");
    expect(parseMainlineMode("unknown", "auto")).toBe("auto");
  });

  it("labels modes in Russian", () => {
    expect(mainlineModeLabelRu("air")).toBe("Авиа");
    expect(mainlineModeLabelQuoteLine("air")).toBe("авиа");
    expect(isMainlineMode("air")).toBe(true);
    expect(isMainlineMode("train")).toBe(false);
  });

  it("orders auto before ferry before air", () => {
    expect(compareMainlineModeOrder("auto", "ferry")).toBeLessThan(0);
    expect(compareMainlineModeOrder("ferry", "air")).toBeLessThan(0);
  });
});

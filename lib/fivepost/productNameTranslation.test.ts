import { describe, expect, it } from "vitest";
import {
  applyProductNameTranslation,
  collectUniqueProductNameTranslationKeys,
  productNameTranslationKey,
  splitProductNamePrefix,
} from "./productNameTranslation";
import { translationLooksSuccessful } from "../haulzReturns/textLanguage";

describe("splitProductNamePrefix", () => {
  it("splits article code from english description", () => {
    expect(splitProductNamePrefix("0460 jewelry components")).toEqual({
      prefix: "0460 ",
      core: "jewelry components",
    });
  });

  it("keeps plain english as core", () => {
    expect(splitProductNamePrefix("usb adapter")).toEqual({
      prefix: "",
      core: "usb adapter",
    });
  });
});

describe("applyProductNameTranslation", () => {
  it("reapplies prefix after core translation", () => {
    const map = new Map<string, string>([["jewelry components", "компоненты для ювелирных изделий"]]);
    expect(applyProductNameTranslation("0460 jewelry components", map)).toBe(
      "0460 компоненты для ювелирных изделий",
    );
  });
});

describe("collectUniqueProductNameTranslationKeys", () => {
  it("deduplicates cores", () => {
    const keys = collectUniqueProductNameTranslationKeys([
      "0460 jewelry components",
      "0461 jewelry components",
      "usb adapter",
    ]);
    expect(keys.sort()).toEqual(["jewelry components", "usb adapter"]);
    expect(productNameTranslationKey("0460 jewelry components")).toBe("jewelry components");
  });
});

describe("translationLooksSuccessful", () => {
  it("detects russian output", () => {
    expect(translationLooksSuccessful("jewelry components", "компоненты для ювелирных изделий")).toBe(true);
    expect(translationLooksSuccessful("jewelry components", "jewelry components")).toBe(false);
  });
});

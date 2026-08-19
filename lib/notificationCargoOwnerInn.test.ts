import { describe, expect, it } from "vitest";
import {
  cargoNumberLookupKeys,
  notificationCargoBelongsToInn,
  resolveNotificationCargoOwnerInn,
} from "./notificationCargoOwnerInn.js";

describe("cargoNumberLookupKeys", () => {
  it("includes raw and normalized forms", () => {
    const keys = cargoNumberLookupKeys("000141572");
    expect(keys).toContain("000141572");
    expect(keys).toContain("141572");
  });
});

describe("resolveNotificationCargoOwnerInn", () => {
  it("reads INN from item fields", () => {
    expect(resolveNotificationCargoOwnerInn({ INN: "7820046291", Number: "1" })).toBe("7820046291");
  });

  it("falls back to cache map", () => {
    const cache = new Map<string, string>([["141572", "170110375480"]]);
    expect(
      resolveNotificationCargoOwnerInn({ Number: "000141572" }, cache),
    ).toBe("170110375480");
  });
});

describe("notificationCargoBelongsToInn", () => {
  it("prefers cache over wrong INN in item", () => {
    const cache = new Map<string, string>([["141572", "170110375480"]]);
    expect(
      resolveNotificationCargoOwnerInn({ Number: "000141572", INN: "7820046291" }, cache),
    ).toBe("170110375480");
  });

  it("rejects Goncharov cargo under Autopiter poll INN", () => {
    const cache = new Map<string, string>([["141572", "170110375480"]]);
    expect(
      notificationCargoBelongsToInn({ Number: "000141572" }, "7820046291", cache),
    ).toBe(false);
  });

  it("accepts matching owner", () => {
    const cache = new Map<string, string>([["141572", "170110375480"]]);
    expect(
      notificationCargoBelongsToInn(
        { Number: "000141572", INN: "170110375480" },
        "170110375480",
        cache,
      ),
    ).toBe(true);
  });

  it("rejects when owner unknown", () => {
    expect(notificationCargoBelongsToInn({ Number: "999999999" }, "7820046291")).toBe(false);
  });
});

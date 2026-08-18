import { describe, expect, it } from "vitest";
import { mergeCompanyNames } from "./adminPushSubscribers.js";

describe("mergeCompanyNames", () => {
  it("normalizes INN, drops duplicates, and fills names", () => {
    const names = new Map([
      ["7820046291", "АВТОПИТЕР"],
      ["7707083893", "Сбер"],
    ]);
    expect(
      mergeCompanyNames(["ИНН 7820 046291", "7820046291", "7707083893"], names),
    ).toEqual([
      { inn: "7820046291", name: "АВТОПИТЕР" },
      { inn: "7707083893", name: "Сбер" },
    ]);
  });

  it("falls back to INN when the name is unknown", () => {
    expect(mergeCompanyNames(["390103058713"], new Map())).toEqual([
      { inn: "390103058713", name: "390103058713" },
    ]);
  });
});

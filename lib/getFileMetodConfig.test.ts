import { describe, expect, it } from "vitest";
import {
  isHaulzGetFileMetod,
  normalizeGetFileNumber,
  shouldNormalizePerevozkaNumberForGetFile,
} from "./getFileMetodConfig.js";

describe("getFileMetodConfig", () => {
  it("uses Haulz auth for ЭР / АПП / Счет / Акт / Реестр", () => {
    expect(isHaulzGetFileMetod("ЭР")).toBe(true);
    expect(isHaulzGetFileMetod("АПП")).toBe(true);
    expect(isHaulzGetFileMetod("Счет")).toBe(true);
    expect(isHaulzGetFileMetod("Акт")).toBe(true);
    expect(isHaulzGetFileMetod("РеестрКсчету")).toBe(true);
  });

  it("pads cargo numbers for Счет/Акт like ЭР", () => {
    expect(normalizeGetFileNumber("Счет", "142111")).toBe("000142111");
    expect(normalizeGetFileNumber("Акт", "139082")).toBe("000139082");
    expect(normalizeGetFileNumber("ЭР", "107984")).toBe("000107984");
  });

  it("does not pad invoice-style numbers with dash", () => {
    expect(shouldNormalizePerevozkaNumberForGetFile("Счет", "0000-001390")).toBe(false);
    expect(normalizeGetFileNumber("Счет", "0000-001390")).toBe("0000-001390");
    expect(normalizeGetFileNumber("РеестрКсчету", "0000-001390")).toBe("0000-001390");
  });
});

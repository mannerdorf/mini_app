import { describe, expect, it } from "vitest";
import { isValidInn, normalizeInn, partyFullNameFromData } from "./findPartyByInn.js";

describe("findPartyByInn", () => {
  it("normalizes inn digits", () => {
    expect(normalizeInn("77 0708 3893")).toBe("7707083893");
  });

  it("validates inn length", () => {
    expect(isValidInn("7707083893")).toBe(true);
    expect(isValidInn("325506275105")).toBe(true);
    expect(isValidInn("123")).toBe(false);
  });

  it("extracts legal full name", () => {
    const name = partyFullNameFromData({
      type: "LEGAL",
      name: { full_with_opf: 'ООО "Ромашка"', short_with_opf: 'ООО "Ромашка"' },
    });
    expect(name).toBe('ООО "Ромашка"');
  });

  it("extracts individual fio", () => {
    const name = partyFullNameFromData({
      type: "INDIVIDUAL",
      fio: { surname: "Иванов", name: "Иван", patronymic: "Иванович" },
    });
    expect(name).toBe("Иванов Иван Иванович");
  });
});

import { describe, expect, it } from "vitest";
import { extractCargoLastMileMeta, plateWithoutRegion } from "./cargoLastMileMeta.js";

describe("plateWithoutRegion", () => {
  it("strips region after slash", () => {
    expect(plateWithoutRegion("У706АР/39")).toBe("У706АР");
  });
});

describe("extractCargoLastMileMeta", () => {
  it("reads LM fields with fallbacks", () => {
    const meta = extractCargoLastMileMeta({
      LMAutoReg: "У706АР/39",
      LMAutoType: "Мерседес",
      LMDriver: "Ругалев Иван Федорович",
      LMDriverTel: "+79953889445",
    });
    expect(meta).toEqual({
      autoReg: "У706АР",
      autoType: "Мерседес",
      driver: "Ругалев Иван Федорович",
      driverTel: "+79953889445",
    });
  });

  it("falls back to AutoReg/DriverTel", () => {
    const meta = extractCargoLastMileMeta({
      AutoReg: "A123BC/77",
      AutoType: "Газель",
      Driver: "Иванов",
      DriverTel: "+79001234567",
    });
    expect(meta.autoReg).toBe("A123BC");
    expect(meta.autoType).toBe("Газель");
    expect(meta.driver).toBe("Иванов");
    expect(meta.driverTel).toBe("+79001234567");
  });

  it("reads nested GetPerevozka response", () => {
    const meta = extractCargoLastMileMeta({
      Response: {
        LMDriver: "Петров",
        LMDriverTel: "+79991112233",
        LMAutoReg: "X123XX/77",
        LMAutoType: "Ford",
      },
    });
    expect(meta.driver).toBe("Петров");
    expect(meta.driverTel).toBe("+79991112233");
    expect(meta.autoReg).toBe("X123XX");
    expect(meta.autoType).toBe("Ford");
  });
});

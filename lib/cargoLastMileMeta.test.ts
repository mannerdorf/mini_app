import { describe, expect, it } from "vitest";
import {
  extractCargoLastMileMeta,
  hasCargoLastMileMeta,
  hasLastMileForPush,
  lastMileFieldsForPushMerge,
  looksLikeVehiclePlate,
  plateWithoutRegion,
} from "./cargoLastMileMeta.js";

describe("plateWithoutRegion", () => {
  it("strips region after slash", () => {
    expect(plateWithoutRegion("У706АР/39")).toBe("У706АР");
  });
});

describe("looksLikeVehiclePlate", () => {
  it("accepts typical Russian plate", () => {
    expect(looksLikeVehiclePlate("У706АР/39")).toBe(true);
    expect(looksLikeVehiclePlate("A123BC")).toBe(true);
  });

  it("rejects vehicle name or transit type", () => {
    expect(looksLikeVehiclePlate("Мерседес")).toBe(false);
    expect(looksLikeVehiclePlate("Авто")).toBe(false);
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

  it("does not treat TypeOfTransit as last-mile vehicle", () => {
    const meta = extractCargoLastMileMeta({
      Number: "000141572",
      TypeOfTransit: "Авто",
      TypeOfTranzit: "Авто",
    });
    expect(meta.autoType).toBe("");
    expect(meta.autoReg).toBe("");
    expect(meta.driver).toBe("");
    expect(hasCargoLastMileMeta({ Number: "000141572", TypeOfTransit: "Авто" })).toBe(false);
  });

  it("does not treat vehicle name in АвтомобильCMRНаименование as plate", () => {
    const meta = extractCargoLastMileMeta({
      Number: "000141572",
      АвтомобильCMRНаименование: "Мерседес Sprinter",
    });
    expect(meta.autoReg).toBe("");
    expect(meta.autoType).toBe("Мерседес Sprinter");
    expect(hasLastMileForPush({ Number: "000141572", АвтомобильCMRНаименование: "Мерседес Sprinter" })).toBe(false);
  });

  it("ignores generic FIO on list payload", () => {
    expect(
      hasLastMileForPush({
        Number: "000141572",
        ФИО: "Гончаров Р.О.",
      }),
    ).toBe(false);
  });

  it("reads nested LastMile object", () => {
    const meta = extractCargoLastMileMeta({
      Number: "000141572",
      TypeOfTransit: "Авто",
      LastMile: {
        Driver: "Сидоров",
        DriverTel: "+79990001122",
        AutoReg: "У706АР/39",
        AutoType: "Мерседес",
      },
    });
    expect(meta.driver).toBe("Сидоров");
    expect(meta.driverTel).toBe("+79990001122");
    expect(meta.autoReg).toBe("У706АР");
    expect(meta.autoType).toBe("Мерседес");
    expect(hasCargoLastMileMeta({ LastMile: { Driver: "Сидоров", AutoReg: "У706АР/39" } })).toBe(true);
  });

  it("maps overlay LM fields for push merge", () => {
    const fields = lastMileFieldsForPushMerge({
      Driver: "Иванов",
      AutoReg: "A111AA/39",
      AutoType: "Газель",
      DriverTel: "+7999",
    });
    expect(fields.LMDriver).toBe("Иванов");
    expect(fields.LMAutoReg).toBe("A111AA");
    expect(fields.LMAutoType).toBe("Газель");
    expect(fields.LMDriverTel).toBe("+7999");
  });
});
